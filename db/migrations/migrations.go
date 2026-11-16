// Package migrations embeds the goose SQL migrations for the app schema.
//
// The same directory is used by sqlc as its schema source (see sqlc.yaml), so
// every migration must use goose annotations (-- +goose Up / -- +goose Down).
package migrations

import "embed"

// FS contains every SQL migration in this directory.
//
//go:embed *.sql
var FS embed.FS
