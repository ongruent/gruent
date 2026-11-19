-- +goose Up
-- Desired deployment state recorded by the controller. Uploading artifacts is not a deployment:
-- observed_* columns stay "unknown" until a runtime acknowledges that it applied a version.

-- Every artifact the controller has uploaded for a channel, so that runtimes and source services can
-- retrieve any version by reference. Artifacts are content-addressed: version is the SHA-256 digest of
-- the artifact and storage_key contains it.
CREATE TABLE app.channel_artifacts (
  channel_id TEXT NOT NULL REFERENCES app.channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('execution_plan', 'routing')),
  version TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, kind, version)
);

-- One row per channel that has been published at least once.
CREATE TABLE app.channel_deployments (
  channel_id TEXT PRIMARY KEY REFERENCES app.channels(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES app.spaces(id),

  -- Desired state. desired_version is the execution plan version runtimes should apply. It is only
  -- replaced when a new version has been compiled and uploaded, so a failed publish keeps the last
  -- prepared version.
  desired_state TEXT NOT NULL CHECK (desired_state IN ('published', 'unpublished')),
  desired_version TEXT,
  plan_storage_key TEXT,
  routing_version TEXT,
  routing_storage_key TEXT,

  -- Static resource and concurrency contract of desired_version.
  memory_mib INTEGER,
  memory_reservation_mib INTEGER,
  max_concurrent_executions INTEGER,
  max_queued_executions INTEGER,

  -- Outcome of the latest artifact preparation (load, compile and upload).
  preparation_status TEXT NOT NULL CHECK (preparation_status IN ('ready', 'failed')),
  preparation_error_stage TEXT CHECK (preparation_error_stage IN ('load', 'compile', 'upload')),
  preparation_error TEXT,
  prepared_at TIMESTAMPTZ,

  -- Observed state, reported by runtimes. Unknown until a runtime acknowledges a version.
  observed_status TEXT NOT NULL DEFAULT 'unknown' CHECK (observed_status IN ('unknown', 'applied', 'failed', 'stopped')),
  observed_version TEXT,
  observed_message TEXT,
  observed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_deployments_space_id ON app.channel_deployments(space_id);

-- +goose Down
DROP TABLE app.channel_deployments;
DROP TABLE app.channel_artifacts;
