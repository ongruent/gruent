package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/ongruent/gruent/libs/engine/workers"

	"github.com/ongruent/gruent/libs/telemetry"
	"github.com/ongruent/gruent/services/controller/api"
	"github.com/ongruent/gruent/services/controller/config"
	"github.com/ongruent/gruent/services/controller/internal/artifactstore"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	"github.com/ongruent/gruent/services/controller/internal/runtimes"
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

	service.Runtimes = runtimeDeployer()
	if config.VaultConf.NatsURL != "" {
		connection, err := subscribeObservations(service, config.VaultConf.NatsURL)
		if err != nil {
			panic(fmt.Errorf("failed to subscribe to runtime observations: %v", err))
		}
		defer connection.Close()
	} else {
		fmt.Println("NATS_URL is not set: runtime observations are not recorded")
	}

	server := api.New(service)
	fmt.Printf("Starting controller server on port %d...\n", config.VaultConf.ControllerServerPort)
	server.Listen(config.VaultConf.ControllerServerPort)
}

// runtimeDeployer returns the Kubernetes deployer of runtime workers, or nil if no cluster is configured.
func runtimeDeployer() deployments.Runtimes {
	kube, err := runtimes.NewKubeClient(os.Getenv("KUBECONFIG"))
	if err != nil {
		fmt.Printf("Runtime workers are not deployed: %v\n", err)
		return nil
	}
	conf := config.VaultConf
	storageEndpoint := conf.RuntimeArtifactStorageEndpoint
	if storageEndpoint == "" {
		storageEndpoint = conf.ArtifactStorageEndpoint
	}
	deployer := &runtimes.Deployer{
		Kube: kube,
		Config: runtimes.Config{
			Namespace:       valueOr(conf.RuntimeNamespace, "gruent-runtime"),
			Image:           valueOr(conf.RuntimeImage, "gruent-runtime:local"),
			ImagePullPolicy: conf.RuntimeImagePullPolicy,
			Storage: runtimes.Storage{
				Endpoint:        storageEndpoint,
				Bucket:          conf.ArtifactStorageBucket,
				Region:          conf.ArtifactStorageRegion,
				AccessKeyID:     conf.ArtifactStorageAccessKeyID,
				SecretAccessKey: conf.ArtifactStorageSecretAccessKey,
				UseSSL:          conf.ArtifactStorageUseSSL,
			},
			SigningKeyring:          artifactstore.Signer.KeyID() + "=" + artifactstore.Signer.PublicKey(),
			NATSURL:                 conf.RuntimeNatsURL,
			OtelEndpoint:            conf.RuntimeOtelCollectorEndpoint,
			Environment:             string(config.Env),
			OverheadMiB:             256,
			TerminationGraceSeconds: 45,
		},
	}
	fmt.Printf("Deploying runtime workers to %s (namespace %s, image %s)\n", kube.Server, deployer.Config.Namespace, deployer.Config.Image)
	return deployer
}

// subscribeObservations records the observations that runtime workers publish.
func subscribeObservations(service *deployments.Service, url string) (*nats.Conn, error) {
	connection, err := nats.Connect(url, nats.Name("controller"), nats.MaxReconnects(-1))
	if err != nil {
		return nil, err
	}
	_, err = connection.QueueSubscribe(workers.ObservationSubjects, "controller", func(message *nats.Msg) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		state, err := service.HandleObservation(ctx, message.Data)
		if err != nil {
			fmt.Printf("Could not record runtime observation on %s: %v\n", message.Subject, err)
			return
		}
		fmt.Printf("Channel %s observed %s at version %s\n", state.ChannelID, state.ObservedStatus, state.ObservedVersion)
	})
	if err != nil {
		connection.Close()
		return nil, err
	}
	return connection, nil
}

func valueOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
