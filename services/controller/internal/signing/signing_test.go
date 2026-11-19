package signing

import (
	"strings"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

const seed = "gn4yyRDEl9VZSnQMZDkd8Uz3KjkDDKZ3v181dnFB7ok="

func TestSignAndVerify(t *testing.T) {
	signer, err := NewSigner("k1", seed)
	if err != nil {
		t.Fatal(err)
	}
	keyring, err := NewKeyring(map[string]string{"k1": signer.PublicKey()})
	if err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"kind":"Plan"}`)
	version := plan.Digest(data)
	envelope := signer.Sign(plan.ArtifactPlan, version)

	if err := keyring.Verify(plan.ArtifactPlan, version, data, envelope); err != nil {
		t.Fatal(err)
	}

	cases := map[string]func() error{
		"tampered artifact": func() error { return keyring.Verify(plan.ArtifactPlan, version, []byte(`{"kind":"Other"}`), envelope) },
		"other kind":        func() error { return keyring.Verify(plan.ArtifactRouting, version, data, envelope) },
		"unknown key": func() error {
			return Keyring{}.Verify(plan.ArtifactPlan, version, data, envelope)
		},
		"forged signature": func() error {
			forged := envelope
			forged.Signature = signer.Sign(plan.ArtifactRouting, version).Signature
			return keyring.Verify(plan.ArtifactPlan, version, data, forged)
		},
		"unsupported algorithm": func() error {
			other := envelope
			other.Algorithm = "rsa"
			return keyring.Verify(plan.ArtifactPlan, version, data, other)
		},
	}
	for name, verify := range cases {
		t.Run(name, func(t *testing.T) {
			if verify() == nil {
				t.Fatal("expected verification to fail")
			}
		})
	}
}

func TestNewSignerRejectsInvalidKeys(t *testing.T) {
	if _, err := NewSigner("", seed); err == nil {
		t.Fatal("expected a missing key ID to be rejected")
	}
	if _, err := NewSigner("k1", "c2hvcnQ="); err == nil || !strings.Contains(err.Error(), "32-byte") {
		t.Fatalf("expected a short seed to be rejected, got %v", err)
	}
}
