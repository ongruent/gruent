package compiler

import "testing"

// responseChannel returns a channel with the given source connected to an HTTP response step.
func responseChannel(source map[string]any) []byte {
	return channel(func(c map[string]any) {
		c["nodes"] = []any{source, libraryNode("n_res", "action", "http-response", map[string]any{"statusCode": 200, "body": "input"})}
		c["edges"] = []any{
			map[string]any{"id": "e1", "from": map[string]any{"nodeId": source["id"], "ioId": "output"}, "to": map[string]any{"nodeId": "n_res", "ioId": "input"}},
		}
	})
}

func TestCompileHTTPResponseStep(t *testing.T) {
	result := compile(t, responseChannel(httpSource(nil)))
	if step := planStep(result.Artifacts.Plan, "n_res"); step.Type != "action.http-response" {
		t.Fatalf("unexpected step: %+v", step)
	}
	requireProblem(t, problems(t, responseChannel(httpSource(map[string]any{"responseMode": "async"}))), "http_response_async_source")
	timer := libraryNode("n_src", "source", "timer-source", map[string]any{"cronExpression": "* * * * *"})
	requireProblem(t, problems(t, responseChannel(timer)), "http_response_without_http_source")
}

// TestCompileHTTPResponseBranches compiles an HTTP source whose existence check answers 200 on success and
// 500 on failure, each through its own HTTP response step.
func TestCompileHTTPResponseBranches(t *testing.T) {
	edge := func(id, from, fromPort, to string) map[string]any {
		return map[string]any{"id": id, "from": map[string]any{"nodeId": from, "ioId": fromPort}, "to": map[string]any{"nodeId": to, "ioId": "input"}}
	}
	result := compile(t, channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(map[string]any{"modelId": "m1"}),
			libraryNode("n_exists", "conditional", "existence", map[string]any{"modelId": "m1", "match": "all", "fields": []any{"deviceId"}}),
			libraryNode("n_ok", "action", "http-response", map[string]any{"statusCode": 200, "body": "input"}),
			libraryNode("n_err", "action", "http-response", map[string]any{"statusCode": 500, "body": "none"}),
		}
		c["edges"] = []any{
			edge("e1", "n_src", "output", "n_exists"),
			edge("e2", "n_exists", "success", "n_ok"),
			edge("e3", "n_exists", "failure", "n_err"),
		}
	}))
	p := result.Artifacts.Plan
	if len(p.Bindings.HTTP) != 1 || p.Bindings.HTTP[0].StepID != "n_src" || p.Bindings.HTTP[0].ResponseMode != "sync" {
		t.Fatalf("http bindings = %+v", p.Bindings.HTTP)
	}
	if step := planStep(p, "n_src"); step.Definition == nil || step.Definition.PluginType != "http-source" {
		t.Fatalf("source step = %+v", step)
	}
	for _, id := range []string{"n_ok", "n_err"} {
		if step := planStep(p, id); step.Type != "action.http-response" {
			t.Fatalf("%s = %+v", id, step)
		}
	}
}
