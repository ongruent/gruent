// Package compiler compiles a stored channel configuration into an execution plan and a source
// routing artifact (see the plan package).
package compiler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// ErrNotFound is returned by a Resolver when a dependency does not exist.
var ErrNotFound = errors.New("not found")

// Resolver looks up the dependencies of a channel.
type Resolver interface {
	Model(ctx context.Context, spaceID, modelID string) (plan.Model, error)
	Connection(ctx context.Context, spaceID, connectionID string) (plan.Connection, error)
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

// Result holds the compiled artifacts and their canonical encodings.
type Result struct {
	Plan           plan.ExecutionPlan
	EncodedPlan    plan.Encoded
	Routing        plan.RoutingArtifact
	EncodedRouting plan.Encoded
}

// Error lists the problems that prevented a channel from compiling.
type Error struct {
	Problems []string
}

func (e *Error) Error() string {
	return "channel does not compile: " + strings.Join(e.Problems, "; ")
}

// Supported HTTP methods of HTTP sources.
var httpMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}

// Bounds of an HTTP source's response timeout, in seconds.
const (
	minHTTPResponseTimeout = 1
	maxHTTPResponseTimeout = 30
)

// Compile compiles a channel. Problems with the configuration are returned as an *Error. Other errors,
// such as a failing Resolver, are returned as is.
func Compile(ctx context.Context, input Input, resolver Resolver) (*Result, error) {
	c := &compilation{input: input, resolver: resolver}
	return c.run(ctx)
}

type compilation struct {
	input    Input
	resolver Resolver
	problems []string
}

func (c *compilation) problem(format string, args ...any) {
	c.problems = append(c.problems, fmt.Sprintf(format, args...))
}

func (c *compilation) run(ctx context.Context) (*Result, error) {
	var config channelConfig
	decoder := json.NewDecoder(bytes.NewReader(c.input.Config))
	if err := decoder.Decode(&config); err != nil {
		return nil, &Error{Problems: []string{fmt.Sprintf("invalid channel configuration: %v", err)}}
	}

	policies := c.policies(config.Runtime)
	graph, sources := c.graph(config)
	bindings := c.bindings(sources)
	dependencies, err := c.dependencies(ctx, graph.Steps)
	if err != nil {
		return nil, err
	}
	if len(c.problems) > 0 {
		return nil, &Error{Problems: c.problems}
	}

	executionPlan := plan.ExecutionPlan{
		APIVersion:   plan.APIVersion,
		Kind:         plan.KindExecutionPlan,
		OrgID:        c.input.OrgID,
		SpaceID:      c.input.SpaceID,
		ChannelID:    c.input.ChannelID,
		Channel:      plan.Channel{Name: c.input.ChannelName, Graph: graph},
		Bindings:     bindings,
		Dependencies: dependencies,
		Policies:     policies,
	}
	encodedPlan, err := plan.Encode(executionPlan)
	if err != nil {
		return nil, fmt.Errorf("encode execution plan: %w", err)
	}

	routing := plan.RoutingArtifact{
		APIVersion:  plan.APIVersion,
		Kind:        plan.KindSourceRouting,
		OrgID:       c.input.OrgID,
		SpaceID:     c.input.SpaceID,
		ChannelID:   c.input.ChannelID,
		PlanVersion: encodedPlan.Version,
		Bindings:    bindings,
		InputModels: inputModels(bindings, dependencies.Models),
		Concurrency: policies.Runtime.Concurrency,
	}
	encodedRouting, err := plan.Encode(routing)
	if err != nil {
		return nil, fmt.Errorf("encode routing artifact: %w", err)
	}

	return &Result{
		Plan:           executionPlan,
		EncodedPlan:    encodedPlan,
		Routing:        routing,
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
		c.problem("runtime.memoryMiB is required: set the channel's memory budget")
	} else {
		policies.Deployment.Resources.MemoryMiB = *runtime.MemoryMiB
		policies.Deployment.Resources.MemoryReservationMiB = *runtime.MemoryMiB
	}
	if runtime.MaxConcurrentExecutions == nil {
		c.problem("runtime.maxConcurrentExecutions is required: set the channel's maximum number of in-flight executions")
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
		c.problems = append(c.problems, policies.Validate()...)
	}

	return policies
}

// graph builds the sorted step graph, validates its structure, and returns the source steps.
func (c *compilation) graph(config channelConfig) (plan.Graph, []sourceStep) {
	graph := plan.Graph{Steps: []plan.Step{}, Edges: []plan.Edge{}}
	var sources []sourceStep
	stepIDs := map[string]bool{}

	if len(config.Nodes) == 0 {
		c.problem("channel has no steps")
	}

	for _, node := range config.Nodes {
		if node.ID == "" {
			c.problem("a step has no ID")
			continue
		}
		if stepIDs[node.ID] {
			c.problem("step ID %s is used more than once", node.ID)
			continue
		}
		stepIDs[node.ID] = true

		metadata := node.Metadata
		if metadata.Type == "" || metadata.Label == "" {
			c.problem("step %s has no type", node.ID)
		}
		config, err := plan.Canonicalize(metadata.Config)
		if err != nil {
			c.problem("step %s has an invalid configuration: %v", node.ID, err)
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
				c.problem("step %s (%s) has no model selected for %s", node.ID, metadata.Name, model.FieldName)
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
				c.problem("step %s (%s) has no connection selected for %s", node.ID, metadata.Name, connection.FieldName)
				continue
			}
			step.ConnectionRefs = appendUnique(step.ConnectionRefs, connection.ThingID)
		}
		slices.Sort(step.ModelRefs)
		slices.Sort(step.ConnectionRefs)

		if metadata.Type == "source" {
			step.BindingRef = "bind_" + node.ID
			sources = append(sources, sourceStep{step: step, config: metadata.Config})
		}
		graph.Steps = append(graph.Steps, step)
	}

	if len(config.Nodes) > 0 && len(sources) != 1 {
		c.problem("channel must have exactly one source step, found %d", len(sources))
	}

	edgeKeys := map[plan.Edge]bool{}
	incoming := map[string]int{}
	for _, e := range config.Edges {
		edge := plan.Edge{From: e.From.NodeID, FromPort: e.From.IoID, To: e.To.NodeID, ToPort: e.To.IoID}
		if !stepIDs[edge.From] || !stepIDs[edge.To] {
			c.problem("edge from %s to %s references a step that does not exist", edge.From, edge.To)
			continue
		}
		if edge.From == edge.To {
			c.problem("edge connects step %s to itself", edge.From)
			continue
		}
		if edgeKeys[edge] {
			c.problem("edge from %s to %s is duplicated", edge.From, edge.To)
			continue
		}
		edgeKeys[edge] = true
		incoming[edge.To]++
		graph.Edges = append(graph.Edges, edge)
	}
	for _, source := range sources {
		if incoming[source.step.ID] > 0 {
			c.problem("source step %s cannot have incoming edges", source.step.ID)
		}
	}
	if hasCycle(graph) {
		c.problem("channel graph contains a cycle")
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
				c.problem("HTTP source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			if !slices.Contains(httpMethods, config.Method) {
				c.problem("HTTP source %s has an unsupported method %q", step.ID, config.Method)
			}
			if config.ResponseTimeout < minHTTPResponseTimeout || config.ResponseTimeout > maxHTTPResponseTimeout {
				c.problem("HTTP source %s response timeout must be between %d and %d seconds", step.ID, minHTTPResponseTimeout, maxHTTPResponseTimeout)
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
				c.problem("timer source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			if strings.TrimSpace(config.CronExpression) == "" {
				c.problem("timer source %s has no cron expression", step.ID)
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
			c.problem("source type %s is not supported yet: its handling of excess work is not defined", step.Type)
		}
	}

	return bindings
}

// dependencies resolves every model and connection referenced by the steps.
func (c *compilation) dependencies(ctx context.Context, steps []plan.Step) (plan.Dependencies, error) {
	dependencies := plan.Dependencies{Models: []plan.Model{}, Connections: []plan.Connection{}}
	var modelIDs, connectionIDs []string
	for _, step := range steps {
		for _, id := range step.ModelRefs {
			modelIDs = appendUnique(modelIDs, id)
		}
		for _, id := range step.ConnectionRefs {
			connectionIDs = appendUnique(connectionIDs, id)
		}
	}
	slices.Sort(modelIDs)
	slices.Sort(connectionIDs)

	for _, id := range modelIDs {
		model, err := c.resolver.Model(ctx, c.input.SpaceID, id)
		if errors.Is(err, ErrNotFound) {
			c.problem("model %s does not exist in this space", id)
			continue
		}
		if err != nil {
			return dependencies, fmt.Errorf("resolve model %s: %w", id, err)
		}
		dependencies.Models = append(dependencies.Models, model)
	}
	for _, id := range connectionIDs {
		connection, err := c.resolver.Connection(ctx, c.input.SpaceID, id)
		if errors.Is(err, ErrNotFound) {
			c.problem("connection %s does not exist in this space", id)
			continue
		}
		if err != nil {
			return dependencies, fmt.Errorf("resolve connection %s: %w", id, err)
		}
		dependencies.Connections = append(dependencies.Connections, connection)
	}

	return dependencies, nil
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

func appendUnique(values []string, value string) []string {
	if slices.Contains(values, value) {
		return values
	}
	return append(values, value)
}
