// Package plan defines the artifacts that the controller compiles from a channel configuration: the
// execution plan consumed by runtimes, and the routing artifact consumed by source services.
//
// Both artifacts are versioned by the SHA-256 digest of their canonical JSON encoding (see Encode), so
// any change to the graph, bindings, dependencies, or policies (including resource and concurrency
// values) produces a new version, and an unchanged channel always compiles to the same version.
// Artifacts therefore contain no timestamps or other per-compilation values.
package plan

// APIVersion identifies the artifact schema. Breaking changes to the schema need a new version.
const APIVersion = "gruent.com/v1"

// Artifact kinds.
const (
	KindExecutionPlan = "ExecutionPlan"
	KindSourceRouting = "SourceRouting"
)

// ExecutionPlan captures a channel graph and everything a runtime needs to execute it: source
// bindings, resolved dependencies, and the runtime and deployment policies.
type ExecutionPlan struct {
	APIVersion   string       `json:"apiVersion"`
	Kind         string       `json:"kind"`
	OrgID        string       `json:"orgId"`
	SpaceID      string       `json:"spaceId"`
	ChannelID    string       `json:"channelId"`
	Channel      Channel      `json:"channel"`
	Bindings     Bindings     `json:"bindings"`
	Dependencies Dependencies `json:"dependencies"`
	Policies     Policies     `json:"policies"`
}

// RoutingArtifact captures the source bindings of a channel and the input models each source expects,
// for the source services that accept work and hand it to a runtime. PlanVersion is the version of the
// execution plan the bindings route to.
type RoutingArtifact struct {
	APIVersion  string           `json:"apiVersion"`
	Kind        string           `json:"kind"`
	OrgID       string           `json:"orgId"`
	SpaceID     string           `json:"spaceId"`
	ChannelID   string           `json:"channelId"`
	PlanVersion string           `json:"planVersion"`
	Bindings    Bindings         `json:"bindings"`
	InputModels []ModelReference `json:"inputModels"`
	Concurrency Concurrency      `json:"concurrency"`
}

// Channel is the channel's name and graph. Layout-only data, such as editor coordinates, is excluded
// so that it does not change the plan version.
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
	// Type is "<category>.<label>", e.g. "source.http" or "processing.filter".
	Type    string `json:"type"`
	Version string `json:"version"`
	Name    string `json:"name"`
	// Config is the step configuration as canonical JSON.
	Config     RawJSON  `json:"config"`
	BindingRef string   `json:"bindingRef,omitempty"`
	ModelRefs  []string `json:"modelRefs"`
	// ConnectionRefs are the IDs of the connections the step uses.
	ConnectionRefs []string `json:"connectionRefs"`
}

// Edge connects the output of one step to the input of another.
type Edge struct {
	From     string `json:"from"`
	FromPort string `json:"fromPort"`
	To       string `json:"to"`
	ToPort   string `json:"toPort"`
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

// Dependencies are the models and connections the channel uses, resolved at compile time.
type Dependencies struct {
	Models      []Model      `json:"models"`
	Connections []Connection `json:"connections"`
}

// Model is a data model, including its attributes so that runtimes can validate data against it.
type Model struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Revision   string  `json:"revision"`
	Attributes RawJSON `json:"attributes"`
}

// ModelReference identifies a model at a specific revision.
type ModelReference struct {
	ID       string `json:"id"`
	Revision string `json:"revision"`
}

// Connection identifies a connection at a specific revision. Connection attributes can contain
// credentials, so they are never copied into artifacts, nor is anything derived from them: Revision
// changes whenever the connection is updated, and runtimes resolve the connection itself when they
// apply the plan.
type Connection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
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
