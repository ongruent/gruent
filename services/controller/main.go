package main

import (
	"fmt"

	"github.com/ongruent/gruent/libs/telemetry"
	"github.com/ongruent/gruent/services/controller/api"
	"github.com/ongruent/gruent/services/controller/config"
	"github.com/ongruent/gruent/services/controller/internal/artifactstore"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	sqlcService "github.com/ongruent/gruent/services/controller/internal/sqlc"
)

func main() {
	observability, err := telemetry.InitObservability(telemetry.InitConfig{
		ServiceName:           "controller",
		OtelCollectorEndpoint: config.VaultConf.OtelCollectorEndpoint,
		Environment:           config.Env,
	})
	if err != nil {
		panic(fmt.Errorf("failed to setup observability: %v", err))
	}
	defer observability.Shutdown()

	channels := &deployments.PostgresChannels{Queries: sqlcService.Queries}
	service := &deployments.Service{
		Channels:  channels,
		Resolver:  channels,
		Artifacts: artifactstore.Store,
		Signer:    artifactstore.Signer,
		Store:     &deployments.PostgresStore{Pool: sqlcService.Pool},
	}

	server := api.New(service)
	fmt.Printf("Starting controller server on port %d...\n", config.VaultConf.ControllerServerPort)
	server.Listen(config.VaultConf.ControllerServerPort)
}
