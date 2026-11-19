package routing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/ongruent/gruent/libs/engine/signing"
)

// ErrObjectNotFound is returned by a Reader when an object does not exist.
var ErrObjectNotFound = errors.New("object not found")

// Reader reads the routing table and routing artifacts from file storage.
type Reader interface {
	// List returns the keys of the objects under a prefix.
	List(ctx context.Context, prefix string) ([]string, error)
	// Get returns an object, or an error wrapping ErrObjectNotFound.
	Get(ctx context.Context, key string) ([]byte, error)
}

// Changes summarizes a reconciliation.
type Changes struct {
	// Applied lists the channels whose routes were added or replaced.
	Applied []string
	// Removed lists the channels that are no longer routed.
	Removed []string
	// Failed lists the channels whose entry or routing artifact could not be loaded or verified. Their
	// previous routes, if any, are kept until a later reconciliation succeeds.
	Failed map[string]error
}

// Reconciler converges a Table on the routing table in file storage.
type Reconciler struct {
	Reader  Reader
	Keyring signing.Keyring
	Table   *Table
}

// Reconcile lists the routing table, applies entries whose routing version changed, and removes channels
// whose entry was deleted. Only verified entries and artifacts are applied. A channel that fails
// verification keeps its previous routes (or stays unrouted), so a partially written or tampered entry
// never changes routing. The error is only set when the table could not be listed.
func (r *Reconciler) Reconcile(ctx context.Context) (Changes, error) {
	changes := Changes{Failed: map[string]error{}}
	keys, err := r.Reader.List(ctx, EntryPrefix)
	if err != nil {
		return changes, fmt.Errorf("list routing table: %w", err)
	}

	listed := map[string]bool{}
	for _, key := range keys {
		channelID, ok := channelIDFromKey(key)
		if !ok {
			continue // signatures and unrelated objects
		}
		listed[channelID] = true

		entry, err := r.entry(ctx, key, channelID)
		if err != nil {
			changes.Failed[channelID] = err
			continue
		}
		if r.Table.Version(channelID) == entry.Routing.Version {
			continue
		}
		artifact, err := r.artifact(ctx, entry)
		if err != nil {
			changes.Failed[channelID] = err
			continue
		}
		r.Table.apply(entry, artifact)
		changes.Applied = append(changes.Applied, channelID)
	}

	for _, channelID := range r.Table.ChannelIDs() {
		if !listed[channelID] {
			r.Table.remove(channelID)
			changes.Removed = append(changes.Removed, channelID)
		}
	}
	slices.Sort(changes.Applied)
	return changes, nil
}

func channelIDFromKey(key string) (string, bool) {
	name, ok := strings.CutPrefix(key, EntryPrefix)
	if !ok {
		return "", false
	}
	channelID, ok := strings.CutSuffix(name, ".json")
	if !ok || channelID == "" || strings.Contains(channelID, "/") {
		return "", false
	}
	return channelID, true
}

// entry loads and verifies a route table entry. An entry is mutable, so its expected version is the
// digest of the bytes read; the signature binds that digest to the entry kind.
func (r *Reconciler) entry(ctx context.Context, key, channelID string) (Entry, error) {
	data, err := r.verified(ctx, key, ArtifactRouteEntry, "")
	if err != nil {
		return Entry{}, err
	}
	var entry Entry
	if err := json.Unmarshal(data, &entry); err != nil {
		return Entry{}, fmt.Errorf("decode route entry: %w", err)
	}
	if entry.Kind != KindRouteEntry || entry.APIVersion != APIVersion {
		return Entry{}, fmt.Errorf("unsupported route entry %s %s", entry.APIVersion, entry.Kind)
	}
	if entry.Metadata.ChannelID != channelID {
		return Entry{}, fmt.Errorf("route entry at %s is for channel %s", key, entry.Metadata.ChannelID)
	}
	if entry.Routing.Kind != ArtifactRouting || entry.Routing.Version == "" || entry.Routing.Key == "" {
		return Entry{}, errors.New("route entry does not reference a routing artifact")
	}
	return entry, nil
}

// artifact loads a routing artifact, verifies it against the version the entry pins, and checks that it
// belongs to the entry's channel.
func (r *Reconciler) artifact(ctx context.Context, entry Entry) (Artifact, error) {
	data, err := r.verified(ctx, entry.Routing.Key, ArtifactRouting, entry.Routing.Version)
	if err != nil {
		return Artifact{}, err
	}
	var artifact Artifact
	if err := json.Unmarshal(data, &artifact); err != nil {
		return Artifact{}, fmt.Errorf("decode routing artifact: %w", err)
	}
	if artifact.Kind != KindSourceRouting || artifact.APIVersion != APIVersion {
		return Artifact{}, fmt.Errorf("unsupported routing artifact %s %s", artifact.APIVersion, artifact.Kind)
	}
	if artifact.Metadata.ChannelID != entry.Metadata.ChannelID || artifact.Metadata.SpaceID != entry.Metadata.SpaceID || artifact.Metadata.OrgID != entry.Metadata.OrgID {
		return Artifact{}, errors.New("routing artifact belongs to a different channel")
	}
	for _, binding := range artifact.Bindings.HTTP {
		if binding.Path != HTTPPath(artifact.Metadata.ChannelID) {
			return Artifact{}, fmt.Errorf("HTTP binding %s routes a path that does not belong to the channel", binding.BindingID)
		}
	}
	return artifact, nil
}

// verified reads an object and its detached signature and verifies them. An empty expected version
// accepts the digest of the object read.
func (r *Reconciler) verified(ctx context.Context, key, kind, expectedVersion string) ([]byte, error) {
	data, err := r.Reader.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", key, err)
	}
	rawEnvelope, err := r.Reader.Get(ctx, key+".sig")
	if err != nil {
		return nil, fmt.Errorf("read signature of %s: %w", key, err)
	}
	var envelope signing.Envelope
	if err := json.Unmarshal(rawEnvelope, &envelope); err != nil {
		return nil, fmt.Errorf("decode signature of %s: %w", key, err)
	}
	if expectedVersion == "" {
		expectedVersion = signing.Digest(data)
	}
	if err := r.Keyring.Verify(kind, expectedVersion, data, envelope); err != nil {
		return nil, fmt.Errorf("verify %s: %w", key, err)
	}
	return data, nil
}
