package compiler

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

type fakeResolver struct {
	models      map[string]ModelRecord
	connections map[string]ConnectionRecord
	err         error
}

func (f fakeResolver) Model(_ context.Context, _ string, id string) (ModelRecord, error) {
	if f.err != nil {
		return ModelRecord{}, f.err
	}
	model, ok := f.models[id]
	if !ok {
		return ModelRecord{}, ErrNotFound
	}
	return model, nil
}

func (f fakeResolver) Connection(_ context.Context, _ string, id string) (ConnectionRecord, error) {
	connection, ok := f.connections[id]
	if !ok {
		return ConnectionRecord{}, ErrNotFound
	}
	return connection, nil
}

const telemetryAttributes = `{
	"a1": {"id": "a1", "key": "temperatureC", "type": "number", "required": true},
	"a2": {"id": "a2", "key": "deviceId", "type": "string", "required": true},
	"a3": {"id": "a3", "key": "location", "type": "object"},
	"a4": {"id": "a4", "key": "lat", "type": "number", "parentId": "a3"}
}`

var resolver = fakeResolver{
	models: map[string]ModelRecord{
		"m1": {ID: "m1", Name: "Telemetry", Attributes: []byte(telemetryAttributes)},
		"m2": {ID: "m2", Name: "Alert", Attributes: []byte(`{"b1": {"id": "b1", "key": "message", "type": "string", "required": true}}`)},
		"m3": {ID: "m3", Name: "Sensitive telemetry", Attributes: []byte(`{
			"c1": {"id": "c1", "key": "deviceId", "type": "string"},
			"c2": {"id": "c2", "key": "location", "type": "object"},
			"c3": {"id": "c3", "key": "lat", "type": "number", "parentId": "c2"},
			"c4": {"id": "c4", "key": "readings", "type": "array", "subtype": "object", "arrayObjectAttributes": {"c5": {"id": "c5", "key": "token", "type": "string", "parentId": "c4"}}}
		}`)},
		"m4": {ID: "m4", Name: "Device status", Attributes: []byte(`{
			"d1": {"id": "d1", "key": "active", "type": "boolean"},
			"d2": {"id": "d2", "key": "status", "type": "string"},
			"d3": {"id": "d3", "key": "expected", "type": "object"},
			"d4": {"id": "d4", "key": "status", "type": "string", "parentId": "d3"},
			"d5": {"id": "d5", "key": "temperatureC", "type": "string"}
		}`)},
	},
	connections: map[string]ConnectionRecord{
		"t1": {ID: "t1", Name: "Mailer", Category: "SENDGRID_CLIENT", Revision: "sha256:t1", Attributes: []byte(`{"apiKey": "SENDGRID_KEY", "fromEmail": "alerts@example.com"}`)},
		"t2": {ID: "t2", Name: "Broker", Category: "MQTT_CLIENT", Revision: "sha256:t2", Attributes: []byte(`{"clientId": "c", "password": "MQTT_PASSWORD", "certificateId": "cert1", "keypair": {"clientCertKey": "PRIVATE"}}`)},
		"t3": {ID: "t3", Name: "Kafka", Category: "KAFKA_PRODUCER", Revision: "sha256:t3", Attributes: []byte(`{"saslPassword": "inline"}`)},
		"t4": {ID: "t4", Name: "NATS", Category: "NATS_CLIENT", Revision: "sha256:t4", Attributes: []byte(`{"server": {"host": "nats", "port": 4222}}`)},
		"t5": {ID: "t5", Name: "Kafka consumer", Category: "KAFKA_CONSUMER", Revision: "sha256:t5", Attributes: []byte(`{"cluster": "k", "groupId": "g", "autoOffsetReset": "latest"}`)},
	},
}

// channel returns a stored channel configuration with an HTTP source, a filter, and an email action.
func channel(mutate func(map[string]any)) []byte {
	config := map[string]any{
		"id":   "c1",
		"name": "Thermostat Alerts",
		"runtime": map[string]any{
			"size":                    "small",
			"memoryMiB":               512,
			"maxConcurrentExecutions": 10,
		},
		"nodes": []any{
			map[string]any{
				"id":          "n_http",
				"coordinates": map[string]any{"x": 0, "y": 0},
				"metadata": map[string]any{
					"version": "beta-dev", "name": "HTTP", "label": "http", "type": "source",
					"config": map[string]any{"httpServer::thing": "__IOTEA_IGNORE__", "method": "POST", "responseTimeout": 3},
					"dependencies": map[string]any{
						"models": []any{map[string]any{"modelId": "m1", "fieldName": "model"}},
						"things": []any{map[string]any{"internal": true, "thingId": "c1", "fieldName": "httpServer::thing"}},
					},
				},
			},
			map[string]any{
				"id":          "n_filter",
				"coordinates": map[string]any{"x": 100, "y": 0},
				"metadata": map[string]any{
					"version": "beta-dev", "name": "Filter", "label": "filter", "type": "processing",
					"config":       map[string]any{"expression": "input.temperatureC != null && input.deviceId != null"},
					"dependencies": map[string]any{"models": []any{}, "things": []any{}},
				},
			},
			map[string]any{
				"id":          "n_email",
				"coordinates": map[string]any{"x": 200, "y": 0},
				"metadata": map[string]any{
					"version": "beta-dev", "name": "Email", "label": "notification", "type": "action",
					"config": map[string]any{"to": "ops@example.com"},
					"dependencies": map[string]any{
						"models": []any{},
						"things": []any{map[string]any{"internal": false, "thingId": "t1", "fieldName": "mailer::thing"}},
					},
				},
			},
		},
		"edges": []any{
			map[string]any{"id": "e1", "from": map[string]any{"nodeId": "n_http", "ioId": "httpOutput"}, "to": map[string]any{"nodeId": "n_filter", "ioId": "input"}},
			map[string]any{"id": "e2", "from": map[string]any{"nodeId": "n_filter", "ioId": "output"}, "to": map[string]any{"nodeId": "n_email", "ioId": "input"}},
		},
	}
	if mutate != nil {
		mutate(config)
	}
	data, err := json.Marshal(config)
	if err != nil {
		panic(err)
	}
	return data
}

func input(config []byte) Input {
	return Input{OrgID: "o1", SpaceID: "s1", ChannelID: "c1", ChannelName: "Thermostat Alerts", Config: config}
}

func compile(t *testing.T, config []byte) *Result {
	t.Helper()
	result, err := Compile(context.Background(), input(config), resolver)
	if err != nil {
		t.Fatal(err)
	}
	if result.HasErrors() || result.Artifacts == nil {
		t.Fatalf("unexpected diagnostics: %+v", result.Diagnostics)
	}
	return result
}

func problems(t *testing.T, config []byte) []string {
	t.Helper()
	result, err := Compile(context.Background(), input(config), resolver)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasErrors() || result.Artifacts != nil {
		t.Fatalf("expected errors and no artifacts, got %+v", result.Diagnostics)
	}
	var messages []string
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Severity == "error" {
			messages = append(messages, diagnostic.Code+": "+diagnostic.Message)
		}
	}
	return messages
}

func requireProblem(t *testing.T, problems []string, substring string) {
	t.Helper()
	if !slices.ContainsFunc(problems, func(p string) bool { return strings.Contains(p, substring) }) {
		t.Fatalf("expected a problem containing %q, got %v", substring, problems)
	}
}

func TestCompile(t *testing.T) {
	result := compile(t, channel(nil))
	p := result.Artifacts.Plan

	if p.APIVersion != plan.APIVersion || p.Kind != plan.KindPlan || p.Metadata.OrgID != "o1" || p.Channel.Name != "Thermostat Alerts" {
		t.Fatalf("unexpected plan header: %+v", p)
	}
	var stepIDs []string
	for _, step := range p.Channel.Graph.Steps {
		stepIDs = append(stepIDs, step.ID)
	}
	if !slices.Equal(stepIDs, []string{"n_email", "n_filter", "n_http"}) {
		t.Fatalf("steps are not sorted: %v", stepIDs)
	}
	if got := p.Channel.Graph.Steps[0].ConnectionRefs; !slices.Equal(got, []string{"t1"}) {
		t.Fatalf("email step connections = %v", got)
	}
	if got := p.Channel.Graph.Steps[2].ConnectionRefs; len(got) != 0 {
		t.Fatalf("internal connections must not be referenced, got %v", got)
	}

	if len(p.Bindings.HTTP) != 1 || len(p.Bindings.Timer) != 0 {
		t.Fatalf("unexpected bindings: %+v", p.Bindings)
	}
	http := p.Bindings.HTTP[0]
	if http.BindingID != "bind_n_http" || http.Method != "POST" || http.TimeoutMs != 3000 || http.Path != "/v1/trigger/http/c1" ||
		http.ResponseMode != "sync" || http.Subject != "gruent.v1.invocations.c1" {
		t.Fatalf("unexpected HTTP binding: %+v", http)
	}
	if http.Overflow != (plan.Overflow{Action: plan.OverflowReject, HTTPStatus: 429}) {
		t.Fatalf("HTTP overflow = %+v", http.Overflow)
	}
	if !slices.Equal(http.InputModelRefs, []string{"m1"}) {
		t.Fatalf("input models = %v", http.InputModelRefs)
	}

	if p.PublishStrategy.Mode != plan.PublishStrategyReplace {
		t.Fatalf("publish strategy = %+v", p.PublishStrategy)
	}
	bundle := result.Artifacts.Bundle
	if p.Dependencies.Version != result.Artifacts.EncodedBundle.Version || p.Dependencies.Kind != plan.ArtifactDependencyBundle {
		t.Fatalf("plan does not pin its dependency bundle: %+v", p.Dependencies)
	}
	if len(bundle.Models) != 1 || len(bundle.Connections) != 1 {
		t.Fatalf("unexpected dependencies: %+v", bundle)
	}

	resources := p.Policies.Deployment.Resources
	if resources != (plan.Resources{AllocationMode: plan.AllocationModeStatic, MemoryMiB: 512, MemoryReservationMiB: 512}) {
		t.Fatalf("resources = %+v", resources)
	}
	if p.Policies.Runtime.Concurrency != (plan.Concurrency{MaxConcurrentExecutions: 10}) {
		t.Fatalf("concurrency = %+v", p.Policies.Runtime.Concurrency)
	}

	routing := result.Artifacts.Routing
	if routing.PlanVersion != result.Artifacts.EncodedPlan.Version {
		t.Fatalf("routing references plan %s, want %s", routing.PlanVersion, result.Artifacts.EncodedPlan.Version)
	}
	if !slices.Equal(routing.InputModels, []plan.ModelReference{{ID: "m1", Revision: bundle.Models[0].Revision}}) {
		t.Fatalf("routing input models = %v", routing.InputModels)
	}
	if routing.Concurrency != p.Policies.Runtime.Concurrency {
		t.Fatalf("routing concurrency = %+v", routing.Concurrency)
	}
	if !strings.Contains(string(result.Artifacts.EncodedPlan.Data), `"expression":"input.temperatureC != null && input.deviceId != null"`) {
		t.Fatalf("plan does not contain the canonical step config: %s", result.Artifacts.EncodedPlan.Data)
	}
}

func TestVersionIgnoresLayoutAndOrder(t *testing.T) {
	base := compile(t, channel(nil))
	reordered := compile(t, channel(func(config map[string]any) {
		nodes := config["nodes"].([]any)
		slices.Reverse(nodes)
		for _, node := range nodes {
			node.(map[string]any)["coordinates"] = map[string]any{"x": 999, "y": 999}
		}
		slices.Reverse(config["edges"].([]any))
	}))
	if base.Artifacts.EncodedPlan.Version != reordered.Artifacts.EncodedPlan.Version {
		t.Fatal("reordering steps and moving them in the editor changed the plan version")
	}
	if base.Artifacts.EncodedRouting.Version != reordered.Artifacts.EncodedRouting.Version {
		t.Fatal("reordering steps changed the routing version")
	}
}

func TestVersionIncludesResourcesAndConcurrency(t *testing.T) {
	base := compile(t, channel(nil))
	for name, change := range map[string]map[string]any{
		"memory":      {"memoryMiB": 1024},
		"concurrency": {"maxConcurrentExecutions": 20},
		"queue":       {"maxQueuedExecutions": 5},
		"timeout":     {"maxInvocationMs": 3000},
	} {
		t.Run(name, func(t *testing.T) {
			changed := compile(t, channel(func(config map[string]any) {
				for key, value := range change {
					config["runtime"].(map[string]any)[key] = value
				}
			}))
			if changed.Artifacts.EncodedPlan.Version == base.Artifacts.EncodedPlan.Version {
				t.Fatal("plan version did not change")
			}
		})
	}
}

func TestResourcesAreRequired(t *testing.T) {
	got := problems(t, channel(func(config map[string]any) {
		config["runtime"] = map[string]any{"size": "small"}
	}))
	requireProblem(t, got, "runtime.memoryMiB is required")
	requireProblem(t, got, "runtime.maxConcurrentExecutions is required")
}

func TestInvalidResources(t *testing.T) {
	got := problems(t, channel(func(config map[string]any) {
		config["runtime"] = map[string]any{"memoryMiB": 1, "maxConcurrentExecutions": 0, "maxQueuedExecutions": -1}
	}))
	requireProblem(t, got, "memory budget")
	requireProblem(t, got, "maximum concurrent executions")
	requireProblem(t, got, "maximum queued executions")
}

func TestTimerSource(t *testing.T) {
	result := compile(t, channel(func(config map[string]any) {
		source := config["nodes"].([]any)[0].(map[string]any)["metadata"].(map[string]any)
		source["label"] = "timer"
		source["config"] = map[string]any{"cronExpression": "*/5 * * * * *"}
	}))
	timers := result.Artifacts.Plan.Bindings.Timer
	if len(timers) != 1 || timers[0].CronExpression != "*/5 * * * * *" || timers[0].Overflow.Action != plan.OverflowSkip {
		t.Fatalf("unexpected timer bindings: %+v", timers)
	}
}

func TestSourceWithoutOverflowHandlingIsRejected(t *testing.T) {
	got := problems(t, channel(func(config map[string]any) {
		config["nodes"].([]any)[0].(map[string]any)["metadata"].(map[string]any)["label"] = "mqtt"
	}))
	requireProblem(t, got, "source type source.mqtt is not supported yet")
}

func TestGraphProblems(t *testing.T) {
	cases := map[string]struct {
		mutate func(map[string]any)
		want   string
	}{
		"cycle": {
			mutate: func(config map[string]any) {
				config["edges"] = append(config["edges"].([]any), map[string]any{
					"from": map[string]any{"nodeId": "n_email", "ioId": "output"},
					"to":   map[string]any{"nodeId": "n_filter", "ioId": "input"},
				})
			},
			want: "cycle",
		},
		"missing step": {
			mutate: func(config map[string]any) {
				config["edges"] = append(config["edges"].([]any), map[string]any{
					"from": map[string]any{"nodeId": "n_email"}, "to": map[string]any{"nodeId": "n_missing"},
				})
			},
			want: "does not exist",
		},
		"no source": {
			mutate: func(config map[string]any) {
				config["nodes"] = config["nodes"].([]any)[1:]
				config["edges"] = config["edges"].([]any)[1:]
			},
			want: "exactly one source step",
		},
		"unset connection": {
			mutate: func(config map[string]any) {
				email := config["nodes"].([]any)[2].(map[string]any)["metadata"].(map[string]any)
				email["dependencies"].(map[string]any)["things"].([]any)[0].(map[string]any)["thingId"] = unsetReference
			},
			want: "has no connection selected",
		},
		"missing model": {
			mutate: func(config map[string]any) {
				source := config["nodes"].([]any)[0].(map[string]any)["metadata"].(map[string]any)
				source["dependencies"].(map[string]any)["models"].([]any)[0].(map[string]any)["modelId"] = "m_missing"
			},
			want: "model m_missing does not exist",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			requireProblem(t, problems(t, channel(tc.mutate)), tc.want)
		})
	}
}

func TestResolverErrorsAreNotDiagnostics(t *testing.T) {
	failing := fakeResolver{err: errors.New("database unavailable")}
	if _, err := Compile(context.Background(), input(channel(nil)), failing); err == nil {
		t.Fatal("expected a resolver error")
	}
}
