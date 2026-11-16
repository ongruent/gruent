// Command goose is a goose CLI preconfigured for the Gruent Postgres database.
//
// It only ships the pgx driver and runs the migrations embedded in
// github.com/ongruent/gruent/db/migrations, so it can be built into a single
// binary. Commands that write files (create, fix) operate on the on-disk
// migrations directory instead.
//
// Usage:
//
//	DATABASE_URL=postgresql://... go run ./cmd/goose [flags] <command> [args]
//
// Run with -h for the list of commands.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/ongruent/gruent/db/migrations"
	"github.com/pressly/goose/v3"
)

const usage = `Usage: goose [flags] <command> [args]

Commands:
  up                   Migrate the DB to the most recent version available
  up-by-one            Migrate the DB up by 1
  up-to VERSION        Migrate the DB to a specific VERSION
  down                 Roll back the version by 1
  down-to VERSION      Roll back to a specific VERSION
  redo                 Re-run the latest migration
  reset                Roll back all migrations
  status               Dump the migration status for the current DB
  version              Print the current version of the database
  validate             Check migration files without running them
  create NAME          Create a new sequentially numbered SQL migration
  fix                  Apply sequential ordering to migrations

Environment:
  DATABASE_URL         Postgres connection string (required unless -db is set)

Flags:
`

func main() {
	flags := flag.NewFlagSet("goose", flag.ExitOnError)
	dir := flags.String("dir", "migrations", "migrations directory, used by create and fix")
	dbString := flags.String("db", os.Getenv("DATABASE_URL"), "Postgres connection string")
	table := flags.String("table", goose.DefaultTablename, "goose version table name")
	allowMissing := flags.Bool("allow-missing", false, "apply missing (out-of-order) migrations")
	flags.Usage = func() {
		fmt.Fprint(flags.Output(), usage)
		flags.PrintDefaults()
	}
	_ = flags.Parse(os.Args[1:])

	args := flags.Args()
	if len(args) == 0 {
		flags.Usage()
		os.Exit(2)
	}
	command, args := args[0], args[1:]

	goose.SetTableName(*table)
	goose.SetSequential(true)
	if err := goose.SetDialect(string(goose.DialectPostgres)); err != nil {
		log.Fatalf("goose: %v", err)
	}

	switch command {
	case "create":
		if len(args) != 1 {
			log.Fatal("goose: usage: create NAME")
		}
		if err := goose.Create(nil, *dir, args[0], "sql"); err != nil {
			log.Fatalf("goose create: %v", err)
		}
		return
	case "fix":
		if err := goose.Fix(*dir); err != nil {
			log.Fatalf("goose fix: %v", err)
		}
		return
	}

	goose.SetBaseFS(migrations.FS)

	if command == "validate" {
		if _, err := goose.CollectMigrations(".", 0, goose.MaxVersion); err != nil {
			log.Fatalf("goose validate: %v", err)
		}
		return
	}

	if *dbString == "" {
		log.Fatal("goose: DATABASE_URL is not set (or pass -db)")
	}

	db, err := sql.Open("pgx", *dbString)
	if err != nil {
		log.Fatalf("goose: open database: %v", err)
	}
	defer db.Close()

	var opts []goose.OptionsFunc
	if *allowMissing {
		opts = append(opts, goose.WithAllowMissing())
	}

	if err := goose.RunWithOptionsContext(context.Background(), command, db, ".", args, opts...); err != nil {
		log.Fatalf("goose %s: %v", command, err)
	}
}
