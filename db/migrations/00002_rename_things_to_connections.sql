-- +goose Up
-- Renames the "thing" concept to "connection". Row data is preserved: this only
-- renames the table, columns, indexes and constraints, and rewrites the stored
-- permission strings from the "things" namespace to "connections".

ALTER TABLE app.things RENAME TO connections;
ALTER TABLE app.connections RENAME COLUMN thing_category TO connection_category;
ALTER TABLE app.applied_tags RENAME COLUMN thing_id TO connection_id;

ALTER INDEX app.idx_things_space_id RENAME TO idx_connections_space_id;
ALTER INDEX app.idx_applied_tags_thing_id RENAME TO idx_applied_tags_connection_id;

ALTER TABLE app.connections RENAME CONSTRAINT things_pkey TO connections_pkey;
ALTER TABLE app.connections RENAME CONSTRAINT things_space_id_fkey TO connections_space_id_fkey;
ALTER TABLE app.applied_tags RENAME CONSTRAINT applied_tags_thing_id_fkey TO applied_tags_connection_id_fkey;

-- Permission strings are stored as "<namespace>:<action>", e.g. "things:list".
UPDATE app.permissions
SET permissions = ARRAY(
  SELECT regexp_replace(permission, '^things:', 'connections:')
  FROM unnest(permissions) WITH ORDINALITY AS p(permission, position)
  ORDER BY position
)
WHERE EXISTS (
  SELECT 1 FROM unnest(permissions) AS p(permission) WHERE permission LIKE 'things:%'
);

-- +goose Down
UPDATE app.permissions
SET permissions = ARRAY(
  SELECT regexp_replace(permission, '^connections:', 'things:')
  FROM unnest(permissions) WITH ORDINALITY AS p(permission, position)
  ORDER BY position
)
WHERE EXISTS (
  SELECT 1 FROM unnest(permissions) AS p(permission) WHERE permission LIKE 'connections:%'
);

ALTER TABLE app.applied_tags RENAME CONSTRAINT applied_tags_connection_id_fkey TO applied_tags_thing_id_fkey;
ALTER TABLE app.connections RENAME CONSTRAINT connections_space_id_fkey TO things_space_id_fkey;
ALTER TABLE app.connections RENAME CONSTRAINT connections_pkey TO things_pkey;

ALTER INDEX app.idx_applied_tags_connection_id RENAME TO idx_applied_tags_thing_id;
ALTER INDEX app.idx_connections_space_id RENAME TO idx_things_space_id;

ALTER TABLE app.applied_tags RENAME COLUMN connection_id TO thing_id;
ALTER TABLE app.connections RENAME COLUMN connection_category TO thing_category;
ALTER TABLE app.connections RENAME TO things;
