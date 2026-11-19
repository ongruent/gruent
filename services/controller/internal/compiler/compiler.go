// Package compiler compiles a stored channel configuration into its artifacts (see package plan).
//
// Publication and soft compilation share this package: both run the same semantic validation and type
// resolution, so the diagnostics shown while editing are the publish-time requirements. Soft compilation
// only discards the artifacts instead of uploading them.
package compiler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/flatbuffers"
	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// ErrNotFound is returned by a Resolver when a dependency does not exist.
var ErrNotFound = errors.New("not found")

// ModelRecord is a stored model.
type ModelRecord struct {
	ID         string
	Name       string
	Attributes []byte
}

// ConnectionRecord is a stored connection, including attributes that may hold secret names.
type ConnectionRecord struct {
	ID         string
	Name       string
	Category   string
	Revision   string
	Attributes []byte
}

// Resolver looks up the dependencies of a channel within a space.
type Resolver interface {
	Model(ctx context.Context, spaceID, modelID string) (ModelRecord, error)
	Connection(ctx context.Context, spaceID, connectionID string) (ConnectionRecord, error)
}

// Input is a channel to compile.
type Input struct {
	OrgID       string
	SpaceID     string
	ChannelID   string
	ChannelName string
	// Config is the channel configuration as stored in app.channels.config.
	Config []byte
}

// Diagnostic is a validation result.
type Diagnostic = types.Diagnostic

// Result is the outcome of a compilation.
type Result struct {
	// Diagnostics lists errors, which block publication, and warnings.
	Diagnostics []Diagnostic
	// Types are the resolved types of every step, sorted by step ID.
	Types []types.Resolved
	// Artifacts is nil if there are errors.
	Artifacts *Artifacts
}

// HasErrors reports whether any diagnostic is an error.
func (r *Result) HasErrors() bool {
	return hasErrors(r.Diagnostics)
}

// Artifacts are the compiled artifacts and their canonical encodings.
type Artifacts struct {
	Plan    plan.Plan
	Bundle  plan.DependencyBundle
	Routing plan.RoutingArtifact

	EncodedPlan    plan.Encoded
	EncodedBundle  plan.Encoded
	EncodedSchema  plan.Encoded
	EncodedRouting plan.Encoded
}

// Refs returns the identities and encodings of every artifact, in upload order: an artifact is uploaded
// after the artifacts it references.
func (a *Artifacts) Refs() []EncodedArtifact {
	metadata := a.Plan.Metadata
	return []EncodedArtifact{
		{Ref: artifacts.Ref(metadata, plan.ArtifactPayloadSchema, a.EncodedSchema), Data: a.EncodedSchema.Data},
		{Ref: artifacts.Ref(metadata, plan.ArtifactDependencyBundle, a.EncodedBundle), Data: a.EncodedBundle.Data},
		{Ref: artifacts.Ref(metadata, plan.ArtifactPlan, a.EncodedPlan), Data: a.EncodedPlan.Data},
		{Ref: artifacts.Ref(metadata, plan.ArtifactRouting, a.EncodedRouting), Data: a.EncodedRouting.Data},
	}
}

// EncodedArtifact is an artifact's identity and encoding.
type EncodedArtifact struct {
	Ref  plan.ArtifactRef
	Data []byte
}

// Error is returned by publication when a channel does not compile.
type Error struct {
	Diagnostics []Diagnostic
}

func (e *Error) Error() string {
	var messages []string
	for _, diagnostic := range e.Diagnostics {
		if diagnostic.Severity == types.SeverityError {
			messages = append(messages, diagnostic.Message)
		}
	}
	return "channel does not compile: " + strings.Join(messages, "; ")
}

// Supported HTTP methods of HTTP sources.
var httpMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}

// Bounds of an HTTP source's response timeout, in seconds.
const (
	minHTTPResponseTimeout = 1
	maxHTTPResponseTimeout = 30
)

// Compile validates a channel, resolves its types, and compiles its artifacts if there are no errors.
// Problems with the configuration are reported as diagnostics; the error is only set when compilation
// could not run, e.g. because the Resolver failed.
func Compile(ctx context.Context, input Input, resolver Resolver) (*Result, error) {
	c := &compilation{input: input, resolver: resolver, models: map[string]resolvedModel{}}
	return c.run(ctx)
}

type compilation struct {
	input       Input
	resolver    Resolver
	diagnostics []Diagnostic
	models      map[string]resolvedModel
}

type resolvedModel struct {
	record ModelRecord
	t      types.Type
}

func (c *compilation) errorf(code, stepID, path, format string, args ...any) {
	c.diagnostics = append(c.diagnostics, types.Errorf(code, stepID, path, format, args...))
}

func (c *compilation) run(ctx context.Context) (*Result, error) {
	var config channelConfig
	if err := json.NewDecoder(bytes.NewReader(c.input.Config)).Decode(&config); err != nil {
		c.errorf("invalid_config", "", "", "invalid channel configuration: %v", err)
		return &Result{Diagnostics: c.diagnostics, Types: []types.Resolved{}}, nil
	}

	policies := c.policies(config.Runtime)
	graph, sources := c.graph(config)
	bindings := c.bindings(sources)
	if err := c.resolveModels(ctx, graph.Steps); err != nil {
		return nil, err
	}
	connections, err := c.resolveConnections(ctx, graph.Steps)
	if err != nil {
		return nil, err
	}

	resolved, typeDiagnostics := types.ResolveGraph(c.typeSteps(config), typeEdges(graph))
	c.diagnostics = append(c.diagnostics, typeDiagnostics...)
	result := &Result{Types: sortedResolved(resolved)}

	if !hasErrors(c.diagnostics) {
		artifacts, err := c.artifacts(graph, bindings, policies, result.Types, connections)
		if err != nil {
			return nil, err
		}
		result.Artifacts = artifacts
	}
	result.Diagnostics = c.diagnostics
	if result.Diagnostics == nil {
		result.Diagnostics = []Diagnostic{}
	}
	return result, nil
}

func (c *compilation) metadata() plan.Metadata {
	return plan.Metadata{OrgID: c.input.OrgID, SpaceID: c.input.SpaceID, ChannelID: c.input.ChannelID, ChannelName: c.input.ChannelName}
}

// artifacts builds and encodes the payload schema, dependency bundle, plan and routing artifact, in that
// order, since each references the previous ones by version.
func (c *compilation) artifacts(graph plan.Graph, bindings plan.Bindings, policies plan.Policies, resolved []types.Resolved, connections []plan.Connection) (*Artifacts, error) {
	metadata := c.metadata()

	// Every step payload and every model gets a root table in the payload schema.
	var roots []types.Type
	for _, step := range resolved {
		for _, t := range []*types.Type{step.Input, step.Output} {
			if t != nil {
				roots = append(roots, *t)
			}
		}
	}
	modelIDs := sortedKeys(c.models)
	for _, id := range modelIDs {
		roots = append(roots, c.models[id].t)
	}
	schema := flatbuffers.Generate(roots)
	encodedSchema := plan.Encoded{Data: []byte(schema.Source), Version: plan.Digest([]byte(schema.Source))}
	payload := func(t *types.Type) *plan.Payload {
		if t == nil {
			return nil
		}
		return &plan.Payload{Table: schema.Roots[t.ID()], TypeID: t.ID(), ModelRef: t.ModelRef, Type: *t}
	}

	bundle := plan.DependencyBundle{
		APIVersion:   plan.APIVersion,
		Kind:         plan.KindDependencyBundle,
		Metadata:     metadata,
		Models:       []plan.Model{},
		Connections:  connections,
		Secrets:      []plan.Secret{},
		Certificates: []plan.Certificate{},
	}
	for _, id := range modelIDs {
		model := c.models[id]
		attributes, err := plan.Canonicalize(model.record.Attributes)
		if err != nil {
			return nil, fmt.Errorf("model %s attributes: %w", id, err)
		}
		bundle.Models = append(bundle.Models, plan.Model{
			ID:         id,
			Name:       model.record.Name,
			Revision:   plan.Digest(attributes),
			Attributes: attributes,
			Payload:    *payload(&model.t),
		})
	}
	bundle.Secrets, bundle.Certificates = sensitiveReferences(connections)
	encodedBundle, err := plan.Encode(bundle)
	if err != nil {
		return nil, fmt.Errorf("encode dependency bundle: %w", err)
	}

	stepPayloads := []plan.StepPayload{}
	for _, step := range resolved {
		stepPayloads = append(stepPayloads, plan.StepPayload{StepID: step.StepID, Input: payload(step.Input), Output: payload(step.Output)})
	}
	p := plan.Plan{
		APIVersion:      plan.APIVersion,
		Kind:            plan.KindPlan,
		Metadata:        metadata,
		PublishStrategy: plan.PublishStrategy{Mode: plan.PublishStrategyReplace},
		Channel:         plan.Channel{Name: c.input.ChannelName, Graph: graph},
		Bindings:        bindings,
		Payloads: plan.Payloads{
			Encoding:  plan.PayloadEncodingFlatBuffers,
			Schema:    artifacts.Ref(metadata, plan.ArtifactPayloadSchema, encodedSchema),
			Namespace: flatbuffers.Namespace,
			Steps:     stepPayloads,
		},
		Dependencies: artifacts.Ref(metadata, plan.ArtifactDependencyBundle, encodedBundle),
		Policies:     policies,
	}
	encodedPlan, err := plan.Encode(p)
	if err != nil {
		return nil, fmt.Errorf("encode plan: %w", err)
	}

	routing := plan.RoutingArtifact{
		APIVersion:  plan.APIVersion,
		Kind:        plan.KindSourceRouting,
		Metadata:    metadata,
		PlanVersion: encodedPlan.Version,
		Bindings:    bindings,
		InputModels: inputModels(bindings, bundle.Models),
		Concurrency: policies.Runtime.Concurrency,
	}
	encodedRouting, err := plan.Encode(routing)
	if err != nil {
		return nil, fmt.Errorf("encode routing artifact: %w", err)
	}

	return &Artifacts{
		Plan:           p,
		Bundle:         bundle,
		Routing:        routing,
		EncodedPlan:    encodedPlan,
		EncodedBundle:  encodedBundle,
		EncodedSchema:  encodedSchema,
		EncodedRouting: encodedRouting,
	}, nil
}

// policies builds the runtime and deployment policies from the user's settings. The memory budget and
// the concurrency limit are required. The queue defaults to none, so excess work overflows immediately.
func (c *compilation) policies(runtime runtimeConfig) plan.Policies {
	policies := plan.Policies{
		Runtime: plan.RuntimePolicy{ExecutionClass: plan.ExecutionClassStandard},
		Deployment: plan.DeploymentPolicy{
			Resources: plan.Resources{AllocationMode: plan.AllocationModeStatic},
		},
	}

	if runtime.MemoryMiB == nil {
		c.errorf("memory_budget_required", "", "/runtime/memoryMiB", "runtime.memoryMiB is required: set the channel's memory budget")
	} else {
		policies.Deployment.Resources.MemoryMiB = *runtime.MemoryMiB
		policies.Deployment.Resources.MemoryReservationMiB = *runtime.MemoryMiB
	}
	if runtime.MaxConcurrentExecutions == nil {
		c.errorf("concurrency_limit_required", "", "/runtime/maxConcurrentExecutions", "runtime.maxConcurrentExecutions is required: set the channel's maximum number of in-flight executions")
	} else {
		policies.Runtime.Concurrency.MaxConcurrentExecutions = *runtime.MaxConcurrentExecutions
	}
	if runtime.MaxQueuedExecutions != nil {
		policies.Runtime.Concurrency.MaxQueuedExecutions = *runtime.MaxQueuedExecutions
	}
	if runtime.MaxInvocationMs != nil {
		policies.Runtime.Timeouts.MaxInvocationMs = *runtime.MaxInvocationMs
	}

	// Range problems are only meaningful once the required values are set.
	if runtime.MemoryMiB != nil && runtime.MaxConcurrentExecutions != nil {
		for _, problem := range policies.Validate() {
			c.errorf("invalid_policy", "", "/runtime", "%s", problem)
		}
	}

	return policies
}

// graph builds the sorted step graph, validates its structure, and returns the source steps.
func (c *compilation) graph(config channelConfig) (plan.Graph, []sourceStep) {
	graph := plan.Graph{Steps: []plan.Step{}, Edges: []plan.Edge{}}
	var sources []sourceStep
	stepIDs := map[string]bool{}

	if len(config.Nodes) == 0 {
		c.errorf("no_steps", "", "/nodes", "channel has no steps")
	}

	for _, node := range config.Nodes {
		if node.ID == "" {
			c.errorf("missing_step_id", "", "/nodes", "a step has no ID")
			continue
		}
		if stepIDs[node.ID] {
			c.errorf("duplicate_step_id", node.ID, "", "step ID %s is used more than once", node.ID)
			continue
		}
		stepIDs[node.ID] = true

		step, ok := c.step(node)
		if !ok {
			continue
		}
		if node.Metadata.Type == "source" {
			sources = append(sources, sourceStep{step: step, config: node.Metadata.Config})
		}
		graph.Steps = append(graph.Steps, step)
	}

	if len(config.Nodes) > 0 && len(sources) != 1 {
		c.errorf("source_count", "", "/nodes", "channel must have exactly one source step, found %d", len(sources))
	}

	edgeKeys := map[plan.Edge]bool{}
	incoming := map[string]int{}
	for _, e := range config.Edges {
		edge := plan.Edge{From: e.From.NodeID, FromPort: e.From.IoID, To: e.To.NodeID, ToPort: e.To.IoID}
		if !stepIDs[edge.From] || !stepIDs[edge.To] {
			c.errorf("unknown_edge_step", "", "/edges", "edge from %s to %s references a step that does not exist", edge.From, edge.To)
			continue
		}
		if edge.From == edge.To {
			c.errorf("self_edge", edge.From, "", "edge connects step %s to itself", edge.From)
			continue
		}
		if edgeKeys[edge] {
			c.errorf("duplicate_edge", edge.To, "", "edge from %s to %s is duplicated", edge.From, edge.To)
			continue
		}
		edgeKeys[edge] = true
		incoming[edge.To]++
		graph.Edges = append(graph.Edges, edge)
	}
	for _, source := range sources {
		if incoming[source.step.ID] > 0 {
			c.errorf("source_with_input", source.step.ID, "", "source step %s cannot have incoming edges", source.step.ID)
		}
	}
	if hasCycle(graph) {
		c.errorf("cycle", "", "/edges", "channel graph contains a cycle")
	}

	slices.SortFunc(graph.Steps, func(a, b plan.Step) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(graph.Edges, func(a, b plan.Edge) int {
		return strings.Compare(
			strings.Join([]string{a.From, a.FromPort, a.To, a.ToPort}, "\x00"),
			strings.Join([]string{b.From, b.FromPort, b.To, b.ToPort}, "\x00"),
		)
	})
	return graph, sources
}

// step validates a stored step and converts it into a plan step.
func (c *compilation) step(node nodeConfig) (plan.Step, bool) {
	metadata := node.Metadata
	if metadata.Type == "" || metadata.Label == "" {
		c.errorf("missing_step_type", node.ID, "", "step %s has no type", node.ID)
	}
	config, err := plan.Canonicalize(metadata.Config)
	if err != nil {
		c.errorf("invalid_step_config", node.ID, "/config", "step %s has an invalid configuration: %v", node.ID, err)
		return plan.Step{}, false
	}

	step := plan.Step{
		ID:             node.ID,
		Type:           metadata.Type + "." + metadata.Label,
		Version:        metadata.Version,
		Name:           metadata.Name,
		Config:         config,
		ModelRefs:      []string{},
		ConnectionRefs: []string{},
	}
	for _, model := range metadata.Dependencies.Models {
		if model.ModelID == "" || model.ModelID == unsetReference {
			c.errorf("model_not_selected", node.ID, "/"+model.FieldName, "step %s (%s) has no model selected for %s", node.ID, metadata.Name, model.FieldName)
			continue
		}
		step.ModelRefs = appendUnique(step.ModelRefs, model.ModelID)
	}
	for _, connection := range metadata.Dependencies.Things {
		// Internal connections are provided by the platform, e.g. the HTTP server of an HTTP source.
		if connection.Internal {
			continue
		}
		if connection.ThingID == "" || connection.ThingID == unsetReference {
			c.errorf("connection_not_selected", node.ID, "/"+connection.FieldName, "step %s (%s) has no connection selected for %s", node.ID, metadata.Name, connection.FieldName)
			continue
		}
		step.ConnectionRefs = appendUnique(step.ConnectionRefs, connection.ThingID)
	}
	slices.Sort(step.ModelRefs)
	slices.Sort(step.ConnectionRefs)
	if metadata.Type == "source" {
		step.BindingRef = "bind_" + node.ID
	}
	return step, true
}

type sourceStep struct {
	step   plan.Step
	config json.RawMessage
}

// bindings compiles source steps into bindings. A source type is only supported once its overflow
// handling is defined, so that admission is bounded for every source.
func (c *compilation) bindings(sources []sourceStep) plan.Bindings {
	bindings := plan.Bindings{HTTP: []plan.HTTPBinding{}, Timer: []plan.TimerBinding{}}

	for _, source := range sources {
		step := source.step
		switch step.Type {
		case "source.http":
			var config httpSourceConfig
			if err := json.Unmarshal(source.config, &config); err != nil {
				c.errorf("invalid_step_config", step.ID, "/config", "HTTP source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			if !slices.Contains(httpMethods, config.Method) {
				c.errorf("invalid_http_method", step.ID, "/config/method", "HTTP source %s has an unsupported method %q", step.ID, config.Method)
			}
			if config.ResponseTimeout < minHTTPResponseTimeout || config.ResponseTimeout > maxHTTPResponseTimeout {
				c.errorf("invalid_http_timeout", step.ID, "/config/responseTimeout", "HTTP source %s response timeout must be between %d and %d seconds", step.ID, minHTTPResponseTimeout, maxHTTPResponseTimeout)
			}
			bindings.HTTP = append(bindings.HTTP, plan.HTTPBinding{
				BindingID:      step.BindingRef,
				StepID:         step.ID,
				Method:         config.Method,
				Path:           fmt.Sprintf("/v1/spaces/%s/channels/%s", c.input.SpaceID, c.input.ChannelID),
				ResponseMode:   "sync",
				TimeoutMs:      config.ResponseTimeout * 1000,
				InputModelRefs: step.ModelRefs,
				// 429 Too Many Requests tells clients that they can retry later.
				Overflow: plan.Overflow{Action: plan.OverflowReject, HTTPStatus: 429},
			})
		case "source.timer":
			var config timerSourceConfig
			if err := json.Unmarshal(source.config, &config); err != nil {
				c.errorf("invalid_step_config", step.ID, "/config", "timer source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			if strings.TrimSpace(config.CronExpression) == "" {
				c.errorf("missing_cron_expression", step.ID, "/config/cronExpression", "timer source %s has no cron expression", step.ID)
			}
			bindings.Timer = append(bindings.Timer, plan.TimerBinding{
				BindingID:      step.BindingRef,
				StepID:         step.ID,
				CronExpression: config.CronExpression,
				InputModelRefs: step.ModelRefs,
				// A tick that arrives while the channel is saturated is dropped rather than queued
				// without bound; the next tick runs as scheduled.
				Overflow: plan.Overflow{Action: plan.OverflowSkip},
			})
		default:
			c.errorf("unsupported_source", step.ID, "", "source type %s is not supported yet: its handling of excess work is not defined", step.Type)
		}
	}

	return bindings
}

// resolveModels loads every model referenced by the steps and converts it into a type.
func (c *compilation) resolveModels(ctx context.Context, steps []plan.Step) error {
	var ids []string
	for _, step := range steps {
		for _, id := range step.ModelRefs {
			ids = appendUnique(ids, id)
		}
	}
	slices.Sort(ids)
	for _, id := range ids {
		record, err := c.resolver.Model(ctx, c.input.SpaceID, id)
		if errors.Is(err, ErrNotFound) {
			c.errorf("model_not_found", "", "", "model %s does not exist in this space", id)
			continue
		}
		if err != nil {
			return fmt.Errorf("resolve model %s: %w", id, err)
		}
		t, err := types.FromModel(id, record.Attributes)
		if err != nil {
			c.errorf("invalid_model", "", "", "%v", err)
			continue
		}
		c.models[id] = resolvedModel{record: record, t: t}
	}
	return nil
}

// resolveConnections loads every connection referenced by the steps and removes sensitive values.
func (c *compilation) resolveConnections(ctx context.Context, steps []plan.Step) ([]plan.Connection, error) {
	usedBy := map[string][]string{}
	for _, step := range steps {
		for _, id := range step.ConnectionRefs {
			usedBy[id] = append(usedBy[id], step.ID)
		}
	}
	connections := []plan.Connection{}
	for _, id := range sortedKeys(usedBy) {
		record, err := c.resolver.Connection(ctx, c.input.SpaceID, id)
		if errors.Is(err, ErrNotFound) {
			c.errorf("connection_not_found", usedBy[id][0], "", "connection %s does not exist in this space", id)
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("resolve connection %s: %w", id, err)
		}
		connection, err := bundleConnection(c.input.SpaceID, record)
		if err != nil {
			c.errorf("invalid_connection", usedBy[id][0], "", "%v", err)
			continue
		}
		connections = append(connections, connection)
	}
	return connections, nil
}

// typeSteps converts stored steps into the input of type resolution.
func (c *compilation) typeSteps(config channelConfig) []types.Step {
	var steps []types.Step
	seen := map[string]bool{}
	for _, node := range config.Nodes {
		if node.ID == "" || seen[node.ID] {
			continue
		}
		seen[node.ID] = true
		steps = append(steps, typeStep(node, func(id string) (types.Type, bool) {
			model, ok := c.models[id]
			return model.t, ok
		}))
	}
	return steps
}

func typeStep(node nodeConfig, model func(id string) (types.Type, bool)) types.Step {
	step := types.Step{
		ID:             node.ID,
		Category:       node.Metadata.Type,
		Label:          node.Metadata.Label,
		Models:         map[string]types.Type{},
		InputDataTypes: map[string][]string{},
	}
	for _, dependency := range node.Metadata.Dependencies.Models {
		step.DeclaredModels = append(step.DeclaredModels, dependency.FieldName)
		if t, ok := model(dependency.ModelID); ok {
			step.Models[dependency.FieldName] = t
		}
	}
	for _, input := range node.Metadata.Io.Inputs {
		if len(input.DataType) > 0 {
			step.InputDataTypes[input.ID] = input.DataType
		}
	}
	return step
}

func typeEdges(graph plan.Graph) []types.Edge {
	edges := make([]types.Edge, 0, len(graph.Edges))
	for _, edge := range graph.Edges {
		edges = append(edges, types.Edge{From: edge.From, To: edge.To, ToPort: edge.ToPort})
	}
	return edges
}

func sortedResolved(resolved map[string]types.Resolved) []types.Resolved {
	result := []types.Resolved{}
	for _, id := range sortedKeys(resolved) {
		result = append(result, resolved[id])
	}
	return result
}

// inputModels returns the revisions of the models that the bindings expect as input.
func inputModels(bindings plan.Bindings, models []plan.Model) []plan.ModelReference {
	var ids []string
	for _, binding := range bindings.HTTP {
		for _, id := range binding.InputModelRefs {
			ids = appendUnique(ids, id)
		}
	}
	for _, binding := range bindings.Timer {
		for _, id := range binding.InputModelRefs {
			ids = appendUnique(ids, id)
		}
	}

	references := []plan.ModelReference{}
	for _, model := range models {
		if slices.Contains(ids, model.ID) {
			references = append(references, plan.ModelReference{ID: model.ID, Revision: model.Revision})
		}
	}
	return references
}

// hasCycle reports whether the graph has a directed cycle.
func hasCycle(graph plan.Graph) bool {
	next := map[string][]string{}
	for _, edge := range graph.Edges {
		next[edge.From] = append(next[edge.From], edge.To)
	}
	const (
		visiting = 1
		done     = 2
	)
	state := map[string]int{}
	var visit func(id string) bool
	visit = func(id string) bool {
		switch state[id] {
		case visiting:
			return true
		case done:
			return false
		}
		state[id] = visiting
		for _, to := range next[id] {
			if visit(to) {
				return true
			}
		}
		state[id] = done
		return false
	}
	for _, step := range graph.Steps {
		if visit(step.ID) {
			return true
		}
	}
	return false
}

func hasErrors(diagnostics []Diagnostic) bool {
	return slices.ContainsFunc(diagnostics, func(d Diagnostic) bool { return d.Severity == types.SeverityError })
}

func appendUnique(values []string, value string) []string {
	if slices.Contains(values, value) {
		return values
	}
	return append(values, value)
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}
