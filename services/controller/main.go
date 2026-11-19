package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ongruent/gruent/libs/legacy/engine/environment"
	"github.com/ongruent/gruent/libs/telemetry"
	"github.com/ongruent/gruent/services/controller/api"
	"github.com/ongruent/gruent/services/controller/config"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	sqlcService "github.com/ongruent/gruent/services/controller/internal/sqlc"
)

func main() {
	observability, err := telemetry.InitObservability(telemetry.InitConfig{
		ServiceName:           "controller",
		OtelCollectorEndpoint: os.Getenv("OTEL_COLLECTOR_ENDPOINT"),
		Environment:           environment.GetFromEnvVar(),
	})
	if err != nil {
		panic(fmt.Errorf("failed to setup observability: %v", err))
	}
	defer observability.Shutdown()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	artifactStore, err := artifacts.NewS3Store(ctx, artifacts.S3Config{
		Endpoint:        config.VaultConf.ArtifactStorageEndpoint,
		AccessKeyID:     config.VaultConf.ArtifactStorageAccessKeyID,
		SecretAccessKey: config.VaultConf.ArtifactStorageSecretAccessKey,
		Bucket:          config.VaultConf.ArtifactStorageBucket,
		Region:          config.VaultConf.ArtifactStorageRegion,
		UseSSL:          config.VaultConf.ArtifactStorageUseSSL,
	})
	cancel()
	if err != nil {
		panic(fmt.Errorf("failed to set up artifact storage: %v", err))
	}

	channels := &deployments.PostgresChannels{Queries: sqlcService.Queries}
	service := &deployments.Service{
		Channels:  channels,
		Resolver:  channels,
		Artifacts: artifactStore,
		Store:     &deployments.PostgresStore{Pool: sqlcService.Pool},
	}

	server := api.New(service)
	fmt.Printf("Starting controller server on port %d...\n", config.VaultConf.ControllerServerPort)
	server.Listen(config.VaultConf.ControllerServerPort)
}
