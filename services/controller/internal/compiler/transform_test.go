package compiler

import (
	"strings"
	"testing"
)

// transformChannel returns a channel with a library HTTP source (output model m1, telemetry) connected to a
// transform from m1 to m2 (alert: a required message) with the given rules, connected to a log step.
func transformChannel(outputModel string, mappings ...string) []byte {
	edge := func(id, from, to string) map[string]any {
		return map[string]any{"id": id, "from": map[string]any{"nodeId": from, "ioId": "output"}, "to": map[string]any{"nodeId": to, "ioId": "input"}}
	}
	rules := []any{}
	for _, mapping := range mappings {
		rules = append(rules, mapping)
	}
	return channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(map[string]any{"modelId": "m1"}),
			libraryNode("n_map", "processing", "transform", map[string]any{"inputModelId": "m1", "outputModelId": outputModel, "mappings": rules}),
			libraryNode("n_log", "action", "log", map[string]any{"level": "info"}),
		}
		c["edges"] = []any{edge("e1", "n_src", "n_map"), edge("e2", "n_map", "n_log")}
	})
}

func TestCompileTransformStep(t *testing.T) {
	result := compile(t, transformChannel("m2", `message = "Device {{ input.deviceId }} at {{input.location.lat}}"`))
	step := planStep(result.Artifacts.Plan, "n_map")
	want := `{"inputModelRef":"m1","outputModelRef":"m2","rules":[{"required":true,"source":{"kind":"template","parts":[{"text":"Device "},{"path":"deviceId"},{"text":" at "},{"path":"location.lat"}]},"target":"message"}]}`
	if string(step.Compiled) != want {
		t.Fatalf("compiled = %s", step.Compiled)
	}
	// The output model is the step's output type.
	if output := resolvedByID(result, "n_log").Input; output == nil || output.ModelRef != "m2" {
		t.Fatalf("log input = %+v", output)
	}

	// Copies, fixed values and arrays into m3 (deviceId, location.lat, readings[].token).
	result = compile(t, transformChannel("m3", "deviceId = input.deviceId", "location.lat = input.temperatureC", "readings = null"))
	if got := string(planStep(result.Artifacts.Plan, "n_map").Compiled); !strings.Contains(got, `{"source":{"kind":"value","value":null},"target":"readings"}`) {
		t.Fatalf("compiled = %s", got)
	}
}

func TestCompileTransformStepProblems(t *testing.T) {
	for name, test := range map[string]struct {
		output string
		rules  []string
		code   string
	}{
		"unknown output field": {"m2", []string{`message = "x"`, "severity = 1"}, "is not a field of the output model"},
		"unknown input value":  {"m2", []string{"message = input.serial"}, "is not part of the input model"},
		"type mismatch":        {"m2", []string{"message = input.temperatureC"}, "doesn't match message"},
		"fixed value type":     {"m2", []string{"message = 25"}, "is a string field, not a number"},
		"required null":        {"m2", []string{"message = null"}, "can't be null"},
		"not a value":          {"m2", []string{"message = warm"}, "is not an input value"},
		"duplicate":            {"m2", []string{`message = "a"`, `message = "b"`}, "is already set"},
		"single into items":    {"m3", []string{"readings[].token = input.deviceId"}, "is a single value"},
		"unmapped required":    {"m1", []string{"location.lat = input.location.lat"}, "unmapped_required_field"},
	} {
		t.Run(name, func(t *testing.T) {
			requireProblem(t, problems(t, transformChannel(test.output, test.rules...)), test.code)
		})
	}
}
