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

// compileExistence resolves the model (and the selected fields) of an existence step into the paths the
// runtime checks.
func (c *compilation) compileExistence(step *plan.Step, library *libraryStep, input *types.Type) error {
	modelID, ok := library.modelOf(existenceModelField)
	if !ok {
		return nil
	}
	model, ok := c.models[modelID]
	if !ok {
		return nil // reported by resolveModels
	}

	paths := redactionPaths(model.t, "")
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
		return nil
	}
	slices.Sort(paths)

	compiled, err := plan.Canonicalize(mustMarshal(existenceCompiled{ModelRef: modelID, Paths: paths}))
	if err != nil {
		return err
	}
	step.Compiled = compiled

	if input != nil && input.Kind == types.KindSignal {
		c.warnf("existence_signal_input", step.ID, "", "the input of step %s is a signal without data, so its fields are always missing", step.ID)
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
