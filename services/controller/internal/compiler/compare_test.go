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

// compareConfigOf returns a compare configuration of model modelID with the given comparisons.
func compareConfigOf(modelID, match string, comparisons ...map[string]any) map[string]any {
	list := make([]any, len(comparisons))
	for i, comparison := range comparisons {
		list[i] = comparison
	}
	return map[string]any{"modelId": modelID, "match": match, "comparisons": list}
}

// fixed compares left with a fixed value.
func fixed(left, operator, value string) map[string]any {
	return map[string]any{"left": left, "operator": operator, "compareTo": "value", "value": value}
}

// other compares left with another field.
func other(left, operator, right string) map[string]any {
	return map[string]any{"left": left, "operator": operator, "compareTo": "variable", "right": right}
}

func TestCompileCompareStep(t *testing.T) {
	result := compile(t, compareChannel("m1", compareConfigOf("m1", "all",
		fixed("temperatureC", "greaterThanOrEqual", "25"),
		other("temperatureC", "lessThan", "location.lat"),
		fixed("deviceId", "equal", "d1"),
	)))
	step := planStep(result.Artifacts.Plan, "n_cmp")
	if step.Type != "conditional.compare" || !slices.Equal(step.ModelRefs, []string{"m1"}) {
		t.Fatalf("unexpected step: %+v", step)
	}
	if want := `{"modelRef":"m1","valueTypes":["number","number","string"]}`; string(step.Compiled) != want {
		t.Fatalf("compiled = %s, want %s", step.Compiled, want)
	}
	if output := resolvedByID(result, "n_pass").Output; output == nil || output.ModelRef != "m1" {
		t.Fatalf("output = %+v", output)
	}
}

func TestCompileCompareStepWithUntypedInput(t *testing.T) {
	result := compile(t, compareChannel("", compareConfigOf("m4", "any",
		fixed("active", "equal", "TRUE"),
		other("status", "notEqual", "expected.status"),
	)))
	if got := warnings(result); !slices.Equal(got, []string{"compare_untyped_input n_cmp"}) {
		t.Fatalf("warnings = %v", got)
	}
	if got := string(planStep(result.Artifacts.Plan, "n_cmp").Compiled); got != `{"modelRef":"m4","valueTypes":["boolean","string"]}` {
		t.Fatalf("compiled = %s", got)
	}
}

func TestCompileCompareStepProblems(t *testing.T) {
	for name, test := range map[string]struct {
		source string
		config map[string]any
		code   string
		path   string
	}{
		"ordering text":       {"m1", compareConfigOf("m1", "all", fixed("deviceId", "greaterThan", "a")), "operator_type_mismatch", "/config/comparisons/0/operator"},
		"not a number":        {"m1", compareConfigOf("m1", "all", fixed("temperatureC", "equal", "warm")), "invalid_compare_value", "/config/comparisons/0/value"},
		"not a boolean":       {"m4", compareConfigOf("m4", "all", fixed("active", "equal", "yes")), "invalid_compare_value", "/config/comparisons/0/value"},
		"no fixed value":      {"m1", compareConfigOf("m1", "all", map[string]any{"left": "temperatureC", "operator": "equal", "compareTo": "value"}), "compare_value_required", "/config/comparisons/0/value"},
		"no other field":      {"m1", compareConfigOf("m1", "all", map[string]any{"left": "temperatureC", "operator": "equal", "compareTo": "variable"}), "compare_value_required", "/config/comparisons/0/right"},
		"not in the model":    {"m1", compareConfigOf("m1", "all", fixed("temperatureC", "equal", "1"), fixed("humidity", "equal", "1")), "unknown_model_field", "/config/comparisons/1/left"},
		"with input prefix":   {"m1", compareConfigOf("m1", "all", fixed("input.temperatureC", "equal", "1")), "unknown_model_field", "/config/comparisons/0/left"},
		"an object":           {"m1", compareConfigOf("m1", "all", fixed("location", "equal", "1")), "invalid_compare_field", "/config/comparisons/0/left"},
		"other type":          {"m1", compareConfigOf("m1", "all", other("temperatureC", "equal", "deviceId")), "variable_type_mismatch", "/config/comparisons/0/right"},
		"through arrays":      {"m3", compareConfigOf("m3", "all", fixed("readings[].token", "equal", "a")), "invalid_step_config", ""},
		"not in the input":    {"m1", compareConfigOf("m4", "all", fixed("active", "equal", "true")), "unknown_variable", "/config/comparisons/0/left"},
		"other type in input": {"m1", compareConfigOf("m4", "all", fixed("temperatureC", "equal", "25")), "variable_type_mismatch", "/config/comparisons/0/left"},
		"no comparisons":      {"m1", compareConfigOf("m1", "all"), "invalid_step_config", ""},
	} {
		t.Run(name, func(t *testing.T) {
			config := compareChannel(test.source, test.config)
			requireProblem(t, problems(t, config), test.code)
			if test.path == "" {
				return
			}
			result, err := Compile(context.Background(), input(config), resolver)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.ContainsFunc(result.Diagnostics, func(d types.Diagnostic) bool { return d.Code == test.code && d.Path == test.path }) {
				t.Fatalf("no %s at %s: %+v", test.code, test.path, result.Diagnostics)
			}
		})
	}
}

func TestCompileStepCompareUsesTheUpstreamType(t *testing.T) {
	upstream := types.Type{Kind: types.KindObject, Fields: []types.Field{{Name: "temperatureC", Type: types.Type{Kind: types.KindString}}}}
	result, err := CompileStep(context.Background(), StepInput{
		SpaceID:      "s1",
		Step:         mustJSON(libraryNode("n_cmp", "conditional", "compare", compareConfigOf("m1", "all", fixed("temperatureC", "equal", "25")))),
		UpstreamType: &upstream,
	}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "variable_type_mismatch" || result.Diagnostics[0].Path != "/config/comparisons/0/left" {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}
}
