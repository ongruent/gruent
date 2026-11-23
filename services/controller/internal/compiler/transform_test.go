package compiler

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/types"
)

// mapping returns a transform mapping of target from source ("device.id", "$value" or "$template").
func mapping(target, source string, value ...string) map[string]any {
	m := map[string]any{"target": target, "source": source}
	if len(value) > 0 {
		m["value"] = value[0]
	}
	return m
}

// transformChannel returns a channel with a library HTTP source (output model sourceModel, or none)
// connected to a transform to outputModel with the given mappings, connected to a log step. The transform's
// input type is inferred from the source.
func transformChannel(sourceModel, outputModel string, mappings ...map[string]any) []byte {
	edge := func(id, from, to string) map[string]any {
		return map[string]any{"id": id, "from": map[string]any{"nodeId": from, "ioId": "output"}, "to": map[string]any{"nodeId": to, "ioId": "input"}}
	}
	rows := []any{}
	for _, m := range mappings {
		rows = append(rows, m)
	}
	sourceConfig := map[string]any{}
	if sourceModel != "" {
		sourceConfig["modelId"] = sourceModel
	}
	return channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(sourceConfig),
			libraryNode("n_map", "processing", "transform", map[string]any{"outputModelId": outputModel, "mappings": rows}),
			libraryNode("n_log", "action", "log", map[string]any{"level": "info"}),
		}
		c["edges"] = []any{edge("e1", "n_src", "n_map"), edge("e2", "n_map", "n_log")}
	})
}

func TestCompileTransformStep(t *testing.T) {
	// m1 (telemetry: temperatureC, deviceId, location.lat) to m2 (alert: a required message).
	result := compile(t, transformChannel("m1", "m2", mapping("message", "$template", "Device {{ deviceId }} at {{location.lat}}")))
	step := planStep(result.Artifacts.Plan, "n_map")
	want := `{"outputModelRef":"m2","rules":[{"required":true,"source":{"kind":"template","parts":[{"text":"Device "},{"path":"deviceId"},{"text":" at "},{"path":"location.lat"}]},"target":"message"}]}`
	if string(step.Compiled) != want {
		t.Fatalf("compiled = %s", step.Compiled)
	}
	// The input is the source's output; the output model is the step's output type.
	if input := resolvedByID(result, "n_map").Input; input == nil || input.ModelRef != "m1" {
		t.Fatalf("transform input = %+v", input)
	}
	if output := resolvedByID(result, "n_log").Input; output == nil || output.ModelRef != "m2" {
		t.Fatalf("log input = %+v", output)
	}

	// Input fields and fixed values typed by the output field, into m1 itself.
	result = compile(t, transformChannel("m1", "m1",
		mapping("deviceId", "deviceId"),
		mapping("temperatureC", "$value", " 21.5 "),
		mapping("location.lat", "location.lat"),
	))
	got := string(planStep(result.Artifacts.Plan, "n_map").Compiled)
	for _, part := range []string{
		`{"required":true,"source":{"kind":"variable","path":"deviceId"},"target":"deviceId"}`,
		`{"required":true,"source":{"kind":"value","value":21.5},"target":"temperatureC"}`,
		`{"source":{"kind":"variable","path":"location.lat"},"target":"location.lat"}`,
	} {
		if !strings.Contains(got, part) {
			t.Fatalf("compiled = %s, missing %s", got, part)
		}
	}

	// Text without input fields is a fixed value.
	result = compile(t, transformChannel("m1", "m2", mapping("message", "$template", "Hot")))
	if got := string(planStep(result.Artifacts.Plan, "n_map").Compiled); !strings.Contains(got, `{"kind":"value","value":"Hot"}`) {
		t.Fatalf("compiled = %s", got)
	}
}

func TestCompileTransformStepWithoutInputModel(t *testing.T) {
	// Fixed values don't read the input, so they work even if it has no model.
	result := compile(t, transformChannel("", "m2", mapping("message", "$value", "Hot")))
	if got := string(planStep(result.Artifacts.Plan, "n_map").Compiled); got != `{"outputModelRef":"m2","rules":[{"required":true,"source":{"kind":"value","value":"Hot"},"target":"message"}]}` {
		t.Fatalf("compiled = %s", got)
	}

	// Input fields of an input without a model are reported explicitly.
	for _, m := range []map[string]any{mapping("message", "deviceId"), mapping("message", "$template", "Device {{deviceId}}")} {
		result, err := Compile(context.Background(), input(transformChannel("", "m2", m)), resolver)
		if err != nil {
			t.Fatal(err)
		}
		if !slices.ContainsFunc(result.Diagnostics, func(d types.Diagnostic) bool {
			return d.Code == "untyped_transform_input" && d.Path == "/config/mappings/0/source"
		}) {
			t.Fatalf("diagnostics = %+v", result.Diagnostics)
		}
	}
}

func TestCompileTransformStepProblems(t *testing.T) {
	for name, test := range map[string]struct {
		output   string
		mappings []map[string]any
		code     string
		path     string
	}{
		"unknown output field": {"m2", []map[string]any{mapping("message", "$value", "x"), mapping("severity", "$value", "1")}, "is not a field of the output model", "/config/mappings/1/target"},
		"unknown input field":  {"m2", []map[string]any{mapping("message", "serial")}, "is not part of the input", "/config/mappings/0/source"},
		"type mismatch":        {"m2", []map[string]any{mapping("message", "temperatureC")}, "doesn't match message", "/config/mappings/0/source"},
		"not a number":         {"m1", []map[string]any{mapping("deviceId", "deviceId"), mapping("temperatureC", "$value", "warm")}, "is not a number", "/config/mappings/1/value"},
		"fixed object":         {"m1", []map[string]any{mapping("deviceId", "deviceId"), mapping("temperatureC", "temperatureC"), mapping("location", "$value", "x")}, "not object fields", "/config/mappings/2/value"},
		"no value":             {"m2", []map[string]any{mapping("message", "$value")}, "a value is required", "/config/mappings/0/value"},
		"template into number": {"m1", []map[string]any{mapping("deviceId", "deviceId"), mapping("temperatureC", "$template", "{{deviceId}}")}, "is not a text field", "/config/mappings/1/value"},
		"template field":       {"m2", []map[string]any{mapping("message", "$template", "{{serial}}")}, "is not part of the input", "/config/mappings/0/value"},
		"duplicate":            {"m2", []map[string]any{mapping("message", "$value", "a"), mapping("message", "$value", "b")}, "is already set", "/config/mappings/1/target"},
		"overlap":              {"m1", []map[string]any{mapping("deviceId", "deviceId"), mapping("temperatureC", "temperatureC"), mapping("location", "location"), mapping("location.lat", "location.lat")}, "is already set", "/config/mappings/3/target"},
		"single into items":    {"m3", []map[string]any{mapping("readings[].token", "deviceId")}, "is a single value", "/config/mappings/0/source"},
		"unmapped required":    {"m1", []map[string]any{mapping("location.lat", "location.lat")}, "unmapped_required_field", "/config/mappings"},
	} {
		t.Run(name, func(t *testing.T) {
			config := transformChannel("m1", test.output, test.mappings...)
			requireProblem(t, problems(t, config), test.code)
			result, err := Compile(context.Background(), input(config), resolver)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.ContainsFunc(result.Diagnostics, func(d types.Diagnostic) bool { return d.Severity == "error" && d.Path == test.path }) {
				t.Fatalf("no error at %s: %+v", test.path, result.Diagnostics)
			}
		})
	}
}

func TestCompileStepTransformUsesTheUpstreamType(t *testing.T) {
	step := mustJSON(libraryNode("n_map", "processing", "transform", map[string]any{"outputModelId": "m2", "mappings": []any{mapping("message", "status")}}))

	// Without upstream context, input fields can't be checked yet.
	result, err := CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: step}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}

	upstream := types.Type{Kind: types.KindObject, Fields: []types.Field{{Name: "status", Type: types.Type{Kind: types.KindNumber}}}}
	result, err = CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: step, UpstreamType: &upstream}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "invalid_mapping" || result.Diagnostics[0].Path != "/config/mappings/0/source" {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}
}
