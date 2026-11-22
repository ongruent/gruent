package compiler

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

const (
	pluginExistence = "existence"
	// existenceModelField is the existence step's model of fields to check.
	existenceModelField = "modelId"
)

// existenceCompiled is the plan step's compiled data of existence@1: the model and the fields to check, in
// variable syntax relative to the input ("device.id", "readings[].value").
type existenceCompiled struct {
	ModelRef string   `json:"modelRef"`
	Paths    []string `json:"paths"`
}

// compileExistenceSteps resolves the model (and the selected fields) of every existence step into the
// paths the runtime checks.
func (c *compilation) compileExistenceSteps(graph plan.Graph, resolved []types.Resolved) error {
	for i, step := range graph.Steps {
		library := c.libraryCache[step.ID]
		if !library.is(pluginExistence, 1) || !library.valid {
			continue
		}
		modelID, ok := library.modelOf(existenceModelField)
		if !ok {
			continue
		}
		model, ok := c.models[modelID]
		if !ok {
			continue // reported by resolveModels
		}

		available := redactionPaths(model.t, "")
		paths := available
		var config struct {
			Fields []string `json:"fields"`
		}
		if err := json.Unmarshal(step.Config, &config); err != nil {
			return fmt.Errorf("decode configuration of step %s: %w", step.ID, err)
		}
		if len(config.Fields) > 0 {
			paths = nil
			known := modelPaths(model.t)
			for index, field := range config.Fields {
				if !known[field] {
					c.errorf("unknown_model_field", step.ID, fmt.Sprintf("/config/fields/%d", index), "field %s is not part of the model of step %s", field, step.ID)
					continue
				}
				paths = appendUnique(paths, field)
			}
		}
		if len(paths) == 0 {
			c.errorf("no_fields_to_check", step.ID, "/config/"+existenceModelField, "the model of step %s has no fields to check", step.ID)
			continue
		}
		slices.Sort(paths)

		compiled, err := plan.Canonicalize(mustMarshal(existenceCompiled{ModelRef: modelID, Paths: paths}))
		if err != nil {
			return err
		}
		graph.Steps[i].Compiled = compiled

		if input := resolvedInput(resolved, step.ID); input != nil && input.Kind == types.KindSignal {
			c.warnf("existence_signal_input", step.ID, "", "the input of step %s is a signal without data, so its fields are always missing", step.ID)
		}
	}
	return nil
}

// modelPaths lists every field of a type in variable syntax, including objects and arrays themselves, so
// that a user can check a whole object ("location") as well as one of its fields ("location.lat").
func modelPaths(t types.Type) map[string]bool {
	paths := map[string]bool{}
	for _, variable := range types.Variables(t) {
		if path, ok := strings.CutPrefix(variable.Path, "input."); ok {
			paths[path] = true
		}
	}
	return paths
}

// modelOf returns the model selected in a configuration field.
func (s *libraryStep) modelOf(field string) (string, bool) {
	for _, dependency := range s.referencesTo(collectionModels) {
		if dependency.field == field {
			return dependency.modelID, true
		}
	}
	return "", false
}

func resolvedInput(resolved []types.Resolved, stepID string) *types.Type {
	index := slices.IndexFunc(resolved, func(r types.Resolved) bool { return r.StepID == stepID })
	if index < 0 {
		return nil
	}
	return resolved[index].Input
}

func mustMarshal(value any) []byte {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("encode compiled step data: %v", err)) // only plain structs are encoded
	}
	return encoded
}

// checkConditionalPorts requires every edge out of a library conditional step to leave from its success
// or failure output, since the runtime routes each message to one branch.
func (c *compilation) checkConditionalPorts(graph plan.Graph) {
	for _, edge := range graph.Edges {
		library := c.libraryCache[edge.From]
		if library == nil || library.definition == nil || library.definition.Category != "conditional" {
			continue
		}
		if edge.FromPort != plan.PortSuccess && edge.FromPort != plan.PortFailure {
			c.errorf("unknown_output_port", edge.From, "/edges", "edge from conditional step %s to %s leaves from %q; it must leave from %q or %q", edge.From, edge.To, edge.FromPort, plan.PortSuccess, plan.PortFailure)
		}
	}
}
