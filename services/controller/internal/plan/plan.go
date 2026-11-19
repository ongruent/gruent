// Package plan defines the artifacts that the controller compiles from a channel configuration:
//
//   - Plan: the channel graph, publish strategy, policies, payload types, and metadata. Runtimes execute it.
//   - DependencyBundle: the models, connections, secrets and certificates the plan references, so runtimes
//     can hydrate them.
//   - PayloadSchema: the FlatBuffers schema of the step input and output payloads.
//   - RoutingArtifact: the source bindings and expected input models, for source services.
//
// Every artifact is versioned by the SHA-256 digest of its canonical encoding (see Encode), stored at a
// content-addressed key, and signed (see package signing). Published artifacts are therefore immutable:
// any change to the graph, dependencies or policies (including resource and concurrency values) produces
// a new version, and an unchanged channel always compiles to the same versions. Artifacts contain no
// timestamps or other per-compilation values.
//
// A Plan pins the versions of its DependencyBundle and PayloadSchema, and the RoutingArtifact pins the
// Plan's version, so verifying a plan (see package signing) fixes the whole set.
package plan

import "github.com/ongruent/gruent/services/controller/internal/types"

// APIVersion identifies the artifact schema. Breaking changes to the schema need a new version.
const APIVersion = "gruent.com/v1"

// Document kinds, stored in each artifact's "kind" field.
const (
	KindPlan             = "Plan"
	KindDependencyBundle = "DependencyBundle"
	KindSourceRouting    = "SourceRouting"
)

// Artifact kinds, used in artifact identities, storage keys and signatures.
const (
	ArtifactPlan             = "plan"
	ArtifactDependencyBundle = "dependency_bundle"
	ArtifactPayloadSchema    = "payload_schema"
	ArtifactRouting          = "routing"
)

// ArtifactRef is the identity of an artifact: its kind and version. Key is the artifact's storage key
// within the artifact bucket, derived from the identity. Identities never expire; consumers are given
// short-lived presigned URLs to download them, which are never stored in artifacts.
type ArtifactRef struct {
	Kind    string `json:"kind"`
	Version string `json:"version"`
	Key     string `json:"key"`
}

// Metadata identifies the channel an artifact belongs to.
type Metadata struct {
	OrgID       string `json:"orgId"`
	SpaceID     string `json:"spaceId"`
	ChannelID   string `json:"channelId"`
	ChannelName string `json:"channelName,omitempty"`
}

// Plan is everything a runtime needs to execute a channel, apart from hydrated dependencies.
type Plan struct {
	APIVersion      string          `json:"apiVersion"`
	Kind            string          `json:"kind"`
	Metadata        Metadata        `json:"metadata"`
	PublishStrategy PublishStrategy `json:"publishStrategy"`
	Channel         Channel         `json:"channel"`
	Bindings        Bindings        `json:"bindings"`
	Payloads        Payloads        `json:"payloads"`
	// Dependencies is the DependencyBundle of this plan revision.
	Dependencies ArtifactRef `json:"dependencies"`
	Policies     Policies    `json:"policies"`
}

// PublishStrategyReplace is the only publish strategy: a runtime that applies a new plan version stops
// admitting work to the previous version, lets its in-flight executions finish (bounded by
// policies.runtime.timeouts), and then serves the new version. Versions never run side by side.
const PublishStrategyReplace = "replace"

// PublishStrategy defines how a runtime moves from one plan version of a channel to the next.
type PublishStrategy struct {
	Mode string `json:"mode"`
}

// RoutingArtifact captures the source bindings of a channel and the input models each source expects,
// for the source services that accept work and hand it to a runtime. PlanVersion is the version of the
// plan the bindings route to.
type RoutingArtifact struct {
	APIVersion  string           `json:"apiVersion"`
	Kind        string           `json:"kind"`
	Metadata    Metadata         `json:"metadata"`
	PlanVersion string           `json:"planVersion"`
	Bindings    Bindings         `json:"bindings"`
	InputModels []ModelReference `json:"inputModels"`
	Concurrency Concurrency      `json:"concurrency"`
}

// Channel is the channel's graph. Layout-only data, such as editor coordinates, is excluded so that it
// does not change the plan version.
type Channel struct {
	Name  string `json:"name"`
	Graph Graph  `json:"graph"`
}

// Graph is the channel DAG. Steps and edges are sorted so that their order in the editor does not
// change the plan version.
type Graph struct {
	Steps []Step `json:"steps"`
	Edges []Edge `json:"edges"`
}

// Step is a single step of the channel graph.
type Step struct {
	ID string `json:"id"`
	// Type is "<category>.<label>", e.g. "source.http" or "processing.transform".
	Type    string `json:"type"`
	Version string `json:"version"`
	Name    string `json:"name"`
	// Config is the step configuration as canonical JSON.
	Config     RawJSON  `json:"config"`
	BindingRef string   `json:"bindingRef,omitempty"`
	ModelRefs  []string `json:"modelRefs"`
	// ConnectionRefs are the IDs of the connections the step uses, hydrated from the DependencyBundle.
	ConnectionRefs []string `json:"connectionRefs"`
}

// Edge connects the output of one step to the input of another.
type Edge struct {
	From     string `json:"from"`
	FromPort string `json:"fromPort"`
	To       string `json:"to"`
	ToPort   string `json:"toPort"`
}

// PayloadEncodingFlatBuffers means that step inputs and outputs are ByteArrays holding FlatBuffer data.
const PayloadEncodingFlatBuffers = "flatbuffers"

// Payloads describes the payload of every step input and output.
type Payloads struct {
	Encoding string `json:"encoding"`
	// Schema is the FlatBuffers schema (.fbs) that defines every payload table.
	Schema ArtifactRef `json:"schema"`
	// Namespace of the payload tables in the schema.
	Namespace string        `json:"namespace"`
	Steps     []StepPayload `json:"steps"`
}

// StepPayload is the resolved input and output payload of a step.
type StepPayload struct {
	StepID string `json:"stepId"`
	// Input is absent for source steps.
	Input  *Payload `json:"input,omitempty"`
	Output *Payload `json:"output,omitempty"`
}

// Payload is a payload type: the root table in the payload schema, the type's resolved shape, and the
// model it was declared by, if any.
type Payload struct {
	Table    string     `json:"table"`
	TypeID   string     `json:"typeId"`
	ModelRef string     `json:"modelRef,omitempty"`
	Type     types.Type `json:"type"`
}

// Bindings are the source bindings of a channel, grouped by source type.
type Bindings struct {
	HTTP  []HTTPBinding  `json:"http"`
	Timer []TimerBinding `json:"timer"`
}

// Overflow actions define what a source does with new work when the channel already has
// MaxConcurrentExecutions executions in flight and MaxQueuedExecutions executions queued.
const (
	// OverflowReject rejects the request immediately. HTTP sources respond with Overflow.HTTPStatus.
	OverflowReject = "reject"
	// OverflowSkip drops the triggering event, e.g. a timer tick, without executing the channel.
	OverflowSkip = "skip"
)

// Overflow is the handling of excess work for a binding. Every binding must define it.
type Overflow struct {
	Action     string `json:"action"`
	HTTPStatus int    `json:"httpStatus,omitempty"`
}

// HTTPBinding routes HTTP requests to the channel. Responses are synchronous: the request waits for the
// execution to finish, up to TimeoutMs.
type HTTPBinding struct {
	BindingID      string   `json:"bindingId"`
	StepID         string   `json:"stepId"`
	Method         string   `json:"method"`
	Path           string   `json:"path"`
	ResponseMode   string   `json:"responseMode"`
	TimeoutMs      int64    `json:"timeoutMs"`
	InputModelRefs []string `json:"inputModelRefs"`
	Overflow       Overflow `json:"overflow"`
}

// TimerBinding triggers the channel on a cron schedule.
type TimerBinding struct {
	BindingID      string   `json:"bindingId"`
	StepID         string   `json:"stepId"`
	CronExpression string   `json:"cronExpression"`
	InputModelRefs []string `json:"inputModelRefs"`
	Overflow       Overflow `json:"overflow"`
}

// ModelReference identifies a model at a specific revision.
type ModelReference struct {
	ID       string `json:"id"`
	Revision string `json:"revision"`
}

// Policies are the runtime and deployment policies of the channel.
type Policies struct {
	Runtime    RuntimePolicy    `json:"runtime"`
	Deployment DeploymentPolicy `json:"deployment"`
}

// ExecutionClassStandard is the only execution class for now.
const ExecutionClassStandard = "standard"

// RuntimePolicy contains the limits that runtimes enforce while executing the channel.
type RuntimePolicy struct {
	ExecutionClass string      `json:"executionClass"`
	Concurrency    Concurrency `json:"concurrency"`
	Timeouts       Timeouts    `json:"timeouts"`
}

// Concurrency bounds the work a channel can have in flight.
//
// MaxConcurrentExecutions is a hard limit that runtimes enforce, not an estimate: at most this many
// executions of the channel run at once. MaxQueuedExecutions bounds the work admitted while all
// execution slots are busy; zero means no queue. Work beyond both limits is handled by the binding's
// Overflow action, so admission is always bounded.
type Concurrency struct {
	MaxConcurrentExecutions int `json:"maxConcurrentExecutions"`
	MaxQueuedExecutions     int `json:"maxQueuedExecutions"`
}

// Timeouts bound the duration of executions. Zero means no channel-specific limit.
type Timeouts struct {
	MaxInvocationMs int64 `json:"maxInvocationMs,omitempty"`
}

// DeploymentPolicy contains the resource contract used to place the channel on a worker.
type DeploymentPolicy struct {
	Resources Resources `json:"resources"`
}

// AllocationModeStatic is the only allocation mode: resources are fixed by the user's configuration.
const AllocationModeStatic = "static"

// Resources is the static memory contract of a channel. It is the same for shared and dedicated
// runtimes:
//
//   - In a dedicated runtime, MemoryMiB can be used as the container memory limit.
//   - In a shared runtime (one JVM running many channels), MemoryReservationMiB is a scheduling
//     reservation against the worker's capacity (see the capacity package). It is not an independently
//     enforced per-channel memory ceiling, and channels sharing a worker are not memory-isolated from
//     each other. Only the worker's container limit is enforced.
//
// MemoryReservationMiB always equals MemoryMiB: the full budget is reserved, with no discount for
// overlapping plugins or low observed usage.
type Resources struct {
	AllocationMode       string `json:"allocationMode"`
	MemoryMiB            int    `json:"memoryMiB"`
	MemoryReservationMiB int    `json:"memoryReservationMiB"`
}
