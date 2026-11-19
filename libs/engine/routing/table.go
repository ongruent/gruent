package routing

import (
	"errors"
	"slices"
	"strings"
	"sync"
)

var (
	// ErrNoRoute means that no published channel serves the path.
	ErrNoRoute = errors.New("no route")
	// ErrMethodNotAllowed means that a channel serves the path, but not with the request's method.
	ErrMethodNotAllowed = errors.New("method not allowed")
)

// Route is a binding of a published channel, with the context needed to invoke the channel.
type Route[B any] struct {
	Metadata    Metadata
	PlanVersion string
	Concurrency Concurrency
	Binding     B
}

// HTTPRoute, TimerRoute and SubscriptionRoute are the routes of each source type.
type (
	HTTPRoute         = Route[HTTPBinding]
	TimerRoute        = Route[TimerBinding]
	SubscriptionRoute = Route[MessageQueueBinding]
)

// Table is a source service's in-memory routing table. It is safe for concurrent use: triggers read it
// while a Reconciler updates it.
type Table struct {
	mu       sync.RWMutex
	channels map[string]tableChannel
	// http maps a path to its routes by method.
	http map[string]map[string]HTTPRoute
}

type tableChannel struct {
	entry    Entry
	artifact Artifact
}

// NewTable returns an empty routing table.
func NewTable() *Table {
	return &Table{channels: map[string]tableChannel{}, http: map[string]map[string]HTTPRoute{}}
}

// Version returns the routing artifact version applied for a channel, or "" if the channel is not routed.
func (t *Table) Version(channelID string) string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.channels[channelID].entry.Routing.Version
}

// ChannelIDs returns the IDs of the routed channels, sorted.
func (t *Table) ChannelIDs() []string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	ids := make([]string, 0, len(t.channels))
	for id := range t.channels {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}

// apply replaces a channel's routes with the bindings of a verified routing artifact. Under the replace
// publish strategy, a channel only ever routes to one plan version.
func (t *Table) apply(entry Entry, artifact Artifact) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.removeLocked(artifact.Metadata.ChannelID)
	t.channels[artifact.Metadata.ChannelID] = tableChannel{entry: entry, artifact: artifact}
	for _, binding := range artifact.Bindings.HTTP {
		methods := t.http[binding.Path]
		if methods == nil {
			methods = map[string]HTTPRoute{}
			t.http[binding.Path] = methods
		}
		methods[binding.Method] = route(artifact, binding)
	}
}

// remove stops routing a channel.
func (t *Table) remove(channelID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.removeLocked(channelID)
}

func (t *Table) removeLocked(channelID string) {
	channel, ok := t.channels[channelID]
	if !ok {
		return
	}
	for _, binding := range channel.artifact.Bindings.HTTP {
		delete(t.http[binding.Path], binding.Method)
		if len(t.http[binding.Path]) == 0 {
			delete(t.http, binding.Path)
		}
	}
	delete(t.channels, channelID)
}

// MatchHTTP returns the route for an HTTP request. It returns ErrNoRoute if no channel serves the path,
// and ErrMethodNotAllowed, with the allowed methods, if the path is served with other methods only.
func (t *Table) MatchHTTP(method, path string) (HTTPRoute, []string, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	methods, ok := t.http[strings.TrimSuffix(path, "/")]
	if !ok {
		return HTTPRoute{}, nil, ErrNoRoute
	}
	if route, ok := methods[method]; ok {
		return route, nil, nil
	}
	allowed := make([]string, 0, len(methods))
	for m := range methods {
		allowed = append(allowed, m)
	}
	slices.Sort(allowed)
	return HTTPRoute{}, allowed, ErrMethodNotAllowed
}

// Timers returns every timer route, sorted by channel and binding.
func (t *Table) Timers() []TimerRoute {
	t.mu.RLock()
	defer t.mu.RUnlock()
	var routes []TimerRoute
	for _, channel := range t.sortedChannels() {
		for _, binding := range channel.artifact.Bindings.Timer {
			routes = append(routes, route(channel.artifact, binding))
		}
	}
	return routes
}

// Subscriptions returns every message queue route, sorted by channel and binding.
func (t *Table) Subscriptions() []SubscriptionRoute {
	t.mu.RLock()
	defer t.mu.RUnlock()
	var routes []SubscriptionRoute
	for _, channel := range t.sortedChannels() {
		for _, binding := range channel.artifact.Bindings.MessageQueue {
			routes = append(routes, route(channel.artifact, binding))
		}
	}
	return routes
}

func (t *Table) sortedChannels() []tableChannel {
	channels := make([]tableChannel, 0, len(t.channels))
	for _, channel := range t.channels {
		channels = append(channels, channel)
	}
	slices.SortFunc(channels, func(a, b tableChannel) int {
		return strings.Compare(a.artifact.Metadata.ChannelID, b.artifact.Metadata.ChannelID)
	})
	return channels
}

func route[B any](artifact Artifact, binding B) Route[B] {
	return Route[B]{
		Metadata:    artifact.Metadata,
		PlanVersion: artifact.PlanVersion,
		Concurrency: artifact.Concurrency,
		Binding:     binding,
	}
}
