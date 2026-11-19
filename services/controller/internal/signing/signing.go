// Package signing signs artifacts and defines how consumers verify them.
//
// # Contract
//
// Every artifact is stored at a content-addressed key and has a detached signature stored next to it at
// "<artifact key>.sig". The signature is an Envelope (JSON). To verify an artifact, a consumer:
//
//  1. Downloads the artifact and its envelope, e.g. through presigned URLs. URLs only grant access; they
//     are never part of an artifact's identity.
//  2. Computes "sha256:" + hex(SHA-256(artifact bytes)) and checks that it equals the version it expected
//     (from the plan, or from the deployment state) and the envelope's artifactVersion.
//  3. Checks that the envelope's format, algorithm and artifactKind are the expected ones.
//  4. Looks up the envelope's keyId in its keyring of trusted public keys. Unknown keys are rejected.
//  5. Verifies the Ed25519 signature over Message(kind, version).
//
// Consumers must reject the artifact if any step fails, and must verify the plan before trusting the
// versions of the artifacts it references. Since the plan pins those versions, verifying the plan and
// then each referenced artifact's digest and signature verifies the whole set.
//
// Keys are rotated by adding the new public key to every keyring before the controller signs with it.
// Old keys stay trusted until no deployed artifact is signed with them.
package signing

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// Format identifies version 1 of the signature contract.
const Format = "gruent.artifact-signature/v1"

// Algorithm is the only supported signature algorithm.
const Algorithm = "ed25519"

// Envelope is a detached artifact signature.
type Envelope struct {
	Format          string `json:"format"`
	Algorithm       string `json:"algorithm"`
	KeyID           string `json:"keyId"`
	ArtifactKind    string `json:"artifactKind"`
	ArtifactVersion string `json:"artifactVersion"`
	// Signature is the base64 (standard encoding) Ed25519 signature of Message(ArtifactKind, ArtifactVersion).
	Signature string `json:"signature"`
}

// Message returns the signed message. It binds the artifact kind to its digest, so a signature for one
// kind of artifact cannot be presented for another.
func Message(kind, version string) []byte {
	return []byte(Format + "\n" + kind + "\n" + version + "\n")
}

// Signer signs artifacts with an Ed25519 key.
type Signer struct {
	keyID string
	key   ed25519.PrivateKey
}

// NewSigner returns a signer for a base64-encoded 32-byte Ed25519 seed.
func NewSigner(keyID, seedBase64 string) (*Signer, error) {
	if keyID == "" {
		return nil, errors.New("signing key ID is required")
	}
	seed, err := base64.StdEncoding.DecodeString(seedBase64)
	if err != nil {
		return nil, fmt.Errorf("decode signing key: %w", err)
	}
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("signing key must be a %d-byte Ed25519 seed, got %d bytes", ed25519.SeedSize, len(seed))
	}
	return &Signer{keyID: keyID, key: ed25519.NewKeyFromSeed(seed)}, nil
}

// KeyID returns the signer's key ID.
func (s *Signer) KeyID() string {
	return s.keyID
}

// PublicKey returns the base64-encoded public key that consumers add to their keyring.
func (s *Signer) PublicKey() string {
	return base64.StdEncoding.EncodeToString(s.key.Public().(ed25519.PublicKey))
}

// Sign signs an artifact version.
func (s *Signer) Sign(kind, version string) Envelope {
	return Envelope{
		Format:          Format,
		Algorithm:       Algorithm,
		KeyID:           s.keyID,
		ArtifactKind:    kind,
		ArtifactVersion: version,
		Signature:       base64.StdEncoding.EncodeToString(ed25519.Sign(s.key, Message(kind, version))),
	}
}

// Keyring holds the trusted public keys of a consumer, by key ID.
type Keyring map[string]ed25519.PublicKey

// NewKeyring parses base64-encoded public keys by key ID.
func NewKeyring(publicKeys map[string]string) (Keyring, error) {
	keyring := Keyring{}
	for keyID, encoded := range publicKeys {
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(key) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("invalid public key %s", keyID)
		}
		keyring[keyID] = ed25519.PublicKey(key)
	}
	return keyring, nil
}

// Verify verifies an artifact against the version the consumer expects, following the contract in the
// package documentation.
func (k Keyring) Verify(kind, expectedVersion string, data []byte, envelope Envelope) error {
	if version := plan.Digest(data); version != expectedVersion {
		return fmt.Errorf("artifact digest %s does not match the expected version %s", version, expectedVersion)
	}
	if envelope.Format != Format || envelope.Algorithm != Algorithm {
		return fmt.Errorf("unsupported signature format %q with algorithm %q", envelope.Format, envelope.Algorithm)
	}
	if envelope.ArtifactKind != kind || envelope.ArtifactVersion != expectedVersion {
		return errors.New("signature is for a different artifact")
	}
	key, ok := k[envelope.KeyID]
	if !ok {
		return fmt.Errorf("signature key %q is not trusted", envelope.KeyID)
	}
	signature, err := base64.StdEncoding.DecodeString(envelope.Signature)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	if !ed25519.Verify(key, Message(kind, expectedVersion), signature) {
		return errors.New("invalid signature")
	}
	return nil
}
