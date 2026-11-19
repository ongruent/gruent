package channelsValidate

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/ongruent/gruent/libs/engine/steps"
	"github.com/ongruent/gruent/libs/legacy/engine/channels"
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
