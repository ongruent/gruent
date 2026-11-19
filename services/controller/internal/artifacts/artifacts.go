// Package artifacts uploads compiled, signed artifacts to file storage.
//
// Artifacts are content-addressed: the storage key contains the artifact's version (its digest), so an
// uploaded artifact never changes, and uploading the same artifact again is a no-op. Each artifact has
// a detached signature at "<key>.sig" (see package signing).
package artifacts

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/signing"
)

// Reference locates an uploaded artifact.
type Reference struct {
	Kind         string
	Version      string
	Key          string
	SignatureKey string
	SigningKeyID string
	SizeBytes    int64
}

// Store is file storage for artifacts.
type Store interface {
	// Exists reports whether an object exists.
	Exists(ctx context.Context, key string) (bool, error)
	// Put writes an object.
	Put(ctx context.Context, key string, data []byte, contentType string) error
}

// Presigner creates expiring download URLs. Future deployment integration gives runtimes presigned URLs
// to download their artifacts; the URLs are delivery details and never part of an artifact's identity.
type Presigner interface {
	PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error)
}

// Key returns the storage key of an artifact, e.g.
// "orgs/o1/spaces/s1/channels/c1/plan/<sha256 hex>.json".
func Key(orgID, spaceID, channelID, kind, version string) string {
	extension := ".json"
	if kind == plan.ArtifactPayloadSchema {
		extension = ".fbs"
	}
	digest := strings.TrimPrefix(version, plan.DigestPrefix)
	return fmt.Sprintf("orgs/%s/spaces/%s/channels/%s/%s/%s%s", orgID, spaceID, channelID, kind, digest, extension)
}

// SignatureKey returns the storage key of an artifact's signature envelope.
func SignatureKey(key string) string {
	return key + ".sig"
}

// Ref returns the identity of an artifact.
func Ref(metadata plan.Metadata, kind string, encoded plan.Encoded) plan.ArtifactRef {
	return plan.ArtifactRef{
		Kind:    kind,
		Version: encoded.Version,
		Key:     Key(metadata.OrgID, metadata.SpaceID, metadata.ChannelID, kind, encoded.Version),
	}
}

// Upload signs an artifact and writes it and its signature to the store, unless they already exist. The
// artifact is written before its signature, so a signature never refers to a missing artifact.
func Upload(ctx context.Context, store Store, signer *signing.Signer, ref plan.ArtifactRef, data []byte) (Reference, error) {
	reference := Reference{
		Kind:         ref.Kind,
		Version:      ref.Version,
		Key:          ref.Key,
		SignatureKey: SignatureKey(ref.Key),
		SigningKeyID: signer.KeyID(),
		SizeBytes:    int64(len(data)),
	}
	if plan.Digest(data) != ref.Version {
		return Reference{}, fmt.Errorf("artifact %s does not match its version", ref.Key)
	}

	contentType := "application/json"
	if ref.Kind == plan.ArtifactPayloadSchema {
		contentType = "text/plain; charset=utf-8"
	}
	if err := putIfMissing(ctx, store, reference.Key, data, contentType); err != nil {
		return Reference{}, err
	}

	envelope, err := json.Marshal(signer.Sign(ref.Kind, ref.Version))
	if err != nil {
		return Reference{}, err
	}
	if err := putIfMissing(ctx, store, reference.SignatureKey, envelope, "application/json"); err != nil {
		return Reference{}, err
	}
	return reference, nil
}

func putIfMissing(ctx context.Context, store Store, key string, data []byte, contentType string) error {
	exists, err := store.Exists(ctx, key)
	if err != nil {
		return fmt.Errorf("check %s: %w", key, err)
	}
	if exists {
		return nil
	}
	if err := store.Put(ctx, key, data, contentType); err != nil {
		return fmt.Errorf("upload %s: %w", key, err)
	}
	return nil
}
