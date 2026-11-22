package compiler

import (
	"context"
	"slices"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/types"
)

// compareChannel returns a channel with a library HTTP source (whose output model is sourceModel, if any)
// connected to a compare step, whose success and failure branches lead to log steps.
func compareChannel(sourceModel string, config map[string]any) []byte {
	edge := func(id, from, fromPort, to string) map[string]any {
		return map[string]any{"id": id, "from": map[string]any{"nodeId": from, "ioId": fromPort}, "to": map[string]any{"nodeId": to, "ioId": "input"}}
	}
	sourceConfig := map[string]any{}
	if sourceModel != "" {
		sourceConfig["modelId"] = sourceModel
	}
	return channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(sourceConfig),
			libraryNode("n_cmp", "conditional", "compare", config),
			libraryNode("n_pass", "action", "log", map[string]any{"level": "info"}),
			libraryNode("n_fail", "action", "log", map[string]any{"level": "warn"}),
		}
		c["edges"] = []any{
			edge("e1", "n_src", "output", "n_cmp"),
			edge("e2", "n_cmp", "success", "n_pass"),
			edge("e3", "n_cmp", "failure", "n_fail"),
		}
	})
}

func compareConfigOf(valueType, left, operator string, extra map[string]any) map[string]any {
	config := map[string]any{"valueType": valueType, "left": left, "operator": operator, "compareTo": "value", "value": "25"}
	for key, value := range extra {
		config[key] = value
	}
	return config
}

func TestCompileCompareStep(t *testing.T) {
	result := compile(t, compareChannel("m1", compareConfigOf("number", "input.temperatureC", "greaterThanOrEqual", nil)))
	step := planStep(result.Artifacts.Plan, "n_cmp")
	if step.Type != "conditional.compare" || len(step.Compiled) != 0 {
		t.Fatalf("unexpected step: %+v", step)
	}
	if output := resolvedByID(result, "n_pass").Output; output == nil || output.ModelRef != "m1" {
		t.Fatalf("output = %+v", output)
	}

	// Another input value of the same type.
	compile(t, compareChannel("m1", compareConfigOf("number", "input.temperatureC", "lessThan", map[string]any{"compareTo": "variable", "right": "input.location.lat"})))
	compile(t, compareChannel("m1", compareConfigOf("string", "input.deviceId", "equal", map[string]any{"value": "d1"})))
}

func TestCompileCompareStepWithUntypedInput(t *testing.T) {
	result := compile(t, compareChannel("", compareConfigOf("boolean", "input.active", "equal", map[string]any{"value": "TRUE"})))
	if got := warnings(result); !slices.Equal(got, []string{"compare_untyped_input n_cmp"}) {
		t.Fatalf("warnings = %v", got)
	}
}

func TestCompileCompareStepProblems(t *testing.T) {
	for name, test := range map[string]struct {
		config map[string]any
		code   string
	}{
		"ordering text":    {compareConfigOf("string", "input.deviceId", "greaterThan", nil), "operator_type_mismatch"},
		"not a number":     {compareConfigOf("number", "input.temperatureC", "equal", map[string]any{"value": "warm"}), "invalid_compare_value"},
		"no fixed value":   {map[string]any{"valueType": "number", "left": "input.temperatureC", "operator": "equal", "compareTo": "value"}, "compare_value_required"},
		"no input value":   {compareConfigOf("number", "input.temperatureC", "equal", map[string]any{"compareTo": "variable"}), "compare_value_required"},
		"unknown":          {compareConfigOf("number", "input.humidity", "equal", nil), "unknown_variable"},
		"wrong type":       {compareConfigOf("number", "input.deviceId", "equal", nil), "variable_type_mismatch"},
		"other wrong":      {compareConfigOf("number", "input.temperatureC", "equal", map[string]any{"compareTo": "variable", "right": "input.deviceId"}), "variable_type_mismatch"},
		"through arrays":   {compareConfigOf("number", "input.readings[].value", "equal", nil), "multi_valued_variable"},
		"outside of input": {compareConfigOf("number", "temperatureC", "equal", nil), "invalid_step_config"},
	} {
		t.Run(name, func(t *testing.T) {
			requireProblem(t, problems(t, compareChannel("m1", test.config)), test.code)
		})
	}
}

func TestCompileStepCompareUsesTheUpstreamType(t *testing.T) {
	upstream := types.Type{Kind: types.KindObject, Fields: []types.Field{{Name: "temperatureC", Type: types.Type{Kind: types.KindString}}}}
	result, err := CompileStep(context.Background(), StepInput{
		SpaceID:      "s1",
		Step:         mustJSON(libraryNode("n_cmp", "conditional", "compare", compareConfigOf("number", "input.temperatureC", "equal", nil))),
		UpstreamType: &upstream,
	}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "variable_type_mismatch" || result.Diagnostics[0].Path != "/config/left" {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}
}
