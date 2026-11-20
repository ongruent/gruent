package channelsValidate

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/ongruent/gruent/libs/engine/steps"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/libs/legacy/engine/channels"
	"go.opentelemetry.io/otel/trace/noop"
)

func TestLibraryStepErrors(t *testing.T) {
	registry, err := steps.EmbeddedLibrary()
	if err != nil {
		t.Fatal(err)
	}
	var nodes []channels.Node
	err = json.Unmarshal([]byte(`[
		{"id": "valid", "metadata": {"pluginType": "http-source", "pluginVersion": 1, "type": "source", "config": {"method": "POST", "responseMode": "sync", "responseTimeout": 10}}},
		{"id": "invalid", "metadata": {"pluginType": "http-source", "pluginVersion": 1, "type": "source", "config": {"method": "TRACE", "responseMode": "sync"}}},
		{"id": "unknown", "metadata": {"pluginType": "http-source", "pluginVersion": 7, "type": "source", "config": {}}},
		{"id": "category", "metadata": {"pluginType": "timer-source", "pluginVersion": 1, "type": "action", "config": {"cronExpression": "@hourly"}}},
		{"id": "legacy", "metadata": {"label": "http", "type": "source", "config": {"method": "nope"}}}
	]`), &nodes)
	if err != nil {
		t.Fatal(err)
	}

	errors := libraryStepErrors(registry, nodes)
	if _, ok := errors["valid"]; ok {
		t.Fatalf("valid step reported: %v", errors["valid"])
	}
	if _, ok := errors["legacy"]; ok {
		t.Fatal("steps without a plugin identity must be skipped")
	}
	if got := errors["invalid"]; len(got) != 2 || !slices.ContainsFunc(got, func(e string) bool { return e[:7] == "/method" }) {
		t.Fatalf("invalid step errors = %v", got)
	}
	if got := errors["unknown"]; len(got) != 1 || got[0] != "http-source@7 is not in the step library" {
		t.Fatalf("unknown step errors = %v", got)
	}
	if got := errors["category"]; len(got) != 1 {
		t.Fatalf("category errors = %v", got)
	}
}

// TestExecuteLibraryChannel validates a channel as the channel editor saves steps from the step library:
// legacy channel validation must accept their categories, and valid configurations report no errors.
func TestExecuteLibraryChannel(t *testing.T) {
	var config channels.Channel
	err := json.Unmarshal([]byte(`{
		"runtime": {"size": "small"},
		"nodes": [
			{"id": "src", "metadata": {"type": "source", "label": "http-source", "name": "http-source", "version": "1", "pluginType": "http-source", "pluginVersion": 1,
				"config": {"method": "POST", "responseMode": "sync", "responseTimeout": 10}, "dependencies": {"models": [], "things": []}}},
			{"id": "act", "metadata": {"type": "action", "label": "log", "name": "log", "version": "1", "pluginType": "log", "pluginVersion": 1,
				"config": {"level": "info"}, "dependencies": {"models": [], "things": []}}},
			{"id": "act", "metadata": {"type": "action", "label": "hello-world", "name": "hello-world", "version": "1", "pluginType": "hello-world", "pluginVersion": 1,
				"config": {}, "dependencies": {"models": [], "things": []}}}
		],
		"edges": [
			{"id": "e1", "from": {"nodeId": "src", "ioId": "output"}, "to": {"nodeId": "act", "ioId": "input"}}
		]
	}`), &config)
	if err != nil {
		t.Fatal(err)
	}

	output, err := execute(&gruenthttp.Request[Input]{Span: noop.Span{}, Context: context.Background(), Input: Input{SpaceId: "s1", Config: config}})
	if err != nil {
		t.Fatal(err)
	}
	for id, errors := range output.StepErrors {
		for _, message := range errors {
			if strings.HasPrefix(message, "Invalid node type") {
				t.Fatalf("step %s: %s", id, message)
			}
		}
	}
	if len(output.StepErrors) != 0 || len(output.ChannelErrors) != 0 {
		t.Fatalf("unexpected errors: %+v", output)
  }
	if _, ok := output.StepErrors["src"]; ok {
		t.Fatalf("valid HTTP source reported: %v", output.StepErrors["src"])
	}
}
