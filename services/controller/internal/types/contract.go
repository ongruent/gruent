package types

import (
	"fmt"
	"slices"
	"strings"
)

// Model fields that steps use to declare their input and output types explicitly, as stored in the step's
// model dependencies.
const (
	InputModelField  = "inputModel::model"
	OutputModelField = "outputModel::model"
)

// Diagnostic severities.
const (
	SeverityError   = "error"
	SeverityWarning = "warning"
)

// Diagnostic is an actionable validation result. Errors block publication; warnings don't.
type Diagnostic struct {
	Severity string `json:"severity"`
	// Code is a stable machine-readable identifier, e.g. "type_mismatch".
	Code    string `json:"code"`
	Message string `json:"message"`
	// StepID is the step the diagnostic is about, if any.
	StepID string `json:"stepId,omitempty"`
	// Path locates the problem within the step or channel, e.g. "/runtime/memoryMiB".
	Path string `json:"path,omitempty"`
}

// Errorf returns an error diagnostic.
func Errorf(code, stepID, path, format string, args ...any) Diagnostic {
	return Diagnostic{Severity: SeverityError, Code: code, Message: fmt.Sprintf(format, args...), StepID: stepID, Path: path}
}

// Step is what type resolution needs to know about a step.
type Step struct {
	ID       string
	Category string // source, processing, conditional, action, custom
	Label    string // e.g. http, timer, transform
	// Models are the resolved model types the step declares, keyed by config field name.
	Models map[string]Type
	// DeclaredModels are the config field names of every model dependency, including ones that could not
	// be resolved, so that a missing model is not reported twice.
	DeclaredModels []string
	// EmitsSignal marks sources that trigger without data, e.g. timers.
	EmitsSignal bool
	// InputDataTypes are the data type categories each input port accepts ("json", "bytes", "signal").
	// Ports without categories accept anything.
	InputDataTypes map[string][]string
}

// Edge connects two steps.
type Edge struct {
	From   string
	To     string
	ToPort string
}

// Resolved holds the resolved types of a step.
type Resolved struct {
	StepID string `json:"stepId"`
	// Input is nil for source steps.
	Input  *Type `json:"input,omitempty"`
	Output *Type `json:"output,omitempty"`
	// Variables are the input values the step can reference.
	Variables []Variable `json:"variables"`
}

var categories = []string{"source", "processing", "conditional", "action", "custom"}

// ResolveStep applies a step's type contract to its input type. Input is nil for source steps, and for
// node-only resolution without upstream context. It returns nil if the output cannot be resolved.
//
// Contracts:
//   - Sources start the graph. A timer emits a signal. Other sources emit their declared model, or
//     opaque bytes without one.
//   - Transforms must declare an output model, because their output cannot be inferred from the input.
//   - Every other step passes its input through, unless it declares an output model.
//   - A step that declares an input model requires its input to be assignable to that model.
func ResolveStep(step Step, input *Type) (*Type, []Diagnostic) {
	var diagnostics []Diagnostic
	if !slices.Contains(categories, step.Category) {
		return nil, []Diagnostic{Errorf("unknown_step_type", step.ID, "", "step %s has unknown type %q", step.ID, step.Category)}
	}

	if step.Category == "source" {
		if step.EmitsSignal {
			return &Signal, nil
		}
		names := make([]string, 0, len(step.Models))
		for name := range step.Models {
			names = append(names, name)
		}
		slices.Sort(names)
		if len(names) == 0 {
			return &Bytes, nil
		}
		if len(names) > 1 {
			diagnostics = append(diagnostics, Diagnostic{
				Severity: SeverityWarning, Code: "multiple_source_models", StepID: step.ID,
				Message: fmt.Sprintf("source %s declares %d models; %s is used as its output type", step.ID, len(names), names[0]),
			})
		}
		output := step.Models[names[0]]
		return &output, diagnostics
	}

	if model, ok := step.Models[InputModelField]; ok && input != nil && !input.AssignableTo(model) {
		diagnostics = append(diagnostics, Errorf("type_mismatch", step.ID, "/"+InputModelField,
			"the input of step %s does not match its input model %s", step.ID, model.ModelRef))
	}

	if model, ok := step.Models[OutputModelField]; ok {
		return &model, diagnostics
	}
	if step.Category == "processing" && step.Label == "transform" {
		if !slices.Contains(step.DeclaredModels, OutputModelField) {
			diagnostics = append(diagnostics, Errorf("output_type_required", step.ID, "/"+OutputModelField,
				"transform %s needs an output model, because its output cannot be inferred", step.ID))
		}
		return nil, diagnostics
	}
	return input, diagnostics
}

// ResolveGraph resolves the types of every step, starting from the source, and validates that each edge
// carries a type its target accepts.
func ResolveGraph(steps []Step, edges []Edge) (map[string]Resolved, []Diagnostic) {
	var diagnostics []Diagnostic
	byID := map[string]Step{}
	for _, step := range steps {
		byID[step.ID] = step
	}
	incoming := map[string][]Edge{}
	outgoing := map[string][]Edge{}
	for _, edge := range edges {
		incoming[edge.To] = append(incoming[edge.To], edge)
		outgoing[edge.From] = append(outgoing[edge.From], edge)
	}

	resolved := map[string]Resolved{}
	outputs := map[string]*Type{}
	done := map[string]bool{}
	pending := map[string]int{}
	var queue []string
	for _, step := range steps {
		pending[step.ID] = len(incoming[step.ID])
		if pending[step.ID] == 0 {
			queue = append(queue, step.ID)
		}
	}
	slices.Sort(queue)

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		step := byID[id]
		done[id] = true

		var input *Type
		if step.Category != "source" {
			if len(incoming[id]) == 0 {
				diagnostics = append(diagnostics, Errorf("missing_input", id, "", "step %s has no input", id))
			}
			for _, edge := range incoming[id] {
				upstream := outputs[edge.From]
				if upstream == nil {
					continue // the upstream problem is already reported
				}
				if accepted := acceptedCategories(step, edge.ToPort); len(accepted) > 0 && !slices.Contains(accepted, upstream.Category()) {
					diagnostics = append(diagnostics, Errorf("incompatible_edge", id, "",
						"step %s accepts %s, but step %s emits %s", id, strings.Join(accepted, " or "), edge.From, upstream.Category()))
					continue
				}
				if input != nil && input.ID() != upstream.ID() {
					diagnostics = append(diagnostics, Errorf("conflicting_input_types", id, "",
						"step %s receives different types from its inputs", id))
					continue
				}
				input = upstream
			}
		}

		output, stepDiagnostics := ResolveStep(step, input)
		diagnostics = append(diagnostics, stepDiagnostics...)
		outputs[id] = output
		result := Resolved{StepID: id, Input: input, Output: output, Variables: []Variable{}}
		if input != nil {
			result.Variables = Variables(*input)
		}
		resolved[id] = result

		next := outgoing[id]
		slices.SortFunc(next, func(a, b Edge) int { return strings.Compare(a.To, b.To) })
		for _, edge := range next {
			pending[edge.To]--
			if pending[edge.To] == 0 {
				queue = append(queue, edge.To)
			}
		}
	}

	for _, step := range steps {
		if !done[step.ID] {
			diagnostics = append(diagnostics, Errorf("unresolved_type", step.ID, "", "the input type of step %s cannot be resolved because it is part of a cycle", step.ID))
		}
	}
	return resolved, diagnostics
}

func acceptedCategories(step Step, port string) []string {
	if accepted, ok := step.InputDataTypes[port]; ok {
		return accepted
	}
	var all []string
	for _, accepted := range step.InputDataTypes {
		for _, category := range accepted {
			if !slices.Contains(all, category) {
				all = append(all, category)
			}
		}
	}
	slices.Sort(all)
	return all
}
