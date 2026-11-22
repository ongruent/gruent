// Package ingress serves HTTP source triggers of channels published to the runtime platform.
//
// The API hosts routing.Ingress at /v1/trigger/http/<channel ID>. A Service keeps an in-memory route table
// that it reconciles from the signed routing table the controller writes to artifact storage, and invokes
// runtime workers with NATS request/reply. Requests for channels that have no route fall through to the
// legacy trigger, so channels that aren't published to the runtime platform keep working.
package ingress

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/nats-io/nats.go"
	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/rs/zerolog/log"
)

// DefaultReconcileInterval is how often a Service picks up published and unpublished channels.
const DefaultReconcileInterval = 3 * time.Second

// Config configures a Service. The ingress is enabled when NATSURL, Storage.Endpoint, Storage.Bucket and
// SigningKeyring are set.
type Config struct {
	NATSURL string
	Storage Storage
	// SigningKeyring lists the trusted public keys of the controller's artifact signing keys:
	// `<key ID>=<base64 public key>`, separated by commas (as for runtime workers).
	SigningKeyring    string
	ReconcileInterval time.Duration
}

// Storage is the artifact storage that holds the routing table. The ingress only reads it.
type Storage struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Region          string
	UseSSL          bool
}

// Enabled reports whether the configuration enables the ingress.
func (c Config) Enabled() bool {
	return c.NATSURL != "" && c.Storage.Endpoint != "" && c.Storage.Bucket != "" && c.SigningKeyring != ""
}

// Service routes HTTP triggers to runtime workers.
type Service struct {
	Table      *routing.Table
	Reconciler *routing.Reconciler
	ingress    *routing.Ingress
	close      func()
}

// New returns a Service that serves routes from reconciler's table and invokes channels through requester.
func New(reconciler *routing.Reconciler, requester routing.Requester) *Service {
	return &Service{
		Table:      reconciler.Table,
		Reconciler: reconciler,
		ingress:    &routing.Ingress{Table: reconciler.Table, Requester: requester},
		close:      func() {},
	}
}

// Start connects to NATS and artifact storage, reconciles the route table once, and keeps reconciling it
// every ReconcileInterval until ctx is done. NATS and storage being unavailable is not fatal: NATS
// reconnects and a failed reconciliation is retried, so only configuration errors are returned.
func Start(ctx context.Context, config Config) (*Service, error) {
	keyring, err := ParseKeyring(config.SigningKeyring)
	if err != nil {
		return nil, err
	}
	client, err := minio.New(config.Storage.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.Storage.AccessKeyID, config.Storage.SecretAccessKey, ""),
		Secure: config.Storage.UseSSL,
		Region: config.Storage.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("create artifact storage client: %w", err)
	}
	connection, err := nats.Connect(config.NATSURL,
		nats.Name("http-api-ingress"),
		nats.MaxReconnects(-1),
		nats.RetryOnFailedConnect(true),
	)
	if err != nil {
		return nil, fmt.Errorf("connect to NATS: %w", err)
	}

	reconciler := &routing.Reconciler{
		Reader:  &S3Reader{Client: client, Bucket: config.Storage.Bucket},
		Keyring: keyring,
		Table:   routing.NewTable(),
	}
	service := New(reconciler, NATSRequester{Conn: connection})
	interval := config.ReconcileInterval
	if interval <= 0 {
		interval = DefaultReconcileInterval
	}
	runCtx, cancel := context.WithCancel(ctx)
	service.close = func() {
		cancel()
		connection.Close()
	}
	service.reconcile(runCtx)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				service.reconcile(runCtx)
			}
		}
	}()
	return service, nil
}

func (s *Service) reconcile(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	changes, err := s.Reconciler.Reconcile(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("Could not reconcile the HTTP trigger routes")
		return
	}
	for _, channelID := range changes.Applied {
		log.Info().Str("channel_id", channelID).Str("routing_version", s.Table.Version(channelID)).Msg("Routing HTTP triggers to the runtime")
	}
	for _, channelID := range changes.Removed {
		log.Info().Str("channel_id", channelID).Msg("Stopped routing HTTP triggers to the runtime")
	}
	for channelID, err := range changes.Failed {
		log.Warn().Err(err).Str("channel_id", channelID).Msg("Could not load the channel's routes; keeping its previous routes")
	}
}

// Serves reports whether a published channel's route matches the path, in which case Handle answers the
// request (with 405 Method Not Allowed if the route doesn't accept the method).
func (s *Service) Serves(method, path string) bool {
	_, _, err := s.Table.MatchHTTP(method, path)
	return !errors.Is(err, routing.ErrNoRoute)
}

// Handle invokes the channel and answers with the runtime's reply (see routing.Ingress).
func (s *Service) Handle(ctx *fiber.Ctx) error {
	// The request's context carries its trace span. The context that the adaptor derives from fasthttp is
	// only cancelled when the server shuts down (and always, outside a running server).
	requestCtx := ctx.UserContext()
	return adaptor.HTTPHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.ingress.ServeHTTP(w, r.WithContext(requestCtx))
	})(ctx)
}

// Close stops reconciling and closes the NATS connection.
func (s *Service) Close() {
	s.close()
}

var current atomic.Pointer[Service]

// Use makes service the ingress of the HTTP trigger route. nil disables it.
func Use(service *Service) {
	current.Store(service)
}

// Current returns the ingress of the HTTP trigger route, or nil if it is disabled.
func Current() *Service {
	return current.Load()
}

// Trigger returns the handler of the HTTP trigger route: requests that match a published channel's route
// are answered by the current ingress, and all others by legacy.
func Trigger(legacy fiber.Handler) fiber.Handler {
	return func(ctx *fiber.Ctx) error {
		if service := Current(); service != nil && service.Serves(ctx.Method(), ctx.Path()) {
			return service.Handle(ctx)
		}
		return legacy(ctx)
	}
}

// ParseKeyring parses `<key ID>=<base64 public key>` entries separated by commas.
func ParseKeyring(spec string) (signing.Keyring, error) {
	keys := map[string]string{}
	for _, entry := range strings.Split(spec, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		keyID, key, ok := strings.Cut(entry, "=")
		if !ok || keyID == "" {
			return nil, fmt.Errorf("invalid signing keyring entry %q; expected <key ID>=<base64 public key>", entry)
		}
		keys[keyID] = key
	}
	if len(keys) == 0 {
		return nil, errors.New("the signing keyring is empty")
	}
	return signing.NewKeyring(keys)
}
