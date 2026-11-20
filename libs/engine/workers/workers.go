// Package workers is the contract between the controller and runtime workers (services/runtime).
//
// The controller deploys one runtime worker per published channel and configures it with environment
// variables (the names below). The worker downloads and verifies the plan from artifact storage, serves
// the channel's invocations, and reports what it serves with Observation messages, which the controller
// records as the channel's observed deployment state.
package workers

import (
	"fmt"
	"time"
)

// Environment variables of a runtime worker. They mirror com.gruent.runtime.RuntimeConfig.
const (
	EnvChannelID      = "GRUENT_CHANNEL_ID"
	EnvPlanKey        = "GRUENT_PLAN_KEY"
	EnvPlanVersion    = "GRUENT_PLAN_VERSION"
	EnvSigningKeyring = "ARTIFACT_SIGNING_KEYRING"
	EnvNATSURL        = "NATS_URL"
	EnvOtelEndpoint   = "OTEL_COLLECTOR_ENDPOINT"
	EnvEnvironment    = "ENVIRONMENT"

	EnvStorageEndpoint        = "ARTIFACT_STORAGE_ENDPOINT"
	EnvStorageBucket          = "ARTIFACT_STORAGE_BUCKET"
	EnvStorageRegion          = "ARTIFACT_STORAGE_REGION"
	EnvStorageAccessKeyID     = "ARTIFACT_STORAGE_ACCESS_KEY_ID"
	EnvStorageSecretAccessKey = "ARTIFACT_STORAGE_SECRET_ACCESS_KEY"
	EnvStorageUseSSL          = "ARTIFACT_STORAGE_USE_SSL"
)

// KindObservation is the kind of Observation messages.
const KindObservation = "RuntimeObservation"

// Observation statuses. They match the controller's observed statuses.
const (
	StatusApplied = "applied"
	StatusFailed  = "failed"
	StatusStopped = "stopped"
)

// ObservationSubjects matches every channel's observation subject.
const ObservationSubjects = "gruent.v1.runtime.observations.*"

// ObservationSubject returns the NATS subject that a channel's runtime workers report to.
func ObservationSubject(channelID string) string {
	return fmt.Sprintf("gruent.v1.runtime.observations.%s", channelID)
}

// Observation is a runtime worker's report about the plan version it serves.
type Observation struct {
	APIVersion  string    `json:"apiVersion"`
	Kind        string    `json:"kind"`
	ChannelID   string    `json:"channelId"`
	PlanVersion string    `json:"planVersion"`
	Status      string    `json:"status"`
	Message     string    `json:"message,omitempty"`
	ObservedAt  time.Time `json:"observedAt"`
}
