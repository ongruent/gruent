// Package deployments prepares channel artifacts and records the desired deployment state.
//
// The package ends where deployment execution begins. Publishing a channel compiles it, uploads its
// artifacts, and records the resulting version as desired. It never deploys anything, so the observed
// state of a channel stays unknown until a runtime acknowledges a version through RecordObserved.
// Delivering desired state to runtimes and source services is future runtime integration.
package deployments

import "time"

// Desired states.
const (
	DesiredPublished   = "published"
	DesiredUnpublished = "unpublished"
)

// Preparation statuses.
const (
	PreparationReady  = "ready"
	PreparationFailed = "failed"
)

// Stages of artifact preparation, used to report where a preparation failed.
const (
	StageLoad    = "load"
	StageCompile = "compile"
	StageUpload  = "upload"
)

// Observed statuses, reported by runtimes.
const (
	// ObservedUnknown means that no runtime has acknowledged the channel. Uploading artifacts does not
	// change this.
	ObservedUnknown = "unknown"
	// ObservedApplied means that a runtime has applied ObservedVersion and is running it.
	ObservedApplied = "applied"
	// ObservedFailed means that a runtime failed to apply ObservedVersion.
	ObservedFailed = "failed"
	// ObservedStopped means that a runtime has stopped running the channel.
	ObservedStopped = "stopped"
)

// ArtifactRef locates an uploaded artifact.
type ArtifactRef struct {
	Version    string
	StorageKey string
}

// State is the deployment state of a channel.
type State struct {
	ChannelID string
	SpaceID   string

	DesiredState string
	// The artifacts of the desired version. They are nil until a version has been prepared
	// successfully. Plan is the desired version; it pins the dependency bundle and payload schema.
	Plan             *ArtifactRef
	DependencyBundle *ArtifactRef
	PayloadSchema    *ArtifactRef
	Routing          *ArtifactRef

	// The static resource and concurrency contract of the desired version, copied from the plan.
	MemoryMiB               int
	MemoryReservationMiB    int
	MaxConcurrentExecutions int
	MaxQueuedExecutions     int

	PreparationStatus     string
	PreparationErrorStage string
	PreparationError      string
	PreparedAt            *time.Time

	ObservedStatus  string
	ObservedVersion string
	ObservedMessage string
	ObservedAt      *time.Time

	UpdatedAt time.Time
}

// DesiredVersion returns the desired execution plan version, or "" if none has been prepared.
func (s State) DesiredVersion() string {
	if s.Plan == nil {
		return ""
	}
	return s.Plan.Version
}

// Converged reports whether a runtime has acknowledged applying the desired version.
func (s State) Converged() bool {
	return s.DesiredState == DesiredPublished &&
		s.Plan != nil &&
		s.ObservedStatus == ObservedApplied &&
		s.ObservedVersion == s.Plan.Version
}
