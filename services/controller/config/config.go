package config

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/ongruent/gruent/db/sqlc"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/libs/legacy/engine/environment"
	"github.com/ongruent/gruent/libs/legacy/engine/observability"
	"github.com/ongruent/gruent/libs/secrets"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/artifactstore"
	sqlcService "github.com/ongruent/gruent/services/controller/internal/sqlc"
	"github.com/rs/zerolog"
	"github.com/spf13/viper"
)

// Build time variables
const (
	BuildVersion = "{{BUILD_VERSION}}"
	BuildCommit  = "{{BUILD_COMMIT}}"
	BuildDirty   = "{{BUILD_DIRTY}}"
	BuildTime    = "{{BUILD_TIME}}"
	BuildCreator = "{{BUILD_CREATOR}}"
)

// Global app config
var Env environment.Env
var EnvConf *EnvConfig
var VaultConf *VaultConfig
var SecretsClient secrets.SecretsClient

// EnvConfig is the configuration we get from the environment variables
type EnvConfig struct {
	ApiVaultUsername string `mapstructure:"API_VAULT_USERNAME"`
	ApiVaultPassword string `mapstructure:"API_VAULT_PASSWORD"`
}

// VaultConfig is the configuration we get from the Vault secrets
type VaultConfig struct {
	// Logging
	LogLevel string `mapstructure:"LOG_LEVEL"`

	// Controller grpc server port
	ControllerServerPort int `mapstructure:"CONTROLLER_SERVER_PORT"`

	// Database
	DatabaseUrl string `mapstructure:"DATABASE_URL"`

	// Observability
	OtelCollectorEndpoint string `mapstructure:"OTEL_COLLECTOR_ENDPOINT"`

	// Artifact storage (S3-compatible)
	ArtifactStorageEndpoint        string `mapstructure:"ARTIFACT_STORAGE_ENDPOINT"`
	ArtifactStorageAccessKeyID     string `mapstructure:"ARTIFACT_STORAGE_ACCESS_KEY_ID"`
	ArtifactStorageSecretAccessKey string `mapstructure:"ARTIFACT_STORAGE_SECRET_ACCESS_KEY"`
	ArtifactStorageBucket          string `mapstructure:"ARTIFACT_STORAGE_BUCKET"`
	ArtifactStorageRegion          string `mapstructure:"ARTIFACT_STORAGE_REGION"`
	ArtifactStorageUseSSL          bool   `mapstructure:"ARTIFACT_STORAGE_USE_SSL"`

	// Artifact signing: an Ed25519 seed (base64) and the ID consumers know its public key by
	ArtifactSigningKeyID      string `mapstructure:"ARTIFACT_SIGNING_KEY_ID"`
	ArtifactSigningPrivateKey string `mapstructure:"ARTIFACT_SIGNING_PRIVATE_KEY"`

	// Redis
	RedisHost     string `mapstructure:"REDIS_HOST"`
	RedisPort     int    `mapstructure:"REDIS_PORT"`
	RedisUsername string `mapstructure:"REDIS_USERNAME"`
	RedisPassword string `mapstructure:"REDIS_PASSWORD"`
}

func init() {
	Env = environment.GetFromEnvVar()
	EnvConf, VaultConf = load(Env)
}

func load(env environment.Env) (envConfig *EnvConfig, vaultConfig *VaultConfig) {
	var err error

	viper.SetConfigType("env")
	viper.AutomaticEnv()

	// Vault address from the environment variables
	vaultAddress := os.Getenv("VAULT_ADDRESS")

	if env == environment.Development {
		viper.BindEnv("API_VAULT_USERNAME")
		viper.BindEnv("API_VAULT_PASSWORD")

		// Put the read config into our app config struct
		if err := viper.Unmarshal(&envConfig); err != nil {
			panic(err)
		}

		// In a development setup, we use UserPass auth method to authenticate
		// with vault, and get a token that way. This token is valid for the
		// duration of the app.
		SecretsClient, err = secrets.NewClient(vaultAddress, envConfig.ApiVaultUsername, envConfig.ApiVaultPassword, "")
		if err != nil {
			panic(fmt.Sprintf("Could not connect to Vault, %v", err))
		}
	} else if env == environment.Production {
		// In a production setup, Vault is setup to "inject" a token into
		// the container this application is running on, so we don't need
		// to authenticate
		SecretsClient, err = secrets.NewClient(vaultAddress, "", "", secrets.VaultTokenFilePath)
		if err != nil {
			panic(fmt.Sprintf("Could not connect to Vault, %v", err))
		}
	} else {
		panic(fmt.Sprintf("Unknown or empty environment env var: %v", env))
	}

	// Load secrets from Vault into the VaultConfig struct
	vaultConfig, err = loadVaultSecrets()
	if err != nil {
		panic(fmt.Sprintf("Error loading Vault secrets: %v", err))
	}

	// Print the info banner only for the main process, since fiber http framework
	// spawns multiple processes if prefork is enabled
	if os.Getppid() <= 1 {
		info := environment.BuildInfo{
			ServiceName: "Controller",
			Version:     BuildVersion,
			LogLevel:    vaultConfig.LogLevel,
			CommitHash:  BuildCommit,
			BuildTime:   BuildTime,
			Dirty:       BuildDirty,
			Creator:     BuildCreator,
			ExtraFields: map[string]any{
				"Vault Address": vaultAddress,
				"Server Port":   vaultConfig.ControllerServerPort,
			},
		}
		fmt.Println(environment.PrintInfoBanner(info))
	}

	// Initialize the DB client
	err = initDbClient(vaultConfig.DatabaseUrl)
	if err != nil {
		panic(fmt.Sprintf("Error initializing database client: %v", err))
	}

	// Initialize the artifact storage client
	err = initArtifactStore(vaultConfig)
	if err != nil {
		panic(fmt.Sprintf("Error initializing artifact storage: %v", err))
	}

	// Initialize the artifact signer
	err = initArtifactSigner(vaultConfig.ArtifactSigningKeyID, vaultConfig.ArtifactSigningPrivateKey)
	if err != nil {
		panic(fmt.Sprintf("Error initializing artifact signing: %v", err))
	}

	// Setup logging
	zerolog.SetGlobalLevel(observability.LogLevel(vaultConfig.LogLevel).Level())

	return
}

func loadVaultSecrets() (*VaultConfig, error) {
	// Retrieve the secrets from Vault
	secrets, err := SecretsClient.ReadKeyValue(context.Background(), "config/controller")
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve secrets from Vault: %w", err)
	}

	// Safely assign each value, with a fallback to empty string or handle nil cases
	vaultConfig := &VaultConfig{
		LogLevel:                       SecretsClient.GetStringFromMap(secrets, "LOG_LEVEL"),
		ControllerServerPort:           SecretsClient.GetIntFromMap(secrets, "CONTROLLER_SERVER_PORT"),
		DatabaseUrl:                    SecretsClient.GetStringFromMap(secrets, "DATABASE_URL"),
		OtelCollectorEndpoint:          SecretsClient.GetStringFromMap(secrets, "OTEL_COLLECTOR_ENDPOINT"),
		ArtifactStorageEndpoint:        SecretsClient.GetStringFromMap(secrets, "ARTIFACT_STORAGE_ENDPOINT"),
		ArtifactStorageAccessKeyID:     SecretsClient.GetStringFromMap(secrets, "ARTIFACT_STORAGE_ACCESS_KEY_ID"),
		ArtifactStorageSecretAccessKey: SecretsClient.GetStringFromMap(secrets, "ARTIFACT_STORAGE_SECRET_ACCESS_KEY"),
		ArtifactStorageBucket:          SecretsClient.GetStringFromMap(secrets, "ARTIFACT_STORAGE_BUCKET"),
		ArtifactStorageRegion:          SecretsClient.GetStringFromMap(secrets, "ARTIFACT_STORAGE_REGION"),
		ArtifactStorageUseSSL:          SecretsClient.GetBoolFromMap(secrets, "ARTIFACT_STORAGE_USE_SSL"),
		ArtifactSigningKeyID:           SecretsClient.GetStringFromMap(secrets, "ARTIFACT_SIGNING_KEY_ID"),
		ArtifactSigningPrivateKey:      SecretsClient.GetStringFromMap(secrets, "ARTIFACT_SIGNING_PRIVATE_KEY"),
		RedisHost:                      SecretsClient.GetStringFromMap(secrets, "REDIS_HOST"),
		RedisPort:                      SecretsClient.GetIntFromMap(secrets, "REDIS_PORT"),
		RedisUsername:                  SecretsClient.GetStringFromMap(secrets, "REDIS_USERNAME"),
		RedisPassword:                  SecretsClient.GetStringFromMap(secrets, "REDIS_PASSWORD"),
	}

	return vaultConfig, nil
}

func initDbClient(databaseUrl string) error {
	// TODO: replace deprecated prisma mock with sqlc mock
	// // If running 'nx test', use a default mock client
	// environment := os.Getenv("ENVIRONMENT")
	// if environment == "test" {
	// 	client, _, _ := db.NewMock()
	// 	sqlcService.Client = client
	// 	return nil
	// }

	// Connect
	pool, err := pgxpool.New(context.Background(), databaseUrl)
	if err != nil {
		return fmt.Errorf("could not create pgx pool: %s", err)
	}

	sqlcService.Pool = pool
	sqlcService.Queries = sqlcdb.New(pool)
	return nil
}

func initArtifactStore(vaultConfig *VaultConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	store, err := artifacts.NewS3Store(ctx, artifacts.S3Config{
		Endpoint:        vaultConfig.ArtifactStorageEndpoint,
		AccessKeyID:     vaultConfig.ArtifactStorageAccessKeyID,
		SecretAccessKey: vaultConfig.ArtifactStorageSecretAccessKey,
		Bucket:          vaultConfig.ArtifactStorageBucket,
		Region:          vaultConfig.ArtifactStorageRegion,
		UseSSL:          vaultConfig.ArtifactStorageUseSSL,
	})
	if err != nil {
		return err
	}

	artifactstore.Store = store
	return nil
}

func initArtifactSigner(keyID string, privateKey string) error {
	signer, err := signing.NewSigner(keyID, privateKey)
	if err != nil {
		return err
	}

	fmt.Printf("Signing artifacts with key %s (public key %s)\n", signer.KeyID(), signer.PublicKey())
	artifactstore.Signer = signer
	return nil
}
