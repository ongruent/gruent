package compiler

import "encoding/json"

// The channel configuration as the hub stores it in app.channels.config. It still uses the legacy
// names ("nodes", "dependencies.things", "thingId"), which the plan maps to steps and connections.

type channelConfig struct {
	Runtime runtimeConfig `json:"runtime"`
	Nodes   []nodeConfig  `json:"nodes"`
	Edges   []edgeConfig  `json:"edges"`
}

// runtimeConfig holds the user-configured static resource and concurrency settings. Pointers tell a
// missing value apart from zero, because required values have no default.
type runtimeConfig struct {
	MemoryMiB               *int   `json:"memoryMiB"`
	MaxConcurrentExecutions *int   `json:"maxConcurrentExecutions"`
	MaxQueuedExecutions     *int   `json:"maxQueuedExecutions"`
	MaxInvocationMs         *int64 `json:"maxInvocationMs"`
}

type nodeConfig struct {
	ID       string       `json:"id"`
	Metadata nodeMetadata `json:"metadata"`
}

type nodeMetadata struct {
	Version      string           `json:"version"`
	Name         string           `json:"name"`
	Label        string           `json:"label"`
	Type         string           `json:"type"`
	Config       json.RawMessage  `json:"config"`
	Dependencies nodeDependencies `json:"dependencies"`
}

type nodeDependencies struct {
	Models []struct {
		ModelID   string `json:"modelId"`
		FieldName string `json:"fieldName"`
	} `json:"models"`
	Things []struct {
		Internal  bool   `json:"internal"`
		ThingID   string `json:"thingId"`
		FieldName string `json:"fieldName"`
	} `json:"things"`
}

type edgeConfig struct {
	From edgeEnd `json:"from"`
	To   edgeEnd `json:"to"`
}

type edgeEnd struct {
	NodeID string `json:"nodeId"`
	IoID   string `json:"ioId"`
}

// unsetReference is the placeholder the hub stores for a dependency that has not been selected yet.
const unsetReference = "__IOTEA_IGNORE__"

type httpSourceConfig struct {
	Method          string `json:"method"`
	ResponseTimeout int64  `json:"responseTimeout"` // seconds
}

type timerSourceConfig struct {
	CronExpression string `json:"cronExpression"`
}
