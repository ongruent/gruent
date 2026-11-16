# db

Postgres schema, queries, and generated Go models for the `app` schema.

- `migrations/` – [goose](https://github.com/pressly/goose) SQL migrations. They are the source of truth for the schema and are also read by sqlc (see `sqlc.yaml`). sqlc only reads the `-- +goose Up` section of each file.
- `queries/` – sqlc queries.
- `sqlc/` – generated Go code. Do not edit by hand.
- `cmd/goose` – goose CLI with only the pgx driver, which runs the migrations embedded in `migrations.FS`.

## Workflow

```bash
# 1. Create a new sequentially numbered migration, then fill in the Up and Down sections
pnpm nx run db:migrate-create --name=add_widgets

# 2. Regenerate the sqlc models and queries (requires sqlc v1.31.1)
pnpm nx run db:generate

# 3. Apply it to your database
pnpm nx run db:migrate          # up (default)
pnpm nx run db:migrate:status
pnpm nx run db:migrate:down     # roll back the latest migration
```

Other configurations of `db:migrate`: `redo`, `reset`, and `version`. `db:migrate-validate` checks that the migration files parse without connecting to a database.

The migrate targets use `DATABASE_URL`. If it is unset, they fall back to the local Postgres from `deploy/engine/local/docker-compose.yaml` (`postgresql://gruent:gruent@localhost:5432/gruent`).

Do not edit a migration after it has been applied to a shared database. Add a new one instead.
