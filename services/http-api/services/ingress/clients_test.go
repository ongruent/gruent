package ingress

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/ongruent/gruent/libs/engine/routing"
)

// natsConnection connects to the NATS server at NATS_TEST_URL (e.g. `nats-server -p 4333` and
// NATS_TEST_URL=nats://127.0.0.1:4333), or skips the test.
func natsConnection(t *testing.T) *nats.Conn {
	t.Helper()
	url := os.Getenv("NATS_TEST_URL")
	if url == "" {
		t.Skip("NATS_TEST_URL is not set")
	}
	connection, err := nats.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(connection.Close)
	return connection
}

func TestNATSRequester(t *testing.T) {
	connection := natsConnection(t)
	requester := NATSRequester{Conn: connection}
	subject := "gruent.v1.invocations.requester-test"
	subscription, err := connection.QueueSubscribe(subject, "runtime.requester-test", func(message *nats.Msg) {
		if string(message.Data) == "slow" {
			time.Sleep(500 * time.Millisecond)
		}
		_ = message.Respond(append([]byte("reply:"), message.Data...))
	})
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Unsubscribe()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if data, err := requester.Request(ctx, subject, []byte("hi")); err != nil || string(data) != "reply:hi" {
		t.Fatalf("reply %q, %v", data, err)
	}

	short, cancelShort := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancelShort()
	if _, err := requester.Request(short, subject, []byte("slow")); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected a deadline error, got %v", err)
	}

	if _, err := requester.Request(ctx, "gruent.v1.invocations.nobody", []byte("hi")); !errors.Is(err, routing.ErrNoResponders) {
		t.Fatalf("expected no responders, got %v", err)
	}
}

func TestParseKeyring(t *testing.T) {
	keyring, err := ParseKeyring(" local-dev-1=Pq48nVKCNmPjOGPdi1fNgC0OshAyH8qdTfpqO/Qj8eE= ,")
	if err != nil || len(keyring) != 1 || keyring["local-dev-1"] == nil {
		t.Fatalf("keyring %v, %v", keyring, err)
	}
	for _, spec := range []string{"", "Pq48nVKCNmPjOGPdi1fNgC0OshAyH8qdTfpqO/Qj8eE=", "k1=not-a-key"} {
		if _, err := ParseKeyring(spec); err == nil {
			t.Fatalf("expected an error for %q", spec)
		}
	}
}

func TestConfigEnabled(t *testing.T) {
	config := Config{NATSURL: "nats://nats:4222", Storage: Storage{Endpoint: "minio:8675", Bucket: "channel-artifacts"}, SigningKeyring: "k=v"}
	if !config.Enabled() {
		t.Fatal("expected the ingress to be enabled")
	}
	config.NATSURL = ""
	if config.Enabled() {
		t.Fatal("expected the ingress to be disabled without NATS")
	}
}
