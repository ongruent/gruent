package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/stdlib"
	gruentDb "github.com/ongruent/gruent/db"
	"github.com/ongruent/gruent/libs/telemetry"
	"github.com/ongruent/gruent/services/http-api/api"
	"github.com/ongruent/gruent/services/http-api/config"
	sqlcService "github.com/ongruent/gruent/services/http-api/services/sqlc"
	"github.com/pressly/goose/v3"
)

// @title GRUENT
// @version alpha-v1.0
// @description Connect systems with clarity.
// @schemes https http
// @host localhost:9001
// @BasePath /v1
// @securitydefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization

func main() {
	// Setup observability
	observability, err := telemetry.InitObservability(telemetry.InitConfig{
		ServiceName:           "http-api",
		OtelCollectorEndpoint: config.VaultConf.OtelCollectorEndpoint,
		Environment:           config.Env,
	})
	if err != nil {
		panic(fmt.Errorf("failed to setup observability: %v", err))
	}
	defer observability.Shutdown()

	// Create context for graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Apply pending database migrations. Only the parent process runs them,
	// since fiber re-executes main() in every child process when prefork is enabled
	if !fiber.IsChild() {
		if err := migrateDatabase(ctx); err != nil {
			panic(fmt.Errorf("failed to migrate database: %v", err))
		}
	}

	// Create new API server
	api := api.New()

	// Start server in a goroutine
	go func() {
		if err := api.Listen(config.VaultConf.ApiPort); err != nil {
			panic(fmt.Errorf("Server error: %s", err))
		}
	}()

	// Wait for interrupt signal
	<-ctx.Done()
	// Only print the shutdown message once
	if os.Getppid() <= 1 {
		fmt.Println("Shutting down server...")
	}

	// Shut down the server
	errors := api.Shutdown()
	if len(errors) > 0 {
		fmt.Printf("Server shutdown errors for PID %v: %v\n", os.Getppid(), errors)
	}

	// Only print the shutdown message once
	fmt.Printf("Server gracefully stopped for PID %v\n", os.Getppid())
}

// migrateDatabase applies the goose migrations embedded in the db module
// using the service's existing connection pool
func migrateDatabase(ctx context.Context) error {
	db := stdlib.OpenDBFromPool(sqlcService.Pool)
	defer db.Close() // does not close the underlying pool

	goose.SetBaseFS(gruentDb.Migrations)
	if err := goose.SetDialect(string(goose.DialectPostgres)); err != nil {
		return err
	}

	return goose.UpContext(ctx, db, gruentDb.MigrationsDir)
}
