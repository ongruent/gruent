-- name: GetConnection :one
SELECT * FROM app.connections
WHERE id = $1;

-- name: CountConnectionsFiltered :one
SELECT COUNT(DISTINCT t.id)
FROM app.connections t
WHERE t.space_id = $1
  AND t.internal = false
  AND ($2::text IS NULL OR t.connection_category = $2)
  AND (
    $3::text IS NULL
    OR t.id ILIKE $3
    OR t.name ILIKE $3
    OR t.connection_category ILIKE $3
  )
  AND (
    $4::text[] IS NULL
    OR EXISTS (
      SELECT 1
      FROM app.applied_tags at
      WHERE at.connection_id = t.id
        AND at.tag_id = ANY($4::text[])
    )
  );

-- name: ListConnectionsFiltered :many
SELECT t.*
FROM app.connections t
WHERE t.space_id = $1
  AND t.internal = false
  AND ($2::text IS NULL OR t.connection_category = $2)
  AND (
    $3::text IS NULL
    OR t.id ILIKE $3
    OR t.name ILIKE $3
    OR t.connection_category ILIKE $3
  )
  AND (
    $4::text[] IS NULL
    OR EXISTS (
      SELECT 1
      FROM app.applied_tags at
      WHERE at.connection_id = t.id
        AND at.tag_id = ANY($4::text[])
    )
  )
ORDER BY t.connection_category DESC
LIMIT $5 OFFSET $6;

-- name: ListConnections :many
SELECT * FROM app.connections
WHERE space_id = $1
ORDER BY name;

-- name: ListConnectionsByCategory :many
SELECT * FROM app.connections
WHERE space_id = $1 AND connection_category = $2
ORDER BY name;

-- name: CreateConnection :one
INSERT INTO app.connections (
  id, name, space_id, attributes, internal, connection_category, created_by, updated_by
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: UpdateConnection :one
UPDATE app.connections
SET name = $2,
    attributes = $3,
    updated_by = $4,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteConnection :exec
DELETE FROM app.connections
WHERE id = $1;

-- name: DeleteConnectionsBySpace :exec
DELETE FROM app.connections
WHERE space_id = $1;

-- name: ListInternalConnections :many
SELECT * FROM app.connections
WHERE space_id = $1 AND internal = true
ORDER BY name;

-- name: CreateCertificate :one
INSERT INTO app.certificates (
  id, name, policy, space_id
) VALUES (
  $1, $2, $3, $4
)
RETURNING *;

-- name: GetCertificate :one
SELECT * FROM app.certificates
WHERE id = $1;

-- name: DeleteCertificatesBySpace :exec
DELETE FROM app.certificates
WHERE space_id = $1;
