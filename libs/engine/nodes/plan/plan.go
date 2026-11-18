// Package plan validates channel configurations against node definitions and hydrates them into runtime
// deployment plans. Everything is generic: plugin configuration stays json.RawMessage and is validated with
// the definition's own schema, so new plugins need no Go changes.
package plan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"

	"github.com/ongruent/gruent/libs/engine/nodes"
)

// Sizes are the channel runtime size tiers (carried over from the existing channel contract).
var Sizes = []string{"small", "medium", "large"}

// Channel is the persisted channel envelope.
type Channel struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Runtime Runtime `json:"runtime"`
	Nodes   []Node  `json:"nodes"`
	Edges   []Edge  `json:"edges"`
}

// Runtime holds channel-level runtime choices.
type Runtime struct {
	Size string `json:"size"`
}

// Node is one node of a channel. It persists the exact plugin identity; there is no "latest".
type Node struct {
	ID            string          `json:"id"`
	PluginType    string          `json:"pluginType"`
	PluginVersion int             `json:"pluginVersion"`
	Config        json.RawMessage `json:"config"`
}

// Identity returns the node's exact plugin identity.
func (n Node) Identity() nodes.Identity {
	return nodes.Identity{PluginType: n.PluginType, PluginVersion: n.PluginVersion}
}

// Edge connects the output of From to the input of To.
type Edge struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
}

// ResourceResolver checks that a referenced resource exists and that the channel owner may use it, e.g.
// that a secret belongs to the organization. Option lists shown in editors are never authoritative.
type ResourceResolver interface {
	Resolve(ctx context.Context, channel *Channel, node Node, ref nodes.Reference) error
}

// Policy supplies deployment details that schema validation cannot calculate. Concrete sizing and
// processing-mode policies are not specified yet, so callers must provide one explicitly.
type Policy interface {
	// Resources returns the resource requests for a channel runtime size tier.
	Resources(ctx context.Context, channel *Channel) (Resources, error)
	// ProcessingMode returns how the runtime processes a node.
	ProcessingMode(ctx context.Context, node Node, def *nodes.Definition) (string, error)
}

// Resources are opaque resource quantities chosen by a Policy (for example {"cpu": "500m"}).
type Resources map[string]string

// ValidationError groups channel-level and per-node problems.
type ValidationError struct {
	ChannelErrors []string                 `json:"channelErrors"`
	NodeErrors    map[string][]nodes.Issue `json:"nodeErrors"`
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("invalid channel: %d channel error(s), %d node(s) with errors", len(e.ChannelErrors), len(e.NodeErrors))
}

func (e *ValidationError) empty() bool { return len(e.ChannelErrors) == 0 && len(e.NodeErrors) == 0 }

func (e *ValidationError) channel(format string, args ...any) {
	e.ChannelErrors = append(e.ChannelErrors, fmt.Sprintf(format, args...))
}

func (e *ValidationError) node(id, path, format string, args ...any) {
	e.NodeErrors[id] = append(e.NodeErrors[id], nodes.Issue{Path: path, Message: fmt.Sprintf(format, args...)})
}

type resolved struct {
	node  Node
	entry nodes.Entry
}

// Validate checks the DAG, exact plugin resolution, configuration, I/O compatibility at both ends of every
// edge and, when resolver is non-nil, every resource reference. It returns *ValidationError on failure.
func Validate(ctx context.Context, ch *Channel, reg *nodes.Registry, resolver ResourceResolver) error {
	_, _, err := validate(ctx, ch, reg, resolver)
	return err
}

func validate(ctx context.Context, ch *Channel, reg *nodes.Registry, resolver ResourceResolver) (map[string]resolved, []string, error) {
	ve := &ValidationError{ChannelErrors: []string{}, NodeErrors: map[string][]nodes.Issue{}}

	if !slices.Contains(Sizes, ch.Runtime.Size) {
		ve.channel("runtime size %q must be one of %v", ch.Runtime.Size, Sizes)
	}
	if len(ch.Nodes) < 2 {
		ve.channel("a channel needs at least two nodes")
	}

	byID := map[string]resolved{}
	for _, n := range ch.Nodes {
		if n.ID == "" {
			ve.channel("node without id")
			continue
		}
		if _, dup := byID[n.ID]; dup {
			ve.channel("duplicate node id %s", n.ID)
			continue
		}
		entry, err := reg.Resolve(n.Identity())
		if err != nil {
			ve.node(n.ID, "", "%v", err)
			byID[n.ID] = resolved{node: n}
			continue
		}
		byID[n.ID] = resolved{node: n, entry: entry}
		config := n.Config
		if len(config) == 0 {
			config = json.RawMessage("{}")
		}
		issues := entry.Definition.ValidateConfig(config)
		for _, is := range issues {
			ve.node(n.ID, is.Path, "%s", is.Message)
		}
		if len(issues) == 0 && resolver != nil {
			refs, err := entry.Definition.References(config)
			if err != nil {
				ve.node(n.ID, "", "%v", err)
			}
			for _, ref := range refs {
				if err := resolver.Resolve(ctx, ch, n, ref); err != nil {
					ve.node(n.ID, ref.Path, "%s %q: %v", ref.Collection, ref.ID, err)
				}
			}
		}
	}

	// Edges: existence, duplicates, self loops, and I/O allowlists checked at both ends.
	inDegree, outDegree := map[string]int{}, map[string]int{}
	edgeIDs, pairs := map[string]bool{}, map[[2]string]bool{}
	children := map[string][]string{}
	for _, e := range ch.Edges {
		if edgeIDs[e.ID] {
			ve.channel("duplicate edge id %s", e.ID)
		}
		edgeIDs[e.ID] = true
		from, okFrom := byID[e.From]
		to, okTo := byID[e.To]
		if !okFrom || !okTo {
			ve.channel("edge %s references a missing node", e.ID)
			continue
		}
		if e.From == e.To {
			ve.channel("edge %s connects node %s to itself", e.ID, e.From)
			continue
		}
		if pairs[[2]string{e.From, e.To}] {
			ve.channel("duplicate edge from %s to %s", e.From, e.To)
			continue
		}
		pairs[[2]string{e.From, e.To}] = true
		inDegree[e.To]++
		outDegree[e.From]++
		children[e.From] = append(children[e.From], e.To)
		if from.entry.Definition == nil || to.entry.Definition == nil {
			continue
		}
		fd, td := from.entry.Definition, to.entry.Definition
		if !fd.IO.AllowsOutput(td.Category) {
			ve.channel("edge %s: %s (%s) cannot output to %s nodes", e.ID, e.From, fd.Identity(), td.Category)
		}
		if !td.IO.AcceptsInput(fd.Category) {
			ve.channel("edge %s: %s (%s) cannot accept input from %s nodes", e.ID, e.To, td.Identity(), fd.Category)
		}
	}

	// DAG shape: exactly one source; every other node has exactly one input; no hanging nodes; acyclic.
	var sources []string
	for _, n := range ch.Nodes {
		r, ok := byID[n.ID]
		if !ok || r.node.ID != n.ID {
			continue
		}
		isSource := r.entry.Definition != nil && r.entry.Definition.Category == nodes.CategorySource
		if isSource {
			sources = append(sources, n.ID)
		}
		switch {
		case inDegree[n.ID]+outDegree[n.ID] == 0:
			ve.channel("node %s has no edges", n.ID)
		case isSource && inDegree[n.ID] > 0:
			ve.channel("source node %s cannot have inputs", n.ID)
		case !isSource && inDegree[n.ID] == 0 && r.entry.Definition != nil:
			ve.channel("node %s has no input and is not a source", n.ID)
		case inDegree[n.ID] > 1:
			ve.channel("node %s has more than one input", n.ID)
		}
	}
	if len(sources) != 1 {
		ve.channel("a channel needs exactly one source node, found %d", len(sources))
	}
	order, cyclic := topoSort(ch.Nodes, children, inDegree)
	if cyclic {
		ve.channel("edges contain a cycle")
	}

	if !ve.empty() {
		return nil, nil, ve
	}
	return byID, order, nil
}

func topoSort(ns []Node, children map[string][]string, inDegree map[string]int) ([]string, bool) {
	deg := map[string]int{}
	var queue []string
	for _, n := range ns {
		deg[n.ID] = inDegree[n.ID]
		if deg[n.ID] == 0 {
			queue = append(queue, n.ID)
		}
	}
	var order []string
	for len(queue) > 0 {
		sort.Strings(queue)
		id := queue[0]
		queue = queue[1:]
		order = append(order, id)
		for _, c := range children[id] {
			if deg[c]--; deg[c] == 0 {
				queue = append(queue, c)
			}
		}
	}
	return order, len(order) != len(deg)
}

// DeploymentPlan is the hydrated, runtime-facing form of a channel.
type DeploymentPlan struct {
	PlanVersion int         `json:"planVersion"`
	ChannelID   string      `json:"channelId"`
	Runtime     RuntimePlan `json:"runtime"`
	// Nodes are in topological order, so upstream nodes always start before downstream ones.
	Nodes []PlanNode `json:"nodes"`
	// Edges become byte-array Channels between nodes in the runtime.
	Edges []Edge `json:"edges"`
}

// RuntimePlan is the channel's deployment target.
type RuntimePlan struct {
	Size      string    `json:"size"`
	Resources Resources `json:"resources"`
}

// PlanNode carries everything the runtime needs to load and start one node.
type PlanNode struct {
	ID               string            `json:"id"`
	PluginType       string            `json:"pluginType"`
	PluginVersion    int               `json:"pluginVersion"`
	ContractVersion  int               `json:"contractVersion"`
	Category         nodes.Category    `json:"category"`
	DefinitionDigest string            `json:"definitionDigest"`
	Artifact         nodes.Artifact    `json:"artifact"`
	Config           json.RawMessage   `json:"config"`
	References       []nodes.Reference `json:"references"`
	ProcessingMode   string            `json:"processingMode"`
	Inputs           []string          `json:"inputs"`
	Outputs          []string          `json:"outputs"`
}

// PlanVersion is the current deployment plan format.
const PlanVersion = 1

// ErrMissingArtifact is returned when a resolved plugin version has no WASM artifact to deploy.
var ErrMissingArtifact = errors.New("plugin version has no WASM artifact")

// Hydrate validates the channel (including resources) and builds its deployment plan.
func Hydrate(ctx context.Context, ch *Channel, reg *nodes.Registry, resolver ResourceResolver, policy Policy) (*DeploymentPlan, error) {
	if resolver == nil || policy == nil {
		return nil, errors.New("hydration requires a resource resolver and a deployment policy")
	}
	byID, order, err := validate(ctx, ch, reg, resolver)
	if err != nil {
		return nil, err
	}
	resources, err := policy.Resources(ctx, ch)
	if err != nil {
		return nil, fmt.Errorf("resources: %w", err)
	}
	p := &DeploymentPlan{
		PlanVersion: PlanVersion,
		ChannelID:   ch.ID,
		Runtime:     RuntimePlan{Size: ch.Runtime.Size, Resources: resources},
		Edges:       append([]Edge{}, ch.Edges...),
	}
	sort.Slice(p.Edges, func(i, j int) bool { return p.Edges[i].ID < p.Edges[j].ID })
	inputs, outputs := map[string][]string{}, map[string][]string{}
	for _, e := range p.Edges {
		outputs[e.From] = append(outputs[e.From], e.To)
		inputs[e.To] = append(inputs[e.To], e.From)
	}
	for _, id := range order {
		r := byID[id]
		def := r.entry.Definition
		if r.entry.Artifact == nil {
			return nil, fmt.Errorf("node %s: %s: %w", id, def.Identity(), ErrMissingArtifact)
		}
		mode, err := policy.ProcessingMode(ctx, r.node, def)
		if err != nil {
			return nil, fmt.Errorf("node %s: processing mode: %w", id, err)
		}
		config := r.node.Config
		if len(config) == 0 {
			config = json.RawMessage("{}")
		}
		refs, _ := def.References(config)
		if refs == nil {
			refs = []nodes.Reference{}
		}
		p.Nodes = append(p.Nodes, PlanNode{
			ID: id, PluginType: def.PluginType, PluginVersion: def.PluginVersion, ContractVersion: def.ContractVersion,
			Category: def.Category, DefinitionDigest: def.Digest(), Artifact: *r.entry.Artifact, Config: config,
			References: refs, ProcessingMode: mode, Inputs: nonNil(inputs[id]), Outputs: nonNil(outputs[id]),
		})
	}
	return p, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
