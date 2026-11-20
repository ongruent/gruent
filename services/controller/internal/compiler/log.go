package compiler

import (
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

const (
	pluginLog = "log"
	// redactionModelField is the log step's model of sensitive fields.
	redactionModelField = "redactionModelId"
	// RedactionReplacement replaces every redacted value.
	RedactionReplacement = "[REDACTED]"
)

// applyRedactions resolves the sensitive fields model of every log step into redaction paths, and warns
// when the step's input cannot be checked against them.
func (c *compilation) applyRedactions(graph plan.Graph, resolved []types.Resolved) {
	for i, step := range graph.Steps {
		library := c.libraryCache[step.ID]
		if !library.is(pluginLog, 1) {
			continue
		}
		index := slices.IndexFunc(library.referencesTo(collectionModels), func(d modelDependency) bool { return d.field == redactionModelField })
		if index < 0 {
			continue
		}
		modelID := library.referencesTo(collectionModels)[index].modelID
		model, ok := c.models[modelID]
		if !ok {
			continue // reported by resolveModels
		}
		paths := redactionPaths(model.t, "")
		if len(paths) == 0 {
			c.warnf("empty_redaction_model", step.ID, "/config/"+redactionModelField, "the sensitive fields model of step %s has no fields, so nothing is redacted", step.ID)
		}
		graph.Steps[i].Redaction = &plan.Redaction{ModelRef: modelID, Paths: paths, Replacement: RedactionReplacement}

		resolvedIndex := slices.IndexFunc(resolved, func(r types.Resolved) bool { return r.StepID == step.ID })
		if resolvedIndex < 0 || resolved[resolvedIndex].Input == nil {
			continue
		}
		input := *resolved[resolvedIndex].Input
		switch input.Kind {
		case types.KindBytes:
			c.warnf("redaction_untyped_input", step.ID, "/config/"+redactionModelField, "the input of step %s has no model, so redaction cannot be checked: input that is not JSON is logged without its payload", step.ID)
		case types.KindSignal:
			c.warnf("redaction_signal_input", step.ID, "/config/"+redactionModelField, "the input of step %s is a signal without data, so nothing is redacted", step.ID)
		default:
			known := map[string]bool{}
			for _, variable := range types.Variables(input) {
				known[strings.TrimPrefix(variable.Path, "input.")] = true
			}
			for _, path := range paths {
				if !known[path] {
					c.warnf("redaction_field_not_in_input", step.ID, "/config/"+redactionModelField, "sensitive field %s is not part of the input of step %s", path, step.ID)
				}
			}
		}
	}
}

// redactionPaths lists the leaf fields of a model: objects with fields and arrays of objects are
// descended into; any other field, including empty objects, is redacted as a whole.
func redactionPaths(t types.Type, prefix string) []string {
	var paths []string
	for _, field := range t.Fields {
		path := prefix + field.Name
		switch {
		case field.Type.Kind == types.KindObject && len(field.Type.Fields) > 0:
			paths = append(paths, redactionPaths(field.Type, path+".")...)
		case field.Type.Kind == types.KindArray && field.Type.Items != nil && field.Type.Items.Kind == types.KindObject && len(field.Type.Items.Fields) > 0:
			paths = append(paths, redactionPaths(*field.Type.Items, path+"[].")...)
		default:
			paths = append(paths, path)
		}
	}
	slices.Sort(paths)
	return paths
}

func (c *compilation) warnf(code, stepID, path, format string, args ...any) {
	diagnostic := types.Errorf(code, stepID, path, format, args...)
	diagnostic.Severity = types.SeverityWarning
	c.diagnostics = append(c.diagnostics, diagnostic)
}
