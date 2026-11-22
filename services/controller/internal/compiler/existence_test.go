package compiler

import (
	"context"
	"slices"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// existenceChannel returns a channel with a library HTTP source (whose output model is m1) connected to an
// existence step, whose success and failure branches lead to log steps. Edges from the existence step use
// the given ports.
func existenceChannel(config map[string]any, successPort, failurePort string) []byte {
	edge := func(id, from, fromPort, to string) map[string]any {
		return map[string]any{"id": id, "from": map[string]any{"nodeId": from, "ioId": fromPort}, "to": map[string]any{"nodeId": to, "ioId": "input"}}
	}
	return channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(map[string]any{"modelId": "m1"}),
			libraryNode("n_exists", "conditional", "existence", config),
			libraryNode("n_pass", "action", "log", map[string]any{"level": "info"}),
			libraryNode("n_fail", "action", "log", map[string]any{"level": "warn"}),
		}
		c["edges"] = []any{
			edge("e1", "n_src", "output", "n_exists"),
			edge("e2", "n_exists", successPort, "n_pass"),
			edge("e3", "n_exists", failurePort, "n_fail"),
		}
	})
}

func TestCompileExistenceStepChecksEveryModelField(t *testing.T) {
	result := compile(t, existenceChannel(map[string]any{"modelId": "m3", "match": "all"}, "success", "failure"))
	step := planStep(result.Artifacts.Plan, "n_exists")
	if step.Type != "conditional.existence" || !slices.Equal(step.ModelRefs, []string{"m3"}) {
		t.Fatalf("unexpected step: %+v", step)
	}
	if want := `{"modelRef":"m3","paths":["deviceId","location.lat","readings[].token"]}`; string(step.Compiled) != want {
		t.Fatalf("compiled = %s, want %s", step.Compiled, want)
	}
	// The input passes through to both branches.
	for _, id := range []string{"n_exists", "n_pass", "n_fail"} {
		if output := resolvedByID(result, id).Output; output == nil || output.ModelRef != "m1" {
			t.Fatalf("%s output = %+v", id, output)
		}
	}
	edges := result.Artifacts.Plan.Channel.Graph.Edges
	if !slices.ContainsFunc(edges, func(e plan.Edge) bool {
		return e.From == "n_exists" && e.FromPort == plan.PortSuccess && e.To == "n_pass"
	}) {
		t.Fatalf("edges = %+v", edges)
	}
}

func TestCompileExistenceStepSelectedFields(t *testing.T) {
	result := compile(t, existenceChannel(map[string]any{"modelId": "m1", "match": "any", "fields": []any{"location", "deviceId"}}, "success", "failure"))
	if got := string(planStep(result.Artifacts.Plan, "n_exists").Compiled); got != `{"modelRef":"m1","paths":["deviceId","location"]}` {
		t.Fatalf("compiled = %s", got)
	}
}

func TestCompileExistenceStepProblems(t *testing.T) {
	requireProblem(t, problems(t, existenceChannel(map[string]any{"modelId": "m1", "match": "all", "fields": []any{"serial"}}, "success", "failure")), "unknown_model_field")
	requireProblem(t, problems(t, existenceChannel(map[string]any{"modelId": "m404", "match": "all"}, "success", "failure")), "model_not_found")
	requireProblem(t, problems(t, existenceChannel(map[string]any{"match": "all"}, "success", "failure")), "invalid_step_config: step n_exists (existence): /modelId")
	// Conditional steps have no generic output.
	requireProblem(t, problems(t, existenceChannel(map[string]any{"modelId": "m1", "match": "all"}, "output", "failure")), "unknown_output_port")
}

func TestCompileStepExistence(t *testing.T) {
	result, err := CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: mustJSON(libraryNode("n_exists", "conditional", "existence", map[string]any{"modelId": "m1", "match": "all"}))}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", result.Diagnostics)
	}
}

// The editor's field picker (modelFields in libs/engine/steps/ts) offers the same paths for this model;
// keep the two lists in sync.
func TestModelPathsMatchFieldPicker(t *testing.T) {
	model, err := types.FromModel("m", []byte(`{
		"c1": {"id": "c1", "key": "deviceId", "type": "string"},
		"c2": {"id": "c2", "key": "location", "type": "object"},
		"c3": {"id": "c3", "key": "lat", "type": "number", "parentId": "c2"},
		"c4": {"id": "c4", "key": "readings", "type": "array", "subtype": "object", "arrayObjectAttributes": {"c5": {"id": "c5", "key": "token", "type": "string", "parentId": "c4"}}},
		"c6": {"key": "tags", "type": "array", "subtype": "string"},
		"c7": {"id": "c7", "key": "active", "type": "boolean"}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for path := range modelPaths(model) {
		got = append(got, path)
	}
	slices.Sort(got)
	want := []string{"active", "deviceId", "location", "location.lat", "readings", "readings[]", "readings[].token", "tags", "tags[]"}
	if !slices.Equal(got, want) {
		t.Fatalf("paths = %v, want %v", got, want)
	}
}
