package compiler

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// compileLibrarySteps applies the per-plugin compilation of every library step with a valid configuration:
// checks that need the step's input type or dependencies, and the plan step's compiled data.
func (c *compilation) compileLibrarySteps(graph plan.Graph, resolved []types.Resolved) error {
	for i := range graph.Steps {
		if err := c.compileLibraryStep(&graph.Steps[i], resolvedInput(resolved, graph.Steps[i].ID)); err != nil {
			return err
		}
	}
	return nil
}

// compileLibraryStep applies the compilation of a step's plugin version. input is the step's resolved
// input type, or nil if it is unknown.
func (c *compilation) compileLibraryStep(step *plan.Step, input *types.Type) error {
	library := c.libraryCache[step.ID]
	if library == nil || !library.valid {
		return nil
	}
	switch {
	case library.is(pluginExistence, 1):
		return c.compileExistence(step, library, input)
	case library.is(pluginCompare, 1):
		return c.compileCompare(step, library, input)
	case library.is(pluginTransform, 1):
		return c.compileTransform(step, library)
	}
	return nil
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
