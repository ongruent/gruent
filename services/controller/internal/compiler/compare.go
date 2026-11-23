package compiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

const (
	pluginCompare = "compare"
	// compareModelField is the compare step's model, whose fields the comparisons use.
	compareModelField = "modelId"
)

// fixedNumber is a JSON number, which the runtime parses exactly (no hexadecimal, infinity or NaN).
var fixedNumber = regexp.MustCompile(`^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$`)

type compareConfig struct {
	Comparisons []comparison `json:"comparisons"`
}

type comparison struct {
	Left      string  `json:"left"`
	Operator  string  `json:"operator"`
	CompareTo string  `json:"compareTo"`
	Value     *string `json:"value"`
	Right     *string `json:"right"`
}

// compareCompiled is the plan step's compiled data of compare@1: the model, and the type of each
// comparison's values ("number", "string" or "boolean"), in configuration order. The types come from the
// model's fields, so the configuration never declares them.
type compareCompiled struct {
	ModelRef   string   `json:"modelRef"`
	ValueTypes []string `json:"valueTypes"`
}

// compileCompare checks the comparisons of a compare step against its model, and against its input type
// when that is known, and compiles the type of each comparison. It checks what the schema of compare@1
// cannot express (the schema already rejects paths through arrays): fields exist in the model and are
// single values, the operand that compareTo selects is
// set, fixed values have the field's type, both fields of a comparison have the same type, and ordering
// operators compare numbers.
func (c *compilation) compileCompare(step *plan.Step, library *libraryStep, input *types.Type) error {
	var config compareConfig
	if err := json.Unmarshal(step.Config, &config); err != nil {
		return fmt.Errorf("decode configuration of step %s: %w", step.ID, err)
	}
	modelID, ok := library.modelOf(compareModelField)
	if !ok {
		return nil
	}
	model, ok := c.models[modelID]
	if !ok {
		return nil // reported by resolveModels
	}

	inputKinds := map[string]types.Kind(nil)
	if input != nil {
		switch input.Kind {
		case types.KindSignal:
			c.warnf("compare_signal_input", step.ID, "", "the input of step %s is a signal without values, so the condition never holds", step.ID)
		case types.KindBytes:
			c.warnf("compare_untyped_input", step.ID, "", "the input of step %s has no model, so its values cannot be checked: input that isn't JSON fails the condition", step.ID)
		default:
			inputKinds = fieldKinds(*input)
		}
	}
	modelKinds := fieldKinds(model.t)

	valid := true
	problem := func(code, path, format string, args ...any) {
		valid = false
		c.errorf(code, step.ID, path, format, args...)
	}
	// kindOf returns the type of a field of the model, or "" after reporting why it cannot be compared.
	kindOf := func(path, field string) types.Kind {
		kind, ok := modelKinds[field]
		switch {
		case !ok:
			problem("unknown_model_field", path, "field %s is not part of the model of step %s", field, step.ID)
		case kind != types.KindNumber && kind != types.KindString && kind != types.KindBoolean:
			problem("invalid_compare_field", path, "%s of step %s is a %s; only text, numbers and true/false values can be compared", field, step.ID, kind)
		default:
			if inputKinds != nil {
				if inputKind, ok := inputKinds[field]; !ok {
					problem("unknown_variable", path, "%s is not part of the input of step %s", field, step.ID)
				} else if inputKind != kind {
					problem("variable_type_mismatch", path, "%s is a %s in the input of step %s, but a %s in its model", field, inputKind, step.ID, kind)
				}
			}
			return kind
		}
		return ""
	}

	valueTypes := make([]string, len(config.Comparisons))
	for i, comparison := range config.Comparisons {
		base := fmt.Sprintf("/config/comparisons/%d", i)
		kind := kindOf(base+"/left", comparison.Left)
		valueTypes[i] = string(kind)
		if kind != "" && kind != types.KindNumber && comparison.Operator != "equal" && comparison.Operator != "notEqual" {
			problem("operator_type_mismatch", base+"/operator", "%s of step %s is a %s, but %s only compares numbers", comparison.Left, step.ID, kind, comparison.Operator)
		}
		switch comparison.CompareTo {
		case "value":
			switch {
			case comparison.Value == nil:
				problem("compare_value_required", base+"/value", "comparison %d of step %s compares to a fixed value, but none is set", i+1, step.ID)
			case kind != "" && !validFixedValue(string(kind), *comparison.Value):
				problem("invalid_compare_value", base+"/value", "the fixed value %q of step %s is not a %s", *comparison.Value, step.ID, kind)
			}
		case "variable":
			if comparison.Right == nil {
				problem("compare_value_required", base+"/right", "comparison %d of step %s compares to another field, but none is set", i+1, step.ID)
				break
			}
			if right := kindOf(base+"/right", *comparison.Right); kind != "" && right != "" && right != kind {
				problem("variable_type_mismatch", base+"/right", "%s of step %s is a %s, but %s is a %s", *comparison.Right, step.ID, right, comparison.Left, kind)
			}
		}
	}
	if !valid {
		return nil
	}

	compiled, err := plan.Canonicalize(mustMarshal(compareCompiled{ModelRef: modelID, ValueTypes: valueTypes}))
	if err != nil {
		return err
	}
	step.Compiled = compiled
	return nil
}

// fieldKinds maps the fields of a type, in variable syntax relative to the input, to their kinds.
func fieldKinds(t types.Type) map[string]types.Kind {
	kinds := map[string]types.Kind{}
	for _, variable := range types.Variables(t) {
		if path, ok := strings.CutPrefix(variable.Path, "input."); ok {
			kinds[path] = variable.Kind
		}
	}
	return kinds
}

func validFixedValue(valueType, value string) bool {
	switch valueType {
	case "number":
		return fixedNumber.MatchString(strings.TrimSpace(value))
	case "boolean":
		normalized := strings.ToLower(strings.TrimSpace(value))
		return normalized == "true" || normalized == "false"
	default:
		return true
	}
}
