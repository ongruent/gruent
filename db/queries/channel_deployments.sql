-- name: UpsertChannelArtifact :exec
INSERT INTO app.channel_artifacts (
  channel_id, kind, version, storage_key, size_bytes
) VALUES (
  $1, $2, $3, $4, $5
)
ON CONFLICT (channel_id, kind, version) DO NOTHING;

-- name: ChannelArtifactExists :one
SELECT EXISTS (
  SELECT 1 FROM app.channel_artifacts
  WHERE channel_id = $1 AND kind = $2 AND version = $3
);

-- name: GetChannelDeployment :one
SELECT * FROM app.channel_deployments
WHERE channel_id = $1;

-- name: RecordChannelDeploymentPrepared :one
INSERT INTO app.channel_deployments (
  channel_id, space_id, desired_state, desired_version, plan_storage_key, routing_version,
  routing_storage_key, memory_mib, memory_reservation_mib, max_concurrent_executions,
  max_queued_executions, preparation_status, prepared_at
) VALUES (
  sqlc.arg(channel_id), sqlc.arg(space_id), 'published', sqlc.arg(desired_version),
  sqlc.arg(plan_storage_key), sqlc.arg(routing_version), sqlc.arg(routing_storage_key),
  sqlc.arg(memory_mib), sqlc.arg(memory_reservation_mib), sqlc.arg(max_concurrent_executions),
  sqlc.arg(max_queued_executions), 'ready', NOW()
)
ON CONFLICT (channel_id) DO UPDATE
SET desired_state = 'published',
    desired_version = EXCLUDED.desired_version,
    plan_storage_key = EXCLUDED.plan_storage_key,
    routing_version = EXCLUDED.routing_version,
    routing_storage_key = EXCLUDED.routing_storage_key,
    memory_mib = EXCLUDED.memory_mib,
    memory_reservation_mib = EXCLUDED.memory_reservation_mib,
    max_concurrent_executions = EXCLUDED.max_concurrent_executions,
    max_queued_executions = EXCLUDED.max_queued_executions,
    preparation_status = 'ready',
    preparation_error_stage = NULL,
    preparation_error = NULL,
    prepared_at = NOW(),
    updated_at = NOW()
RETURNING *;

-- name: RecordChannelDeploymentFailed :one
-- Keeps the last prepared version and its artifacts as the desired version.
INSERT INTO app.channel_deployments (
  channel_id, space_id, desired_state, preparation_status, preparation_error_stage, preparation_error
) VALUES (
  sqlc.arg(channel_id), sqlc.arg(space_id), 'published', 'failed', sqlc.arg(preparation_error_stage),
  sqlc.arg(preparation_error)
)
ON CONFLICT (channel_id) DO UPDATE
SET desired_state = 'published',
    preparation_status = 'failed',
    preparation_error_stage = EXCLUDED.preparation_error_stage,
    preparation_error = EXCLUDED.preparation_error,
    updated_at = NOW()
RETURNING *;

-- name: SetChannelDeploymentUnpublished :one
UPDATE app.channel_deployments
SET desired_state = 'unpublished',
    updated_at = NOW()
WHERE channel_id = $1
RETURNING *;

-- name: RecordChannelDeploymentObserved :one
UPDATE app.channel_deployments
SET observed_status = sqlc.arg(observed_status),
    observed_version = sqlc.narg(observed_version),
    observed_message = sqlc.narg(observed_message),
    observed_at = NOW(),
    updated_at = NOW()
WHERE channel_id = sqlc.arg(channel_id)
RETURNING *;
