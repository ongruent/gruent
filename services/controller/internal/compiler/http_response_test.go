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
