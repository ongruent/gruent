package plan

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// DigestPrefix prefixes every artifact version.
const DigestPrefix = "sha256:"

// RawJSON is a JSON value stored in canonical form (see Canonicalize), so that equivalent values always
// encode to the same bytes.
type RawJSON json.RawMessage

// MarshalJSON returns the value, or null if it is empty.
func (r RawJSON) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

// UnmarshalJSON stores a copy of the value.
func (r *RawJSON) UnmarshalJSON(data []byte) error {
	*r = append((*r)[0:0], data...)
	return nil
}

// Canonicalize returns the canonical encoding of a JSON value: object keys are sorted, insignificant
// whitespace is removed, and numbers keep their original representation. An empty input is treated as
// null.
func Canonicalize(data []byte) (RawJSON, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return RawJSON("null"), nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if decoder.More() {
		return nil, fmt.Errorf("invalid JSON: unexpected data after the value")
	}
	canonical, err := marshal(value)
	if err != nil {
		return nil, err
	}
	return RawJSON(canonical), nil
}

// Digest returns the version of an encoded artifact: "sha256:" followed by the hex SHA-256 digest.
func Digest(encoded []byte) string {
	sum := sha256.Sum256(encoded)
	return DigestPrefix + hex.EncodeToString(sum[:])
}

// Encoded is an artifact's canonical JSON encoding and its version.
type Encoded struct {
	Data    []byte
	Version string
}

// Encode returns the canonical JSON encoding of an artifact and its version. Struct fields encode in
// declaration order and maps with sorted keys, so the encoding is deterministic as long as artifacts
// only hold canonical RawJSON values.
func Encode(artifact any) (Encoded, error) {
	data, err := marshal(artifact)
	if err != nil {
		return Encoded{}, err
	}
	return Encoded{Data: data, Version: Digest(data)}, nil
}

// marshal encodes a value without escaping HTML characters, so that expressions such as "a && b" stay
// readable in stored artifacts.
func marshal(value any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}
