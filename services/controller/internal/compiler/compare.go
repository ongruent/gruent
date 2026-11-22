package compiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

const pluginCompare = "compare"

// fixedNumber is a JSON number, which the runtime parses exactly (no hexadecimal, infinity or NaN).
var fixedNumber = regexp.MustCompile(`^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$`)

type compareConfig struct {
	ValueType string  `json:"valueType"`
	Left      string  `json:"left"`
	Operator  string  `json:"operator"`
	CompareTo string  `json:"compareTo"`
	Value     *string `json:"value"`
	Right     *string `json:"right"`
}

// checkCompare validates what the schema of compare@1 cannot express: the operand that compareTo selects
// is set, a fixed value has the configured type, ordering operators compare numbers, and, when the input
// type is known, both input values exist, are single values and have the configured type.
func (c *compilation) checkCompare(step *plan.Step, input *types.Type) error {
	var config compareConfig
	if err := json.Unmarshal(step.Config, &config); err != nil {
		return fmt.Errorf("decode configuration of step %s: %w", step.ID, err)
	}

	if config.ValueType != "number" && config.Operator != "equal" && config.Operator != "notEqual" {
		c.errorf("operator_type_mismatch", step.ID, "/config/operator", "step %s compares %s values, but %s only compares numbers", step.ID, config.ValueType, config.Operator)
	}

	variables := []struct{ field, variable string }{{"left", config.Left}}
	switch config.CompareTo {
	case "value":
		switch {
		case config.Value == nil:
			c.errorf("compare_value_required", step.ID, "/config/value", "step %s compares to a fixed value, but none is set", step.ID)
		case !validFixedValue(config.ValueType, *config.Value):
			c.errorf("invalid_compare_value", step.ID, "/config/value", "the fixed value %q of step %s is not a %s", *config.Value, step.ID, config.ValueType)
		}
	case "variable":
		if config.Right == nil {
			c.errorf("compare_value_required", step.ID, "/config/right", "step %s compares to another input value, but none is set", step.ID)
		} else {
			variables = append(variables, struct{ field, variable string }{"right", *config.Right})
		}
	}

	if input == nil {
		return nil
	}
	switch input.Kind {
	case types.KindSignal:
		c.warnf("compare_signal_input", step.ID, "", "the input of step %s is a signal without values, so the condition never holds", step.ID)
		return nil
	case types.KindBytes:
		c.warnf("compare_untyped_input", step.ID, "", "the input of step %s has no model, so its values cannot be checked: input that isn't JSON fails the condition", step.ID)
		return nil
	}
	known := types.Variables(*input)
	for _, v := range variables {
		path := "/config/" + v.field
		if strings.Contains(v.variable, "[]") {
			c.errorf("multi_valued_variable", step.ID, path, "%s of step %s goes through an array, so it has several values", v.variable, step.ID)
			continue
		}
		index := slices.IndexFunc(known, func(k types.Variable) bool { return k.Path == v.variable })
		if index < 0 {
			c.errorf("unknown_variable", step.ID, path, "%s is not part of the input of step %s", v.variable, step.ID)
			continue
		}
		if kind := known[index].Kind; string(kind) != config.ValueType {
			c.errorf("variable_type_mismatch", step.ID, path, "%s of step %s is a %s, not a %s", v.variable, step.ID, kind, config.ValueType)
		}
	}
	return nil
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
