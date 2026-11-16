// Package db holds the Postgres schema for the app schema.
//
// The SQL migrations in migrations/ are managed by goose and are also the
// schema source for sqlc (see sqlc.yaml), so every migration must use goose
// annotations (-- +goose Up / -- +goose Down).
package db

import "embed"

// MigrationsDir is the directory within Migrations that contains the SQL files.
const MigrationsDir = "migrations"

// Migrations contains every goose SQL migration, embedded at build time.
//
//go:embed migrations/*.sql
var Migrations embed.FS
