package compiler

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/steps"
	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// libraryNode returns a step as the hub stores steps created from the step library (createPluginNode):
// generic I/O ports that accept bytes, no legacy dependencies, and the plugin identity next to the config.
func libraryNode(id, category, pluginType string, config map[string]any) map[string]any {
	inputs := []any{map[string]any{"id": "input", "allowedEdge": []any{"*"}, "dataType": []any{"bytes"}}}
	if category == "source" {
		inputs = []any{}
	}
	return map[string]any{
		"id":          id,
		"coordinates": map[string]any{"x": 0, "y": 0},
		"metadata": map[string]any{
			"pluginType": pluginType, "pluginVersion": 1, "version": "1",
			"name": pluginType, "label": pluginType, "type": category,
			"io": map[string]any{
				"inputs":  inputs,
				"outputs": []any{map[string]any{"id": "output", "allowedEdge": []any{"processing", "action", "conditional", "custom"}, "dataType": []any{"bytes"}}},
			},
			"config":       config,
			"dependencies": map[string]any{"models": []any{}, "things": []any{}},
		},
	}
}

// libraryChannel returns a channel with a library source connected to a legacy filter step.
func libraryChannel(source map[string]any) []byte {
	return channel(func(config map[string]any) {
		config["nodes"] = []any{source, config["nodes"].([]any)[1]}
		config["edges"] = []any{
			map[string]any{"id": "e1", "from": map[string]any{"nodeId": source["id"], "ioId": "output"}, "to": map[string]any{"nodeId": "n_filter", "ioId": "input"}},
		}
	})
}

func httpSource(config map[string]any) map[string]any {
	base := map[string]any{"method": "POST", "responseMode": "sync", "responseTimeout": 10}
	for key, value := range config {
		base[key] = value
	}
	return libraryNode("n_src", "source", "http-source", base)
}

func planStep(p plan.Plan, id string) plan.Step {
	index := slices.IndexFunc(p.Channel.Graph.Steps, func(s plan.Step) bool { return s.ID == id })
	return p.Channel.Graph.Steps[index]
}

func resolvedByID(result *Result, id string) types.Resolved {
	index := slices.IndexFunc(result.Types, func(r types.Resolved) bool { return r.StepID == id })
	return result.Types[index]
}

func TestCompileLibraryHTTPSource(t *testing.T) {
	result := compile(t, libraryChannel(httpSource(map[string]any{"modelId": "m1"})))
	p := result.Artifacts.Plan

	step := planStep(p, "n_src")
	library, err := steps.EmbeddedLibrary()
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := library.Resolve(steps.Identity{PluginType: "http-source", PluginVersion: 1})
	if step.Type != "source.http-source" || step.Version != "1" || step.BindingRef != "bind_n_src" ||
		step.Definition == nil || *step.Definition != (plan.StepDefinition{PluginType: "http-source", PluginVersion: 1, Digest: entry.Definition.Digest()}) {
		t.Fatalf("unexpected step: %+v", step)
	}
	if !slices.Equal(step.ModelRefs, []string{"m1"}) {
		t.Fatalf("model refs = %v", step.ModelRefs)
	}

	// The selected model is the source's output, and generic library ports accept it.
	if output := resolvedByID(result, "n_src").Output; output == nil || output.ModelRef != "m1" {
		t.Fatalf("source output = %+v", output)
	}

	want := plan.HTTPBinding{
		BindingID: "bind_n_src", StepID: "n_src", Method: "POST", Path: "/v1/trigger/http/c1",
		ResponseMode: "sync", TimeoutMs: 10000, Subject: "gruent.v1.invocations.c1",
		InputModelRefs: []string{"m1"}, Overflow: plan.Overflow{Action: plan.OverflowReject, HTTPStatus: 429},
	}
	got := p.Bindings.HTTP
	if len(got) != 1 || !jsonEqual(got[0], want) {
		t.Fatalf("HTTP bindings = %+v", got)
	}
	routingArtifact := result.Artifacts.Routing
	if !jsonEqual(routingArtifact.Bindings, p.Bindings) || len(routingArtifact.InputModels) != 1 || routingArtifact.InputModels[0].ID != "m1" {
		t.Fatalf("routing artifact = %+v", routingArtifact)
	}
}

func TestCompileLibraryHTTPSourceAsync(t *testing.T) {
	result := compile(t, libraryChannel(httpSource(map[string]any{"responseMode": "async"})))
	binding := result.Artifacts.Plan.Bindings.HTTP[0]
	if binding.ResponseMode != routing.ResponseModeAsync || binding.TimeoutMs != asyncAdmissionTimeoutMs {
		t.Fatalf("unexpected binding: %+v", binding)
	}
	// Without a model, the request body is opaque bytes.
	if output := resolvedByID(result, "n_src").Output; output == nil || output.Kind != types.KindBytes {
		t.Fatalf("source output = %+v", output)
	}
}

func TestCompileLibraryTimerSource(t *testing.T) {
	for _, expression := range []string{"0 */5 * * * *", "*/15 * * * *", "@hourly"} {
		result := compile(t, libraryChannel(libraryNode("n_src", "source", "timer-source", map[string]any{"cronExpression": expression})))
		timers := result.Artifacts.Plan.Bindings.Timer
		if len(timers) != 1 || timers[0].CronExpression != expression || timers[0].Subject != "gruent.v1.invocations.c1" || timers[0].Overflow.Action != plan.OverflowSkip {
			t.Fatalf("%s: unexpected timer bindings %+v", expression, timers)
		}
		if output := resolvedByID(result, "n_src").Output; output == nil || output.Kind != types.KindSignal {
			t.Fatalf("timer output = %+v", output)
		}
	}
}

func TestCompileLibraryMessageQueueSource(t *testing.T) {
	source := libraryNode("n_src", "source", "message-queue-source", map[string]any{
		"broker": "NATS_CLIENT", "connectionId": "t4", "topic": "sensors.*.temperature", "modelId": "m1",
	})
	result := compile(t, libraryChannel(source))
	p := result.Artifacts.Plan

	if step := planStep(p, "n_src"); !slices.Equal(step.ConnectionRefs, []string{"t4"}) || !slices.Equal(step.ModelRefs, []string{"m1"}) {
		t.Fatalf("unexpected step dependencies: %+v", step)
	}
	want := plan.MessageQueueBinding{
		BindingID: "bind_n_src", StepID: "n_src", Broker: "NATS_CLIENT", ConnectionRef: "t4", Topic: "sensors.*.temperature",
		Subject: "gruent.v1.invocations.c1", InputModelRefs: []string{"m1"}, Overflow: plan.Overflow{Action: plan.OverflowPause},
	}
	if got := p.Bindings.MessageQueue; len(got) != 1 || !jsonEqual(got[0], want) {
		t.Fatalf("message queue bindings = %+v", got)
	}
	if connections := result.Artifacts.Bundle.Connections; len(connections) != 1 || connections[0].ID != "t4" || string(connections[0].Attributes) == "null" {
		t.Fatalf("bundle connections = %+v", connections)
	}
}

func TestCompileLibrarySourceProblems(t *testing.T) {
	cases := map[string]struct {
		source  map[string]any
		problem string
	}{
		"schema violation": {httpSource(map[string]any{"method": "TRACE"}), "invalid_step_config: step n_src (http-source): /method"},
		"unknown version": {func() map[string]any {
			node := httpSource(nil)
			node["metadata"].(map[string]any)["pluginVersion"] = 99
			return node
		}(), "unknown_step_definition: step n_src uses http-source@99"},
		"category mismatch":          {libraryNode("n_src", "source", "hello-world", map[string]any{"greeting": "Hi", "language": "en", "repeatCount": 1}), "step_category_mismatch"},
		"invalid cron":               {libraryNode("n_src", "source", "timer-source", map[string]any{"cronExpression": "every minute"}), "invalid_cron_expression"},
		"cron time zone":             {libraryNode("n_src", "source", "timer-source", map[string]any{"cronExpression": "CRON_TZ=Europe/Paris 0 9 * * *"}), "cannot set a time zone"},
		"model not found":            {httpSource(map[string]any{"modelId": "m404"}), "model_not_found"},
		"connection category":        {libraryNode("n_src", "source", "message-queue-source", map[string]any{"broker": "KAFKA_CONSUMER", "connectionId": "t4", "topic": "readings"}), "connection_category_mismatch"},
		"connection not found":       {libraryNode("n_src", "source", "message-queue-source", map[string]any{"broker": "NATS_CLIENT", "connectionId": "t404", "topic": "readings"}), "connection_not_found"},
		"invalid NATS subject":       {libraryNode("n_src", "source", "message-queue-source", map[string]any{"broker": "NATS_CLIENT", "connectionId": "t4", "topic": "a.>.b"}), "not a valid NATS subject"},
		"invalid Kafka topic":        {libraryNode("n_src", "source", "message-queue-source", map[string]any{"broker": "KAFKA_CONSUMER", "connectionId": "t5", "topic": "a topic"}), "not a valid Kafka topic"},
		"unsupported library source": {libraryNode("n_src", "source", "hello-world", map[string]any{}), "unsupported_source"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			requireProblem(t, problems(t, libraryChannel(c.source)), c.problem)
		})
	}
}

func TestCompileLibrarySchemaViolationIsReportedOnce(t *testing.T) {
	result, err := Compile(context.Background(), input(libraryChannel(httpSource(map[string]any{"responseTimeout": 99}))), resolver)
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, diagnostic := range result.Diagnostics {
		paths = append(paths, diagnostic.Code+" "+diagnostic.Path)
	}
	if !slices.Equal(paths, []string{"invalid_step_config /config/responseTimeout"}) {
		t.Fatalf("diagnostics = %v", paths)
	}
}

func TestCompileStepLibrarySource(t *testing.T) {
	node, err := json.Marshal(httpSource(map[string]any{"modelId": "m1"}))
	if err != nil {
		t.Fatal(err)
	}
	result, err := CompileStep(context.Background(), StepInput{SpaceID: "s1", Step: node}, resolver)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Diagnostics) != 0 || result.Types.Output == nil || result.Types.Output.ModelRef != "m1" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}
