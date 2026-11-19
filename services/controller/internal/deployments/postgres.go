package deployments

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/ongruent/gruent/db/sqlc"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// PostgresStore stores deployment state in app.channel_deployments and app.channel_artifacts.
type PostgresStore struct {
	Pool *pgxpool.Pool
}

// RecordPrepared implements Store.
func (s *PostgresStore) RecordPrepared(ctx context.Context, prepared Prepared) (State, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return State{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit
	queries := sqlcdb.New(tx)

	for _, reference := range prepared.Artifacts {
		err := queries.UpsertChannelArtifact(ctx, sqlcdb.UpsertChannelArtifactParams{
			ChannelID:    prepared.ChannelID,
			Kind:         reference.Kind,
			Version:      reference.Version,
			StorageKey:   reference.Key,
			SignatureKey: reference.SignatureKey,
			SigningKeyID: reference.SigningKeyID,
			SizeBytes:    reference.SizeBytes,
		})
		if err != nil {
			return State{}, fmt.Errorf("record artifact %s: %w", reference.Key, err)
		}
	}
	planRef := prepared.artifact(plan.ArtifactPlan)
	bundle := prepared.artifact(plan.ArtifactDependencyBundle)
	schema := prepared.artifact(plan.ArtifactPayloadSchema)
	routing := prepared.artifact(plan.ArtifactRouting)

	resources := prepared.Policies.Deployment.Resources
	concurrency := prepared.Policies.Runtime.Concurrency
	row, err := queries.RecordChannelDeploymentPrepared(ctx, sqlcdb.RecordChannelDeploymentPreparedParams{
		ChannelID:                  prepared.ChannelID,
		SpaceID:                    prepared.SpaceID,
		DesiredVersion:             &planRef.Version,
		PlanStorageKey:             &planRef.Key,
		DependencyBundleVersion:    &bundle.Version,
		DependencyBundleStorageKey: &bundle.Key,
		PayloadSchemaVersion:       &schema.Version,
		PayloadSchemaStorageKey:    &schema.Key,
		RoutingVersion:             &routing.Version,
		RoutingStorageKey:          &routing.Key,
		MemoryMib:                  int32Ptr(resources.MemoryMiB),
		MemoryReservationMib:       int32Ptr(resources.MemoryReservationMiB),
		MaxConcurrentExecutions:    int32Ptr(concurrency.MaxConcurrentExecutions),
		MaxQueuedExecutions:        int32Ptr(concurrency.MaxQueuedExecutions),
	})
	if err != nil {
		return State{}, fmt.Errorf("record desired state: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return State{}, err
	}
	return stateFromRow(row), nil
}

// RecordFailure implements Store.
func (s *PostgresStore) RecordFailure(ctx context.Context, failure Failure) (State, error) {
	row, err := sqlcdb.New(s.Pool).RecordChannelDeploymentFailed(ctx, failure.ChannelID, failure.SpaceID, &failure.Stage, &failure.Message)
	if err != nil {
		return State{}, err
	}
	return stateFromRow(row), nil
}

// SetUnpublished implements Store.
func (s *PostgresStore) SetUnpublished(ctx context.Context, channelID string) (State, error) {
	row, err := sqlcdb.New(s.Pool).SetChannelDeploymentUnpublished(ctx, channelID)
	return stateOrNotFound(row, err)
}

// Get implements Store.
func (s *PostgresStore) Get(ctx context.Context, channelID string) (State, error) {
	row, err := sqlcdb.New(s.Pool).GetChannelDeployment(ctx, channelID)
	return stateOrNotFound(row, err)
}

// ArtifactExists implements Store.
func (s *PostgresStore) ArtifactExists(ctx context.Context, channelID, kind, version string) (bool, error) {
	return sqlcdb.New(s.Pool).ChannelArtifactExists(ctx, channelID, kind, version)
}

// RecordObserved implements Store.
func (s *PostgresStore) RecordObserved(ctx context.Context, observation Observation) (State, error) {
	row, err := sqlcdb.New(s.Pool).RecordChannelDeploymentObserved(ctx, observation.Status, stringPtr(observation.Version), stringPtr(observation.Message), observation.ChannelID)
	return stateOrNotFound(row, err)
}

func stateOrNotFound(row sqlcdb.AppChannelDeployment, err error) (State, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return State{}, ErrNotFound
	}
	if err != nil {
		return State{}, err
	}
	return stateFromRow(row), nil
}

func stateFromRow(row sqlcdb.AppChannelDeployment) State {
	state := State{
		ChannelID:               row.ChannelID,
		SpaceID:                 row.SpaceID,
		DesiredState:            row.DesiredState,
		MemoryMiB:               intValue(row.MemoryMib),
		MemoryReservationMiB:    intValue(row.MemoryReservationMib),
		MaxConcurrentExecutions: intValue(row.MaxConcurrentExecutions),
		MaxQueuedExecutions:     intValue(row.MaxQueuedExecutions),
		PreparationStatus:       row.PreparationStatus,
		PreparationErrorStage:   stringValue(row.PreparationErrorStage),
		PreparationError:        stringValue(row.PreparationError),
		PreparedAt:              timeValue(row.PreparedAt),
		ObservedStatus:          row.ObservedStatus,
		ObservedVersion:         stringValue(row.ObservedVersion),
		ObservedMessage:         stringValue(row.ObservedMessage),
		ObservedAt:              timeValue(row.ObservedAt),
		UpdatedAt:               row.UpdatedAt,
	}
	state.Plan = artifactRef(row.DesiredVersion, row.PlanStorageKey)
	state.DependencyBundle = artifactRef(row.DependencyBundleVersion, row.DependencyBundleStorageKey)
	state.PayloadSchema = artifactRef(row.PayloadSchemaVersion, row.PayloadSchemaStorageKey)
	state.Routing = artifactRef(row.RoutingVersion, row.RoutingStorageKey)
	return state
}

func artifactRef(version, key *string) *ArtifactRef {
	if version == nil || key == nil {
		return nil
	}
	return &ArtifactRef{Version: *version, StorageKey: *key}
}

// PostgresChannels loads channels and resolves their dependencies from the app schema.
type PostgresChannels struct {
	Queries sqlcdb.Querier
}

// Channel implements ChannelSource.
func (p *PostgresChannels) Channel(ctx context.Context, channelID string) (compiler.Input, error) {
	channel, err := p.Queries.GetChannel(ctx, channelID)
	if errors.Is(err, pgx.ErrNoRows) {
		return compiler.Input{}, ErrNotFound
	}
	if err != nil {
		return compiler.Input{}, fmt.Errorf("get channel: %w", err)
	}
	space, err := p.Queries.GetSpace(ctx, channel.SpaceID)
	if err != nil {
		return compiler.Input{}, fmt.Errorf("get space %s: %w", channel.SpaceID, err)
	}
	return compiler.Input{
		OrgID:       space.OrganizationID,
		SpaceID:     channel.SpaceID,
		ChannelID:   channel.ID,
		ChannelName: channel.Name,
		Config:      channel.Config,
	}, nil
}

// Model implements compiler.Resolver.
func (p *PostgresChannels) Model(ctx context.Context, spaceID, modelID string) (compiler.ModelRecord, error) {
	model, err := p.Queries.GetModel(ctx, modelID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && model.SpaceID != spaceID) {
		return compiler.ModelRecord{}, compiler.ErrNotFound
	}
	if err != nil {
		return compiler.ModelRecord{}, err
	}
	return compiler.ModelRecord{ID: model.ID, Name: model.Name, Attributes: model.Attributes}, nil
}

// Connection implements compiler.Resolver.
func (p *PostgresChannels) Connection(ctx context.Context, spaceID, connectionID string) (compiler.ConnectionRecord, error) {
	connection, err := p.Queries.GetConnection(ctx, connectionID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && connection.SpaceID != spaceID) {
		return compiler.ConnectionRecord{}, compiler.ErrNotFound
	}
	if err != nil {
		return compiler.ConnectionRecord{}, err
	}
	// The revision is derived from the last update rather than the attributes, which can hold
	// credentials.
	revision := connection.ID + "\x00" + connection.UpdatedAt.UTC().Format(time.RFC3339Nano)
	return compiler.ConnectionRecord{
		ID:         connection.ID,
		Name:       connection.Name,
		Category:   connection.ConnectionCategory,
		Revision:   plan.Digest([]byte(revision)),
		Attributes: connection.Attributes,
	}, nil
}

func int32Ptr(value int) *int32 {
	v := int32(value)
	return &v
}

func intValue(value *int32) int {
	if value == nil {
		return 0
	}
	return int(*value)
}

func stringPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func timeValue(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	t := value.Time
	return &t
}
