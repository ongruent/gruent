package deployments

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/ongruent/gruent/db/sqlc"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
)

// TestIntegration publishes a channel against a migrated Postgres database. It runs only when
// CONTROLLER_TEST_DATABASE_URL is set, e.g. to the local platform's postgres container. Artifacts are
// uploaded to an S3-compatible store if CONTROLLER_TEST_S3_ENDPOINT is set (e.g. the local minio
// container, with CONTROLLER_TEST_S3_ACCESS_KEY_ID and CONTROLLER_TEST_S3_SECRET_ACCESS_KEY), and kept
// in memory otherwise.
func TestIntegration(t *testing.T) {
	databaseURL := os.Getenv("CONTROLLER_TEST_DATABASE_URL")
	s3Endpoint := os.Getenv("CONTROLLER_TEST_S3_ENDPOINT")
	if databaseURL == "" {
		t.Skip("CONTROLLER_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	queries := sqlcdb.New(pool)

	suffix := randomSuffix()
	if _, err := queries.CreateOrganization(ctx, "o_"+suffix, "Org", "test", "test"); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.CreateSpace(ctx, "s_"+suffix, "o_"+suffix, "Space", "test", "test"); err != nil {
		t.Fatal(err)
	}
	channelID := "c_" + suffix
	if _, err := queries.CreateChannel(ctx, sqlcdb.CreateChannelParams{
		ID: channelID, Name: "Channel", SpaceID: "s_" + suffix, Config: timerChannel(256), CreatedBy: "test", UpdatedBy: "test",
	}); err != nil {
		t.Fatal(err)
	}

	var store artifacts.Store = artifacts.NewMemoryStore()
	if s3Endpoint != "" {
		store, err = artifacts.NewS3Store(ctx, artifacts.S3Config{
			Endpoint:        s3Endpoint,
			AccessKeyID:     os.Getenv("CONTROLLER_TEST_S3_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("CONTROLLER_TEST_S3_SECRET_ACCESS_KEY"),
			Bucket:          "controller-integration-test",
			Region:          "us-east-1",
		})
		if err != nil {
			t.Fatal(err)
		}
	}

	channels := &PostgresChannels{Queries: queries}
	service := &Service{Channels: channels, Resolver: channels, Artifacts: store, Signer: testSigner(), Store: &PostgresStore{Pool: pool}}

	state, err := service.Publish(ctx, channelID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Plan == nil || state.DependencyBundle == nil || state.PayloadSchema == nil || state.MemoryReservationMiB != 256 || state.ObservedStatus != ObservedUnknown {
		t.Fatalf("unexpected state: %+v", state)
	}
	if exists, err := store.Exists(ctx, state.Plan.StorageKey); err != nil || !exists {
		t.Fatalf("plan was not uploaded: %v", err)
	}

	if _, err := queries.UpdateChannelConfig(ctx, channelID, timerChannel(1), "test"); err != nil {
		t.Fatal(err)
	}
	failed, err := service.Publish(ctx, channelID)
	if err == nil || failed.PreparationStatus != PreparationFailed || failed.DesiredVersion() != state.DesiredVersion() {
		t.Fatalf("expected a recorded compile failure that keeps the desired version, got %+v (%v)", failed, err)
	}

	observed, err := service.RecordObserved(ctx, Observation{ChannelID: channelID, Status: ObservedApplied, Version: state.DesiredVersion()})
	if err != nil {
		t.Fatal(err)
	}
	if observed.ObservedVersion != state.DesiredVersion() || observed.ObservedAt == nil {
		t.Fatalf("observation was not recorded: %+v", observed)
	}

	unpublished, err := service.Unpublish(ctx, channelID)
	if err != nil || unpublished.DesiredState != DesiredUnpublished {
		t.Fatalf("unexpected unpublish result: %+v (%v)", unpublished, err)
	}
}

func randomSuffix() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
