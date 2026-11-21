// Package routing is the contract between the controller and source services.
//
// The controller compiles each published channel into a signed routing artifact (Artifact) that lists the
// channel's source bindings: the HTTP routes, timer schedules and message queue subscriptions that start
// executions of the channel. It then writes a signed route table entry (Entry) for the channel at
// EntryKey(channelID), which points to the channel's current routing artifact. Unpublishing a channel
// deletes its entry. The set of entries under EntryPrefix is the routing table in file storage.
//
// Source services never read Postgres. They list the entries, verify them and the routing artifacts they
// point to (see package signing), and reconcile an in-memory Table (see Reconciler). When a trigger fires,
// a source service publishes an Invocation to the binding's NATS subject (InvocationSubject). HTTP sources
// use request/reply: the runtime answers with a Reply (see Ingress).
package routing

import "fmt"

// APIVersion identifies the artifact schema. Breaking changes to the schema need a new version.
//
// It is a stable wire identity, not a URL: it is embedded in signed, stored artifacts and checked by
// deployed runtimes, so it stays "gruent.com/v1" regardless of the marketing domain.
const APIVersion = "gruent.com/v1"

// Document kinds, stored in each document's "kind" field.
const (
	KindSourceRouting = "SourceRouting"
	KindRouteEntry    = "RouteEntry"
	KindInvocation    = "Invocation"
)

// Artifact kinds, used in artifact identities, storage keys and signatures.
const (
	ArtifactRouting    = "routing"
	ArtifactRouteEntry = "route_entry"
)

// EntryPrefix is the storage prefix of the routing table: one entry per published channel.
const EntryPrefix = "routing/v1/channels/"

// EntryKey returns the storage key of a channel's route table entry.
func EntryKey(channelID string) string {
	return EntryPrefix + channelID + ".json"
}

// HTTPPathPrefix is the public path prefix of HTTP source routes.
const HTTPPathPrefix = "/v1/trigger/http/"

// HTTPPath returns the public path of a channel's HTTP source. It keeps the shape of the legacy
// /v1/trigger/http/:channelId API, so existing clients keep working when the ingress replaces it.
func HTTPPath(channelID string) string {
	return HTTPPathPrefix + channelID
}

// InvocationSubject returns the NATS subject that source services publish a channel's invocations to.
// Channel IDs are alphanumeric, so they are valid subject tokens.
func InvocationSubject(channelID string) string {
	return fmt.Sprintf("gruent.v1.invocations.%s", channelID)
}

// ArtifactRef is the identity of an artifact: its kind and version. Key is the artifact's storage key,
// derived from the identity. Consumers are given short-lived presigned URLs, which are never stored in
// artifacts.
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

// Artifact captures the source bindings of a channel and the input models each source expects. PlanVersion
// is the version of the plan the bindings route to.
type Artifact struct {
	APIVersion  string           `json:"apiVersion"`
	Kind        string           `json:"kind"`
	Metadata    Metadata         `json:"metadata"`
	PlanVersion string           `json:"planVersion"`
	Bindings    Bindings         `json:"bindings"`
	InputModels []ModelReference `json:"inputModels"`
	Concurrency Concurrency      `json:"concurrency"`
}

// Entry is a channel's entry in the routing table. Unlike artifacts, entries are mutable: the controller
// overwrites an entry when it publishes a new version of the channel, and signs each content version.
type Entry struct {
	APIVersion string      `json:"apiVersion"`
	Kind       string      `json:"kind"`
	Metadata   Metadata    `json:"metadata"`
	Routing    ArtifactRef `json:"routing"`
}

// ModelReference identifies a model at a specific revision.
type ModelReference struct {
	ID       string `json:"id"`
	Revision string `json:"revision"`
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

// Bindings are the source bindings of a channel, grouped by source type.
type Bindings struct {
	HTTP         []HTTPBinding         `json:"http"`
	Timer        []TimerBinding        `json:"timer"`
	MessageQueue []MessageQueueBinding `json:"messageQueue"`
}

// Triggers, stored in invocations.
const (
	TriggerHTTP         = "http"
	TriggerTimer        = "timer"
	TriggerMessageQueue = "message_queue"
)

// Overflow actions define what a source does with new work when the channel already has
// MaxConcurrentExecutions executions in flight and MaxQueuedExecutions executions queued.
const (
	// OverflowReject rejects the request immediately. HTTP sources respond with Overflow.HTTPStatus.
	OverflowReject = "reject"
	// OverflowSkip drops the triggering event, e.g. a timer tick, without executing the channel.
	OverflowSkip = "skip"
	// OverflowPause stops consuming new messages until capacity is available. Unconsumed messages stay in
	// the broker.
	OverflowPause = "pause"
)

// Overflow is the handling of excess work for a binding. Every binding must define it.
type Overflow struct {
	Action     string `json:"action"`
	HTTPStatus int    `json:"httpStatus,omitempty"`
}

// HTTP response modes.
const (
	// ResponseModeSync waits for the execution to finish and responds with its reply.
	ResponseModeSync = "sync"
	// ResponseModeAsync responds with 202 Accepted as soon as a runtime admits the execution.
	ResponseModeAsync = "async"
)

// HTTPBinding routes HTTP requests for Method and Path to the channel. TimeoutMs bounds how long the
// ingress waits for the reply: the execution's reply in sync mode, or the admission reply in async mode.
type HTTPBinding struct {
	BindingID      string   `json:"bindingId"`
	StepID         string   `json:"stepId"`
	Method         string   `json:"method"`
	Path           string   `json:"path"`
	ResponseMode   string   `json:"responseMode"`
	TimeoutMs      int64    `json:"timeoutMs"`
	Subject        string   `json:"subject"`
	InputModelRefs []string `json:"inputModelRefs"`
	Overflow       Overflow `json:"overflow"`
}

// TimerBinding triggers the channel on a cron schedule. Schedules with five fields start at minute
// precision; six fields add a leading seconds field. Schedules are evaluated in UTC.
type TimerBinding struct {
	BindingID      string   `json:"bindingId"`
	StepID         string   `json:"stepId"`
	CronExpression string   `json:"cronExpression"`
	Subject        string   `json:"subject"`
	InputModelRefs []string `json:"inputModelRefs"`
	Overflow       Overflow `json:"overflow"`
}

// Message queue brokers, named after the connection category that a binding consumes with.
const (
	BrokerNATS  = "NATS_CLIENT"
	BrokerKafka = "KAFKA_CONSUMER"
)

// MessageQueueBinding triggers the channel for every message on Topic (a NATS subject or a Kafka topic),
// consumed with the connection ConnectionRef from the plan's dependency bundle.
type MessageQueueBinding struct {
	BindingID      string   `json:"bindingId"`
	StepID         string   `json:"stepId"`
	Broker         string   `json:"broker"`
	ConnectionRef  string   `json:"connectionRef"`
	Topic          string   `json:"topic"`
	Subject        string   `json:"subject"`
	InputModelRefs []string `json:"inputModelRefs"`
	Overflow       Overflow `json:"overflow"`
}
