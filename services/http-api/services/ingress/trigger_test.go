package ingress_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/nats-io/nats.go"
	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/services/http-api/services/ingress"
)

// Local development signing seed (deploy/platform/local/.env.controller.example).
const seed = "gn4yyRDEl9VZSnQMZDkd8Uz3KjkDDKZ3v181dnFB7ok="

// storage is a routing table written like the controller writes it on publish.
type storage map[string][]byte

func (s storage) List(_ context.Context, prefix string) ([]string, error) {
	var keys []string
	for key := range s {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	return keys, nil
}

func (s storage) Get(_ context.Context, key string) ([]byte, error) {
	if data, ok := s[key]; ok {
		return data, nil
	}
	return nil, fmt.Errorf("%s: %w", key, routing.ErrObjectNotFound)
}

func (s storage) put(t *testing.T, signer *signing.Signer, kind, key string, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	version := signing.Digest(data)
	envelope, _ := json.Marshal(signer.Sign(kind, version))
	s[key], s[key+".sig"] = data, envelope
	return version
}

// publish routes POST /v1/trigger/http/<channelID> to the channel's runtime, in sync mode.
func (s storage) publish(t *testing.T, signer *signing.Signer, channelID string) {
	t.Helper()
	artifact := routing.Artifact{
		APIVersion:  routing.APIVersion,
		Kind:        routing.KindSourceRouting,
		Metadata:    routing.Metadata{OrgID: "o1", SpaceID: "s1", ChannelID: channelID},
		PlanVersion: "sha256:plan",
		Bindings: routing.Bindings{
			HTTP: []routing.HTTPBinding{{
				BindingID: "bind_n_src", StepID: "n_src", Method: "POST", Path: routing.HTTPPath(channelID),
				ResponseMode: routing.ResponseModeSync, TimeoutMs: 1000, Subject: routing.InvocationSubject(channelID),
				InputModelRefs: []string{}, Overflow: routing.Overflow{Action: routing.OverflowReject, HTTPStatus: 429},
			}},
			Timer:        []routing.TimerBinding{},
			MessageQueue: []routing.MessageQueueBinding{},
		},
		InputModels: []routing.ModelReference{},
		Concurrency: routing.Concurrency{MaxConcurrentExecutions: 1},
	}
	key := "orgs/o1/spaces/s1/channels/" + channelID + "/routing/r.json"
	version := s.put(t, signer, routing.ArtifactRouting, key, artifact)
	s.put(t, signer, routing.ArtifactRouteEntry, routing.EntryKey(channelID), routing.Entry{
		APIVersion: routing.APIVersion, Kind: routing.KindRouteEntry, Metadata: artifact.Metadata,
		Routing: routing.ArtifactRef{Kind: routing.ArtifactRouting, Version: version, Key: key},
	})
}

// runtime answers invocations like a runtime worker serving HTTP source -> existence(deviceId) ->
// HTTP response 200 (input) / 500.
type runtime struct {
	subject    string
	invocation routing.Invocation
}

func (r *runtime) Request(_ context.Context, subject string, data []byte) ([]byte, error) {
	r.subject = subject
	if err := json.Unmarshal(data, &r.invocation); err != nil {
		return nil, err
	}
	var body map[string]any
	reply := routing.Reply{Status: 500}
	if json.Unmarshal(r.invocation.Payload, &body) == nil && body["deviceId"] != nil {
		reply = routing.Reply{Status: 200, Headers: http.Header{"Content-Type": {r.invocation.ContentType}}, Body: r.invocation.Payload}
	}
	return json.Marshal(reply)
}

func app(t *testing.T, requester routing.Requester, published ...string) *fiber.App {
	t.Helper()
	signer, err := signing.NewSigner("local-dev-1", seed)
	if err != nil {
		t.Fatal(err)
	}
	keyring, err := ingress.ParseKeyring("local-dev-1=" + signer.PublicKey())
	if err != nil {
		t.Fatal(err)
	}
	routes := storage{}
	for _, channelID := range published {
		routes.publish(t, signer, channelID)
	}
	reconciler := &routing.Reconciler{Reader: routes, Keyring: keyring, Table: routing.NewTable()}
	if changes, err := reconciler.Reconcile(context.Background()); err != nil || len(changes.Applied) != len(published) {
		t.Fatalf("reconcile: %+v, %v", changes, err)
	}
	ingress.Use(ingress.New(reconciler, requester))
	t.Cleanup(func() { ingress.Use(nil) })

	// The route as api/v1/trigger/http registers it, with a stand-in for the legacy trigger (which needs
	// the database).
	server := fiber.New()
	handler := ingress.Trigger(func(ctx *fiber.Ctx) error {
		return ctx.Status(fiber.StatusTeapot).SendString("legacy")
	})
	for _, method := range []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"} {
		server.Add(method, "/v1/trigger/http/:channelId", handler)
	}
	return server
}

func send(t *testing.T, server *fiber.App, method, path, contentType, body string) (*http.Response, string) {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Authorization", "Bearer secret")
	response, err := server.Test(request, -1)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(response.Body)
	return response, string(data)
}

func TestTriggerRoutesPublishedChannelsToTheRuntime(t *testing.T) {
	runtime := &runtime{}
	server := app(t, runtime, "c1")

	response, body := send(t, server, "POST", "/v1/trigger/http/c1?debug=1", "application/json", `{"deviceId":"d1"}`)
	if response.StatusCode != 200 || body != `{"deviceId":"d1"}` || response.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("success branch: %d %q %v", response.StatusCode, body, response.Header)
	}
	invocation := runtime.invocation
	if runtime.subject != "gruent.v1.invocations.c1" || invocation.StepID != "n_src" || invocation.Trigger != routing.TriggerHTTP ||
		invocation.Reply == nil || invocation.Reply.Mode != routing.ResponseModeSync || invocation.HTTP == nil ||
		invocation.HTTP.Path != "/v1/trigger/http/c1" || invocation.HTTP.Query != "debug=1" {
		t.Fatalf("unexpected invocation on %s: %+v", runtime.subject, invocation)
	}
	if invocation.HTTP.Headers.Get("Authorization") != "" {
		t.Fatalf("credentials were forwarded: %v", invocation.HTTP.Headers)
	}

	if response, _ := send(t, server, "POST", "/v1/trigger/http/c1", "application/json", `{"temperatureC":20}`); response.StatusCode != 500 {
		t.Fatalf("failure branch: %d", response.StatusCode)
	}
	// Unlike the legacy trigger, any content type reaches the runtime.
	if response, _ := send(t, server, "POST", "/v1/trigger/http/c1", "text/plain", "hello"); response.StatusCode != 500 || runtime.invocation.ContentType != "text/plain" {
		t.Fatalf("text body: %d %+v", response.StatusCode, runtime.invocation)
	}
	if response, _ := send(t, server, "GET", "/v1/trigger/http/c1", "application/json", ""); response.StatusCode != 405 || response.Header.Get("Allow") != "POST" {
		t.Fatalf("wrong method: %d %v", response.StatusCode, response.Header)
	}
}

func TestTriggerReportsAChannelWithoutARunningRuntime(t *testing.T) {
	server := app(t, failingRequester{fmt.Errorf("nats: %w", routing.ErrNoResponders)}, "c1")
	if response, _ := send(t, server, "POST", "/v1/trigger/http/c1", "application/json", `{}`); response.StatusCode != 503 {
		t.Fatalf("expected 503, got %d", response.StatusCode)
	}
}

func TestTriggerFallsBackToTheLegacyTrigger(t *testing.T) {
	runtime := &runtime{}
	server := app(t, runtime, "c1")
	if response, body := send(t, server, "POST", "/v1/trigger/http/legacy", "application/json", `{}`); response.StatusCode != fiber.StatusTeapot || body != "legacy" {
		t.Fatalf("unpublished channel: %d %q", response.StatusCode, body)
	}

	ingress.Use(nil)
	if response, _ := send(t, server, "POST", "/v1/trigger/http/c1", "application/json", `{}`); response.StatusCode != fiber.StatusTeapot {
		t.Fatalf("disabled ingress: %d", response.StatusCode)
	}
	if runtime.subject != "" {
		t.Fatalf("the runtime was invoked on %s", runtime.subject)
	}
}

type failingRequester struct{ err error }

func (f failingRequester) Request(context.Context, string, []byte) ([]byte, error) { return nil, f.err }

// TestTriggerOverNATS sends requests through the route, NATS request/reply and a stand-in runtime worker
// subscribed like ChannelWorker (queue group runtime.<channel ID>). Needs NATS_TEST_URL.
func TestTriggerOverNATS(t *testing.T) {
	url := os.Getenv("NATS_TEST_URL")
	if url == "" {
		t.Skip("NATS_TEST_URL is not set")
	}
	connection, err := nats.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	worker := &runtime{}
	subscription, err := connection.QueueSubscribe(routing.InvocationSubject("c1"), "runtime.c1", func(message *nats.Msg) {
		reply, err := worker.Request(context.Background(), message.Subject, message.Data)
		if err != nil {
			t.Error(err)
			return
		}
		_ = message.Respond(reply)
	})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Unsubscribe()

	server := app(t, ingress.NATSRequester{Conn: connection}, "c1", "c2")
	if response, body := send(t, server, "POST", "/v1/trigger/http/c1", "application/json", `{"deviceId":"d1"}`); response.StatusCode != 200 || body != `{"deviceId":"d1"}` {
		t.Fatalf("success branch: %d %q", response.StatusCode, body)
	}
	if response, _ := send(t, server, "POST", "/v1/trigger/http/c1", "application/json", `{}`); response.StatusCode != 500 {
		t.Fatalf("failure branch: %d", response.StatusCode)
	}
	// c2 is published, but no runtime serves it.
	if response, _ := send(t, server, "POST", "/v1/trigger/http/c2", "application/json", `{}`); response.StatusCode != 503 {
		t.Fatalf("channel without a runtime: %d", response.StatusCode)
	}
}

// TestStart reads the routing table from MinIO at MINIO_TEST_ENDPOINT (credentials minioadmin/minioadmin)
// and invokes the runtime over NATS_TEST_URL, like the API on startup.
func TestStart(t *testing.T) {
	natsURL, endpoint := os.Getenv("NATS_TEST_URL"), os.Getenv("MINIO_TEST_ENDPOINT")
	if natsURL == "" || endpoint == "" {
		t.Skip("NATS_TEST_URL or MINIO_TEST_ENDPOINT is not set")
	}
	ctx := context.Background()
	bucket := fmt.Sprintf("ingress-test-%d", time.Now().UnixNano())
	client, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4("minioadmin", "minioadmin", "")})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
		t.Fatal(err)
	}
	signer, _ := signing.NewSigner("local-dev-1", seed)
	upload := func(routes storage) {
		for key, data := range routes {
			if _, err := client.PutObject(ctx, bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{}); err != nil {
				t.Fatal(err)
			}
		}
	}
	routes := storage{}
	routes.publish(t, signer, "c1")
	upload(routes)

	service, err := ingress.Start(ctx, ingress.Config{
		NATSURL:           natsURL,
		Storage:           ingress.Storage{Endpoint: endpoint, AccessKeyID: "minioadmin", SecretAccessKey: "minioadmin", Bucket: bucket},
		SigningKeyring:    "local-dev-1=" + signer.PublicKey(),
		ReconcileInterval: 50 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	if !service.Serves("POST", "/v1/trigger/http/c1") || service.Serves("POST", "/v1/trigger/http/c2") {
		t.Fatal("expected only c1 to be routed after the first reconciliation")
	}

	// Publishing and unpublishing are picked up by later reconciliations.
	more := storage{}
	more.publish(t, signer, "c2")
	upload(more)
	if err := client.RemoveObject(ctx, bucket, routing.EntryKey("c1"), minio.RemoveObjectOptions{}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for service.Serves("POST", "/v1/trigger/http/c1") || !service.Serves("POST", "/v1/trigger/http/c2") {
		if time.Now().After(deadline) {
			t.Fatal("the route table did not converge")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
