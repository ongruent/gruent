// Package artifacts uploads compiled artifacts to file storage.
//
// Artifacts are content-addressed: the storage key contains the artifact's version (its digest), so an
// uploaded artifact never changes, and uploading the same artifact again is a no-op.
package artifacts

import (
	"context"
	"fmt"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// Kind is the kind of an artifact.
type Kind string

const (
	KindExecutionPlan Kind = "execution_plan"
	KindRouting       Kind = "routing"
)

// Reference locates an uploaded artifact.
type Reference struct {
	Kind      Kind
	Version   string
	Key       string
	SizeBytes int64
}

// Store is file storage for artifacts.
type Store interface {
	// Exists reports whether an object exists.
	Exists(ctx context.Context, key string) (bool, error)
	// Put writes an object.
	Put(ctx context.Context, key string, data []byte, contentType string) error
}

// Key returns the storage key of an artifact, e.g.
// "orgs/o1/spaces/s1/channels/c1/execution_plan/<sha256 hex>.json".
func Key(orgID, spaceID, channelID string, kind Kind, version string) string {
	digest := strings.TrimPrefix(version, plan.DigestPrefix)
	return fmt.Sprintf("orgs/%s/spaces/%s/channels/%s/%s/%s.json", orgID, spaceID, channelID, kind, digest)
}

// Upload writes an encoded artifact to the store unless it already exists.
func Upload(ctx context.Context, store Store, orgID, spaceID, channelID string, kind Kind, encoded plan.Encoded) (Reference, error) {
	reference := Reference{
		Kind:      kind,
		Version:   encoded.Version,
		Key:       Key(orgID, spaceID, channelID, kind, encoded.Version),
		SizeBytes: int64(len(encoded.Data)),
	}

	exists, err := store.Exists(ctx, reference.Key)
	if err != nil {
		return Reference{}, fmt.Errorf("check %s: %w", reference.Key, err)
	}
	if exists {
		return reference, nil
	}
	if err := store.Put(ctx, reference.Key, encoded.Data, "application/json"); err != nil {
		return Reference{}, fmt.Errorf("upload %s: %w", reference.Key, err)
	}
	return reference, nil
}
