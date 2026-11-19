package compiler

import (
	"context"
	"slices"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// logChannel returns a channel with a library HTTP source (whose output model is sourceModel, if any)
// connected to a log step.
func logChannel(sourceModel string, logConfig map[string]any) []byte {
	sourceConfig := map[string]any{}
	if sourceModel != "" {
		sourceConfig["modelId"] = sourceModel
	}
	return channel(func(config map[string]any) {
		config["nodes"] = []any{httpSource(sourceConfig), libraryNode("n_log", "action", "log", logConfig)}
		config["edges"] = []any{
			map[string]any{"id": "e1", "from": map[string]any{"nodeId": "n_src", "ioId": "output"}, "to": map[string]any{"nodeId": "n_log", "ioId": "input"}},
		}
	})
}

func warnings(result *Result) []string {
	var codes []string
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Severity == "warning" {
			codes = append(codes, diagnostic.Code+" "+diagnostic.StepID)
		}
	}
	return codes
}

func TestCompileLogStepWithoutRedaction(t *testing.T) {
	result := compile(t, logChannel("m1", map[string]any{"level": "info"}))
	step := planStep(result.Artifacts.Plan, "n_log")
	if step.Type != "action.log" || step.Redaction != nil || len(step.ModelRefs) != 0 {
		t.Fatalf("unexpected log step: %+v", step)
	}
	// The log step passes its input through.
	if output := resolvedByID(result, "n_log").Output; output == nil || output.ModelRef != "m1" {
		t.Fatalf("log output = %+v", output)
	}
}

func TestCompileLogStepRedaction(t *testing.T) {
	result := compile(t, logChannel("m1", map[string]any{"level": "warn", "message": "Reading", "redactionModelId": "m3"}))
	step := planStep(result.Artifacts.Plan, "n_log")

	want := &plan.Redaction{ModelRef: "m3", Paths: []string{"deviceId", "location.lat", "readings[].token"}, Replacement: "[REDACTED]"}
	if !jsonEqual(step.Redaction, want) {
		t.Fatalf("redaction = %+v", step.Redaction)
	}
	if !slices.Equal(step.ModelRefs, []string{"m3"}) {
		t.Fatalf("model refs = %v", step.ModelRefs)
	}
	// The sensitive fields model is a dependency, not the step's type: the input passes through.
	if output := resolvedByID(result, "n_log").Output; output == nil || output.ModelRef != "m1" {
		t.Fatalf("log output = %+v", output)
	}
	if models := result.Artifacts.Bundle.Models; !slices.ContainsFunc(models, func(m plan.Model) bool { return m.ID == "m3" }) {
		t.Fatal("the sensitive fields model is not in the dependency bundle")
	}
	// readings[].token is not part of the telemetry input, so it is reported, but doesn't block publishing.
	if got := warnings(result); !slices.Equal(got, []string{"redaction_field_not_in_input n_log"}) {
		t.Fatalf("warnings = %v", got)
	}
}

func TestCompileLogStepRedactionWithUntypedInput(t *testing.T) {
	result := compile(t, logChannel("", map[string]any{"level": "info", "redactionModelId": "m3"}))
	if got := warnings(result); !slices.Equal(got, []string{"redaction_untyped_input n_log"}) {
		t.Fatalf("warnings = %v", got)
	}
	if step := planStep(result.Artifacts.Plan, "n_log"); step.Redaction == nil || len(step.Redaction.Paths) != 3 {
		t.Fatalf("redaction = %+v", step.Redaction)
	}
}

func TestCompileLogStepProblems(t *testing.T) {
	requireProblem(t, problems(t, logChannel("m1", map[string]any{"level": "info", "redactionModelId": "m404"})), "model_not_found")
	requireProblem(t, problems(t, logChannel("m1", map[string]any{"level": "verbose"})), "invalid_step_config: step n_log (log): /level")
}

func TestCompileStepLog(t *testing.T) {
	result, err := CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: mustJSON(libraryNode("n_log", "action", "log", map[string]any{"level": "info", "redactionModelId": "m3"}))}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}
}
