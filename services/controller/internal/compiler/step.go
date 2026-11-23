package compiler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// StepInput is a node-only soft compilation request: one step, as stored in a channel's "nodes", and
// the upstream type context needed to infer its types. UpstreamType is the output type of the step
// connected to this step's input, as returned by an earlier compilation of the channel (or of the
// upstream step). It must be nil for source steps. Without it, a non-source step is validated in
// isolation and only its explicitly declared types are resolved.
type StepInput struct {
	SpaceID      string
	Step         []byte
	UpstreamType *types.Type
}

// StepResult is the outcome of compiling a single step.
type StepResult struct {
	Diagnostics []Diagnostic
	Types       types.Resolved
}

// CompileStep validates a single step and resolves its types with the same rules as Compile.
func CompileStep(ctx context.Context, input StepInput, resolver Resolver) (*StepResult, error) {
	c, err := newCompilation(Input{SpaceID: input.SpaceID}, resolver)
	if err != nil {
		return nil, err
	}

	var node nodeConfig
	if err := json.NewDecoder(bytes.NewReader(input.Step)).Decode(&node); err != nil {
		c.errorf("invalid_config", "", "", "invalid step configuration: %v", err)
		return &StepResult{Diagnostics: c.diagnostics}, nil
	}
	if node.ID == "" {
		c.errorf("missing_step_id", "", "/id", "the step has no ID")
	}
	step, ok := c.step(node)
	if ok {
		if err := c.resolveModels(ctx, []plan.Step{step}); err != nil {
			return nil, err
		}
		if _, err := c.resolveConnections(ctx, []plan.Step{step}); err != nil {
			return nil, err
		}
	}

	typeStep := c.typeStep(node)
	upstream := input.UpstreamType
	if typeStep.Category == "source" && upstream != nil {
		c.errorf("source_with_input", node.ID, "", "source step %s cannot have an upstream type", node.ID)
		upstream = nil
	}
	if upstream != nil {
		if accepted := acceptedCategoriesOf(typeStep); len(accepted) > 0 && !slices.Contains(accepted, upstream.Category()) {
			c.errorf("incompatible_edge", node.ID, "", "step %s does not accept %s input", node.ID, upstream.Category())
		}
	}

	if ok {
		if err := c.compileLibraryStep(&step, upstream); err != nil {
			return nil, err
		}
	}

	output, diagnostics := types.ResolveStep(typeStep, upstream)
	c.diagnostics = append(c.diagnostics, diagnostics...)
	resolved := types.Resolved{StepID: node.ID, Input: upstream, Output: output, Variables: []types.Variable{}}
	if upstream != nil {
		resolved.Variables = types.Variables(*upstream)
	}
	if c.diagnostics == nil {
		c.diagnostics = []Diagnostic{}
	}
	return &StepResult{Diagnostics: c.diagnostics, Types: resolved}, nil
}

// ParseType parses a JSON-encoded type, e.g. an upstream type supplied by a client.
func ParseType(data []byte) (*types.Type, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, nil
	}
	var t types.Type
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&t); err != nil {
		return nil, fmt.Errorf("invalid type: %w", err)
	}
	if t.Kind == "" {
		return nil, errors.New("invalid type: kind is required")
	}
	return &t, nil
}

func acceptedCategoriesOf(step types.Step) []string {
	var all []string
	for _, accepted := range step.InputDataTypes {
		for _, category := range accepted {
			all = appendUnique(all, category)
		}
	}
	return all
}
