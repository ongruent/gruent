# db

Postgres schema, queries, and generated Go models for the `app` schema.

- `migrations/` – [goose](https://github.com/pressly/goose) SQL migrations. They are the source of truth for the schema and are also read by sqlc (see `sqlc.yaml`). sqlc only reads the `-- +goose Up` section of each file.
- `migrations.go` – embeds `migrations/*.sql` as `db.Migrations`.
- `queries/` – sqlc queries.
- `sqlc/` – generated Go code. Do not edit by hand.

## Applying migrations

The `http-api` service runs `goose.Up` with the embedded migrations on startup (see `services/http-api/main.go`). Any pending migrations are applied before the server starts listening.

## Workflow

The Nx targets use the goose CLI, so install it first. Use the same version as `services/http-api/go.mod`:

```bash
go install github.com/pressly/goose/v3/cmd/goose@v3.24.3
```

```bash
# 1. Create a new sequentially numbered migration, then fill in the Up and Down sections
pnpm nx run db:migrate-create --name=add_widgets

# 2. Regenerate the sqlc models and queries (requires sqlc v1.31.1)
pnpm nx run db:generate

# 3. Apply it to your database (or just restart http-api)
pnpm nx run db:migrate          # up (default)
pnpm nx run db:migrate:status
pnpm nx run db:migrate:down     # roll back the latest migration
```

Other configurations of `db:migrate`: `redo`, `reset`, and `version`. `db:migrate-validate` checks that the migration files parse without connecting to a database.

The migrate targets use `DATABASE_URL`. If it is unset, they fall back to the local Postgres from `deploy/engine/local/docker-compose.yaml` (`postgresql://gruent:gruent@localhost:5432/gruent`).

Do not edit a migration after it has been applied to a shared database. Add a new one instead.
