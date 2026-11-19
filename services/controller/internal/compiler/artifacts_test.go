package compiler

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

func stepByID(t *testing.T, resolved []types.Resolved, id string) types.Resolved {
	t.Helper()
	for _, step := range resolved {
		if step.StepID == id {
			return step
		}
	}
	t.Fatalf("step %s was not resolved", id)
	return types.Resolved{}
}

func nodes(config map[string]any) []any {
	return config["nodes"].([]any)
}

func metadata(config map[string]any, index int) map[string]any {
	return nodes(config)[index].(map[string]any)["metadata"].(map[string]any)
}

func TestTypesPropagateFromTheSourceModel(t *testing.T) {
	result := compile(t, channel(nil))

	source := stepByID(t, result.Types, "n_http")
	if source.Input != nil || source.Output == nil || source.Output.ModelRef != "m1" {
		t.Fatalf("source should output its declared model: %+v", source)
	}
	for _, id := range []string{"n_filter", "n_email"} {
		step := stepByID(t, result.Types, id)
		if step.Input == nil || step.Input.ID() != source.Output.ID() {
			t.Fatalf("step %s should receive the source model without declaring it: %+v", id, step)
		}
	}

	variables := stepByID(t, result.Types, "n_filter").Variables
	for _, want := range []types.Variable{{Path: "input.temperatureC", Kind: types.KindNumber}, {Path: "input.location.lat", Kind: types.KindNumber}} {
		if !slices.Contains(variables, want) {
			t.Fatalf("variables %v do not contain %v", variables, want)
		}
	}
}

func TestSourceWithoutModelEmitsBytes(t *testing.T) {
	result := compile(t, channel(func(config map[string]any) {
		metadata(config, 0)["dependencies"].(map[string]any)["models"] = []any{}
	}))
	if output := stepByID(t, result.Types, "n_http").Output; output == nil || output.Kind != types.KindBytes {
		t.Fatalf("output = %+v", output)
	}
}

func withTransform(outputModel string, inputDataTypes []any) func(map[string]any) {
	return func(config map[string]any) {
		filter := metadata(config, 1)
		filter["label"] = "transform"
		models := []any{map[string]any{"modelId": "m1", "fieldName": types.InputModelField}}
		if outputModel != "" {
			models = append(models, map[string]any{"modelId": outputModel, "fieldName": types.OutputModelField})
		}
		filter["dependencies"].(map[string]any)["models"] = models
		if inputDataTypes != nil {
			filter["io"] = map[string]any{"inputs": []any{map[string]any{"id": "input", "dataType": inputDataTypes}}}
		}
	}
}

func TestTransformDeclaresItsOutput(t *testing.T) {
	result := compile(t, channel(withTransform("m2", nil)))
	email := stepByID(t, result.Types, "n_email")
	if email.Input == nil || email.Input.ModelRef != "m2" {
		t.Fatalf("the step after a transform should receive the transform's output model: %+v", email)
	}

	requireProblem(t, problems(t, channel(withTransform("", nil))), "output_type_required")
}

func TestTypeMismatch(t *testing.T) {
	// The transform expects m1, but receives m2 from the source.
	requireProblem(t, problems(t, channel(func(config map[string]any) {
		withTransform("m2", nil)(config)
		metadata(config, 0)["dependencies"].(map[string]any)["models"] = []any{map[string]any{"modelId": "m2", "fieldName": "model"}}
	})), "type_mismatch")
}

func TestIncompatibleEdge(t *testing.T) {
	// A timer emits a signal, which the transform does not accept.
	requireProblem(t, problems(t, channel(func(config map[string]any) {
		withTransform("m2", []any{"bytes", "json"})(config)
		source := metadata(config, 0)
		source["label"] = "timer"
		source["config"] = map[string]any{"cronExpression": "* * * * *"}
	})), "incompatible_edge")
}

func TestPayloadSchema(t *testing.T) {
	result := compile(t, channel(nil))
	artifacts := result.Artifacts
	payloads := artifacts.Plan.Payloads
	if payloads.Encoding != plan.PayloadEncodingFlatBuffers || payloads.Schema.Version != artifacts.EncodedSchema.Version || payloads.Schema.Kind != plan.ArtifactPayloadSchema {
		t.Fatalf("plan does not reference its payload schema: %+v", payloads)
	}
	if !strings.HasSuffix(payloads.Schema.Key, ".fbs") {
		t.Fatalf("schema key = %s", payloads.Schema.Key)
	}

	schema := string(artifacts.EncodedSchema.Data)
	var filterInput string
	for _, step := range payloads.Steps {
		if step.StepID == "n_filter" {
			filterInput = step.Input.Table
		}
	}
	if filterInput == "" || !strings.Contains(schema, "table "+filterInput+" {") {
		t.Fatalf("filter input table %q is not in the schema:\n%s", filterInput, schema)
	}
	// The bundle relates each model to its payload table.
	if model := artifacts.Bundle.Models[0]; model.Payload.Table != filterInput || model.Payload.ModelRef != "m1" {
		t.Fatalf("model payload = %+v, want table %s", model.Payload, filterInput)
	}
	for _, want := range []string{"temperatureC:double;", "deviceId:string (required);"} {
		if !strings.Contains(schema, want) {
			t.Fatalf("schema does not contain %q:\n%s", want, schema)
		}
	}

	// Validate the schema with flatc when it is installed.
	flatc, err := exec.LookPath("flatc")
	if err != nil {
		t.Log("flatc is not installed; skipping schema compilation")
		return
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "payloads.fbs")
	if err := os.WriteFile(path, artifacts.EncodedSchema.Data, 0o600); err != nil {
		t.Fatal(err)
	}
	if output, err := exec.Command(flatc, "--go", "-o", dir, path).CombinedOutput(); err != nil {
		t.Fatalf("flatc rejected the schema: %v\n%s\n%s", err, output, schema)
	}
}

func TestDependencyBundleKeepsSensitiveValuesOut(t *testing.T) {
	result := compile(t, channel(func(config map[string]any) {
		email := metadata(config, 2)
		email["dependencies"].(map[string]any)["things"] = []any{
			map[string]any{"thingId": "t1", "fieldName": "mailer::thing"},
			map[string]any{"thingId": "t2", "fieldName": "broker::thing"},
			map[string]any{"thingId": "t3", "fieldName": "kafka::thing"},
		}
	}))
	bundle := result.Artifacts.Bundle
	encoded := string(result.Artifacts.EncodedBundle.Data)
	for _, sensitive := range []string{"PRIVATE", "keypair", "inline", `"apiKey":"SENDGRID_KEY"`} {
		if strings.Contains(encoded, sensitive) {
			t.Fatalf("bundle contains %q:\n%s", sensitive, encoded)
		}
	}

	byID := map[string]plan.Connection{}
	for _, connection := range bundle.Connections {
		byID[connection.ID] = connection
	}
	if ref := byID["t1"].SecretFields["apiKey"]; ref != SecretRef("s1", "SENDGRID_KEY") {
		t.Fatalf("apiKey ref = %q", ref)
	}
	if ref := byID["t2"].CertificateFields["certificateId"]; ref != CertificateRef("s1", "cert1") {
		t.Fatalf("certificate ref = %q", ref)
	}
	var mqtt map[string]any
	if err := json.Unmarshal(byID["t2"].Attributes, &mqtt); err != nil || mqtt["clientId"] != "c" {
		t.Fatalf("non-sensitive attributes should be kept: %s", byID["t2"].Attributes)
	}
	if string(byID["t3"].Attributes) != "null" {
		t.Fatalf("attributes of a category with unknown sensitive fields must not be embedded: %s", byID["t3"].Attributes)
	}
	if len(bundle.Secrets) != 2 || len(bundle.Certificates) != 1 || bundle.Certificates[0].ID != "cert1" {
		t.Fatalf("secrets = %+v, certificates = %+v", bundle.Secrets, bundle.Certificates)
	}
}

func TestCompileStep(t *testing.T) {
	step, _ := json.Marshal(map[string]any{
		"id": "n_transform",
		"metadata": map[string]any{
			"type": "processing", "label": "transform", "config": map[string]any{},
			"dependencies": map[string]any{"models": []any{
				map[string]any{"modelId": "m1", "fieldName": types.InputModelField},
				map[string]any{"modelId": "m2", "fieldName": types.OutputModelField},
			}},
		},
	})

	// The upstream type comes from an earlier compilation of the channel.
	upstream := stepByID(t, compile(t, channel(nil)).Types, "n_http").Output
	result, err := CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: step, UpstreamType: upstream}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 0 || result.Types.Output == nil || result.Types.Output.ModelRef != "m2" || len(result.Types.Variables) == 0 {
		t.Fatalf("unexpected result: %+v", result)
	}

	// A mismatching upstream type is reported the same way as in a full compilation.
	result, err = CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: step, UpstreamType: &types.Type{Kind: types.KindObject}}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	requireProblem(t, []string{result.Diagnostics[0].Code}, "type_mismatch")
}

func TestParseType(t *testing.T) {
	if parsed, err := ParseType(nil); parsed != nil || err != nil {
		t.Fatalf("empty input = %v, %v", parsed, err)
	}
	if _, err := ParseType([]byte(`{"kind":"object","unknown":1}`)); err == nil {
		t.Fatal("expected unknown fields to be rejected")
	}
	parsed, err := ParseType([]byte(`{"kind":"object","fields":[{"name":"a","type":{"kind":"string"}}]}`))
	if err != nil || len(parsed.Fields) != 1 {
		t.Fatalf("parsed = %+v, %v", parsed, err)
	}
}
