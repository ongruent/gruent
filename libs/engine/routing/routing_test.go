package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/ongruent/gruent/libs/engine/signing"
)

const seed = "gn4yyRDEl9VZSnQMZDkd8Uz3KjkDDKZ3v181dnFB7ok="

// memoryStorage is file storage that the test writes like the controller does.
type memoryStorage map[string][]byte

func (m memoryStorage) List(_ context.Context, prefix string) ([]string, error) {
	var keys []string
	for key := range m {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return keys, nil
}

func (m memoryStorage) Get(_ context.Context, key string) ([]byte, error) {
	data, ok := m[key]
	if !ok {
		return nil, fmt.Errorf("%s: %w", key, ErrObjectNotFound)
	}
	return data, nil
}

func (m memoryStorage) put(t *testing.T, signer *signing.Signer, kind, key string, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	version := signing.Digest(data)
	envelope, err := json.Marshal(signer.Sign(kind, version))
	if err != nil {
		t.Fatal(err)
	}
	m[key] = data
	m[key+".sig"] = envelope
	return version
}

func testArtifact(channelID string, method string) Artifact {
	return Artifact{
		APIVersion:  APIVersion,
		Kind:        KindSourceRouting,
		Metadata:    Metadata{OrgID: "o1", SpaceID: "s1", ChannelID: channelID},
		PlanVersion: "sha256:plan-" + channelID + method,
		Bindings: Bindings{
			HTTP: []HTTPBinding{{
				BindingID: "bind_n1", StepID: "n1", Method: method, Path: HTTPPath(channelID),
				ResponseMode: ResponseModeSync, TimeoutMs: 1000, Subject: InvocationSubject(channelID),
				InputModelRefs: []string{}, Overflow: Overflow{Action: OverflowReject, HTTPStatus: 429},
			}},
			Timer:        []TimerBinding{},
			MessageQueue: []MessageQueueBinding{},
		},
		InputModels: []ModelReference{},
		Concurrency: Concurrency{MaxConcurrentExecutions: 2},
	}
}

// publish writes a routing artifact and its table entry, as the controller does on publish.
func (m memoryStorage) publish(t *testing.T, signer *signing.Signer, artifact Artifact) {
	t.Helper()
	data, _ := json.Marshal(artifact)
	key := fmt.Sprintf("orgs/o1/spaces/s1/channels/%s/routing/%s.json", artifact.Metadata.ChannelID, strings.TrimPrefix(signing.Digest(data), "sha256:"))
	version := m.put(t, signer, ArtifactRouting, key, artifact)
	m.put(t, signer, ArtifactRouteEntry, EntryKey(artifact.Metadata.ChannelID), Entry{
		APIVersion: APIVersion, Kind: KindRouteEntry, Metadata: artifact.Metadata,
		Routing: ArtifactRef{Kind: ArtifactRouting, Version: version, Key: key},
	})
}

func setup(t *testing.T) (*signing.Signer, memoryStorage, *Reconciler) {
	t.Helper()
	signer, err := signing.NewSigner("k1", seed)
	if err != nil {
		t.Fatal(err)
	}
	keyring, err := signing.NewKeyring(map[string]string{"k1": signer.PublicKey()})
	if err != nil {
		t.Fatal(err)
	}
	storage := memoryStorage{}
	return signer, storage, &Reconciler{Reader: storage, Keyring: keyring, Table: NewTable()}
}

func reconcile(t *testing.T, r *Reconciler) Changes {
	t.Helper()
	changes, err := r.Reconcile(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return changes
}

func TestReconcileAppliesReplacesAndRemovesChannels(t *testing.T) {
	signer, storage, reconciler := setup(t)
	storage.publish(t, signer, testArtifact("c1", "POST"))
	storage.publish(t, signer, testArtifact("c2", "GET"))

	changes := reconcile(t, reconciler)
	if !slices.Equal(changes.Applied, []string{"c1", "c2"}) || len(changes.Failed) > 0 {
		t.Fatalf("unexpected changes: %+v", changes)
	}
	route, _, err := reconciler.Table.MatchHTTP("POST", "/v1/trigger/http/c1")
	if err != nil || route.Binding.Subject != "gruent.v1.invocations.c1" || route.Metadata.ChannelID != "c1" {
		t.Fatalf("unexpected route %+v, %v", route, err)
	}

	// Unchanged entries are not applied again.
	if changes := reconcile(t, reconciler); len(changes.Applied) > 0 || len(changes.Removed) > 0 {
		t.Fatalf("expected no changes, got %+v", changes)
	}

	// Publishing a new version replaces the channel's routes; unpublishing removes them.
	storage.publish(t, signer, testArtifact("c1", "PUT"))
	delete(storage, EntryKey("c2"))
	delete(storage, EntryKey("c2")+".sig")
	changes = reconcile(t, reconciler)
	if !slices.Equal(changes.Applied, []string{"c1"}) || !slices.Equal(changes.Removed, []string{"c2"}) {
		t.Fatalf("unexpected changes: %+v", changes)
	}
	if _, allowed, err := reconciler.Table.MatchHTTP("POST", "/v1/trigger/http/c1"); !errors.Is(err, ErrMethodNotAllowed) || !slices.Equal(allowed, []string{"PUT"}) {
		t.Fatalf("expected the old method to be gone, got %v %v", allowed, err)
	}
	if _, _, err := reconciler.Table.MatchHTTP("GET", "/v1/trigger/http/c2"); !errors.Is(err, ErrNoRoute) {
		t.Fatalf("expected c2 to be unrouted, got %v", err)
	}
}

func TestReconcileRejectsUnverifiedEntries(t *testing.T) {
	cases := map[string]func(t *testing.T, signer *signing.Signer, storage memoryStorage){
		"tampered entry": func(t *testing.T, signer *signing.Signer, storage memoryStorage) {
			storage[EntryKey("c1")] = bytes.Replace(storage[EntryKey("c1")], []byte(`"c1"`), []byte(`"c1" `), 1)
		},
		"missing signature": func(t *testing.T, signer *signing.Signer, storage memoryStorage) {
			delete(storage, EntryKey("c1")+".sig")
		},
		"entry for another channel": func(t *testing.T, signer *signing.Signer, storage memoryStorage) {
			other := testArtifact("c9", "POST")
			storage.publish(t, signer, other)
			storage[EntryKey("c1")] = storage[EntryKey("c9")]
			storage[EntryKey("c1")+".sig"] = storage[EntryKey("c9")+".sig"]
			delete(storage, EntryKey("c9"))
			delete(storage, EntryKey("c9")+".sig")
		},
		"untrusted signer": func(t *testing.T, _ *signing.Signer, storage memoryStorage) {
			other, err := signing.NewSigner("k2", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
			if err != nil {
				t.Fatal(err)
			}
			storage.publish(t, other, testArtifact("c1", "POST"))
		},
		"artifact routes a foreign path": func(t *testing.T, signer *signing.Signer, storage memoryStorage) {
			artifact := testArtifact("c1", "POST")
			artifact.Bindings.HTTP[0].Path = HTTPPath("c2")
			storage.publish(t, signer, artifact)
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			signer, storage, reconciler := setup(t)
			storage.publish(t, signer, testArtifact("c1", "POST"))
			mutate(t, signer, storage)

			changes := reconcile(t, reconciler)
			if changes.Failed["c1"] == nil || len(changes.Applied) > 0 {
				t.Fatalf("expected c1 to fail verification, got %+v", changes)
			}
			if reconciler.Table.Version("c1") != "" {
				t.Fatal("an unverified entry was applied")
			}
		})
	}
}

func TestReconcileKeepsRoutesWhenAnUpdateFailsVerification(t *testing.T) {
	signer, storage, reconciler := setup(t)
	storage.publish(t, signer, testArtifact("c1", "POST"))
	reconcile(t, reconciler)
	version := reconciler.Table.Version("c1")

	storage.publish(t, signer, testArtifact("c1", "PUT"))
	delete(storage, EntryKey("c1")+".sig") // e.g. read between the entry and its signature being written
	changes := reconcile(t, reconciler)
	if changes.Failed["c1"] == nil || reconciler.Table.Version("c1") != version {
		t.Fatalf("expected the previous routes to be kept, got %+v", changes)
	}
}

func TestTimerAndMessageQueueRoutes(t *testing.T) {
	signer, storage, reconciler := setup(t)
	artifact := testArtifact("c1", "POST")
	artifact.Bindings.HTTP = []HTTPBinding{}
	artifact.Bindings.Timer = []TimerBinding{{BindingID: "bind_t", StepID: "t", CronExpression: "0 * * * * *", Subject: InvocationSubject("c1"), Overflow: Overflow{Action: OverflowSkip}}}
	storage.publish(t, signer, artifact)
	other := testArtifact("c2", "POST")
	other.Bindings.HTTP = []HTTPBinding{}
	other.Bindings.MessageQueue = []MessageQueueBinding{{BindingID: "bind_m", StepID: "m", Broker: BrokerNATS, ConnectionRef: "k1", Topic: "sensors.>", Subject: InvocationSubject("c2"), Overflow: Overflow{Action: OverflowPause}}}
	storage.publish(t, signer, other)
	reconcile(t, reconciler)

	timers := reconciler.Table.Timers()
	if len(timers) != 1 || timers[0].Binding.CronExpression != "0 * * * * *" {
		t.Fatalf("unexpected timers: %+v", timers)
	}
	firedAt := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	tick := TimerInvocation(timers[0], "i1", firedAt)
	if tick.Trigger != TriggerTimer || tick.Reply != nil || tick.Payload != nil || tick.PlanVersion != artifact.PlanVersion {
		t.Fatalf("unexpected timer invocation: %+v", tick)
	}

	subscriptions := reconciler.Table.Subscriptions()
	if len(subscriptions) != 1 || subscriptions[0].Binding.Topic != "sensors.>" {
		t.Fatalf("unexpected subscriptions: %+v", subscriptions)
	}
	message := MessageInvocation(subscriptions[0], "i2", firedAt, "application/json", []byte(`{"t":1}`))
	if message.Trigger != TriggerMessageQueue || message.MessageQueue.Broker != BrokerNATS || string(message.Payload) != `{"t":1}` {
		t.Fatalf("unexpected message invocation: %+v", message)
	}
}

type fakeRequester struct {
	subject string
	request Invocation
	reply   *Reply
	err     error
}

func (f *fakeRequester) Request(_ context.Context, subject string, data []byte) ([]byte, error) {
	f.subject = subject
	if err := json.Unmarshal(data, &f.request); err != nil {
		return nil, err
	}
	if f.err != nil {
		return nil, f.err
	}
	return json.Marshal(f.reply)
}

func ingress(t *testing.T, mode string, requester *fakeRequester) *Ingress {
	t.Helper()
	signer, storage, reconciler := setup(t)
	artifact := testArtifact("c1", "POST")
	artifact.Bindings.HTTP[0].ResponseMode = mode
	storage.publish(t, signer, artifact)
	reconcile(t, reconciler)
	return &Ingress{
		Table:     reconciler.Table,
		Requester: requester,
		Now:       func() time.Time { return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) },
		NewID:     func() string { return "inv1" },
	}
}

func serve(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer secret")
	request.Header.Set("X-Device", "d1")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestIngressSyncRequestReply(t *testing.T) {
	requester := &fakeRequester{reply: &Reply{Status: 201, Headers: http.Header{"X-Result": {"ok"}, "Connection": {"close"}}, Body: []byte(`{"id":1}`)}}
	response := serve(ingress(t, ResponseModeSync, requester), "POST", "/v1/trigger/http/c1?x=1", `{"t":21}`)

	if response.Code != 201 || response.Body.String() != `{"id":1}` || response.Header().Get("X-Result") != "ok" || response.Header().Get("Connection") != "" {
		t.Fatalf("unexpected response %d %s %v", response.Code, response.Body, response.Header())
	}
	invocation := requester.request
	if requester.subject != "gruent.v1.invocations.c1" || invocation.ID != "inv1" || invocation.Trigger != TriggerHTTP ||
		string(invocation.Payload) != `{"t":21}` || invocation.HTTP.Query != "x=1" || invocation.Reply.Mode != ResponseModeSync {
		t.Fatalf("unexpected invocation %+v", invocation)
	}
	if invocation.HTTP.Headers.Get("Authorization") != "" || invocation.HTTP.Headers.Get("X-Device") != "d1" {
		t.Fatalf("unexpected forwarded headers %v", invocation.HTTP.Headers)
	}
}

func TestIngressResponses(t *testing.T) {
	cases := []struct {
		name      string
		mode      string
		method    string
		path      string
		body      string
		requester *fakeRequester
		status    int
	}{
		{name: "async admission", mode: ResponseModeAsync, method: "POST", path: "/v1/trigger/http/c1", requester: &fakeRequester{reply: &Reply{}}, status: http.StatusAccepted},
		{name: "overflow", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c1", requester: &fakeRequester{reply: &Reply{Overflow: true}}, status: http.StatusTooManyRequests},
		{name: "timeout", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c1", requester: &fakeRequester{err: fmt.Errorf("nats: %w", context.DeadlineExceeded)}, status: http.StatusGatewayTimeout},
		{name: "no responders", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c1", requester: &fakeRequester{err: errors.New("no responders")}, status: http.StatusBadGateway},
		{name: "invalid reply status", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c1", requester: &fakeRequester{reply: &Reply{Status: 42}}, status: http.StatusBadGateway},
		{name: "unknown channel", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c9", requester: &fakeRequester{}, status: http.StatusNotFound},
		{name: "wrong method", mode: ResponseModeSync, method: "GET", path: "/v1/trigger/http/c1", requester: &fakeRequester{}, status: http.StatusMethodNotAllowed},
		{name: "body too large", mode: ResponseModeSync, method: "POST", path: "/v1/trigger/http/c1", body: strings.Repeat("x", MaxHTTPBodyBytes+1), requester: &fakeRequester{}, status: http.StatusRequestEntityTooLarge},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			response := serve(ingress(t, c.mode, c.requester), c.method, c.path, c.body)
			if response.Code != c.status {
				t.Fatalf("expected %d, got %d: %s", c.status, response.Code, response.Body)
			}
		})
	}
}
