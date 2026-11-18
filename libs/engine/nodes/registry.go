package nodes

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"sort"
	"sync"
)

// File names of a distributable plugin package.
const (
	DefinitionFile = "node.json"
	ArtifactFile   = "plugin.wasm"
)

var (
	// ErrNotFound is returned when an exact plugin identity is not registered. There is no fallback.
	ErrNotFound = errors.New("plugin version not available")
	// ErrConflict is returned when an identity is registered again with a different definition.
	ErrConflict = errors.New("plugin version already registered with a different definition")
)

// Artifact describes a plugin's WASM artifact.
type Artifact struct {
	Path   string `json:"path,omitempty"`
	Digest string `json:"digest"`
	Size   int64  `json:"size"`
}

// Entry is a resolved plugin version.
type Entry struct {
	Definition *Definition
	// Artifact is nil when the definition is known but no WASM artifact has been registered.
	Artifact *Artifact
}

// Registry resolves exact plugin identities to definitions. It is populated at runtime from packages,
// manifests or storage; nothing about a plugin is compiled into the consuming application.
type Registry struct {
	mu      sync.RWMutex
	entries map[Identity]Entry
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry { return &Registry{entries: map[Identity]Entry{}} }

// Add registers a definition and optional artifact. Published definitions are immutable: registering the
// same identity again is only allowed with the identical definition digest.
func (r *Registry) Add(def *Definition, artifact *Artifact) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	id := def.Identity()
	if prev, ok := r.entries[id]; ok {
		if prev.Definition.Digest() != def.Digest() {
			return fmt.Errorf("%s: %w (%s != %s)", id, ErrConflict, prev.Definition.Digest(), def.Digest())
		}
		if prev.Artifact != nil && artifact != nil && prev.Artifact.Digest != artifact.Digest {
			return fmt.Errorf("%s: %w: artifact digest changed", id, ErrConflict)
		}
		if artifact == nil {
			artifact = prev.Artifact
		}
	}
	r.entries[id] = Entry{Definition: def, Artifact: artifact}
	return nil
}

// Resolve returns the exact identity or an error wrapping ErrNotFound.
func (r *Registry) Resolve(id Identity) (Entry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.entries[id]
	if !ok {
		return Entry{}, fmt.Errorf("%s: %w", id, ErrNotFound)
	}
	return e, nil
}

// Identities lists registered identities in a stable order.
func (r *Registry) Identities() []Identity {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]Identity, 0, len(r.entries))
	for id := range r.entries {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		if ids[i].PluginType != ids[j].PluginType {
			return ids[i].PluginType < ids[j].PluginType
		}
		return ids[i].PluginVersion < ids[j].PluginVersion
	})
	return ids
}

var wasmHeader = []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}

// NewArtifact checks the WASM header and computes the artifact digest.
func NewArtifact(p string, wasm []byte) (*Artifact, error) {
	if !bytes.HasPrefix(wasm, wasmHeader) {
		return nil, fmt.Errorf("%s: not a WebAssembly binary (missing \\0asm version 1 header)", p)
	}
	return &Artifact{Path: p, Digest: Digest(wasm), Size: int64(len(wasm))}, nil
}

// LoadPackage reads a distributable plugin directory containing node.json and plugin.wasm. No generated
// source of any language is required.
func LoadPackage(dir string) (*Definition, *Artifact, error) {
	return LoadPackageFS(os.DirFS(dir), ".")
}

// LoadPackageFS is LoadPackage over an fs.FS.
func LoadPackageFS(fsys fs.FS, dir string) (*Definition, *Artifact, error) {
	defPath := path.Join(dir, DefinitionFile)
	raw, err := fs.ReadFile(fsys, defPath)
	if err != nil {
		return nil, nil, err
	}
	def, err := ParseDefinition(raw)
	if err != nil {
		return nil, nil, fmt.Errorf("%s: %w", defPath, err)
	}
	wasmPath := path.Join(dir, ArtifactFile)
	wasm, err := fs.ReadFile(fsys, wasmPath)
	if err != nil {
		return nil, nil, fmt.Errorf("plugin package %s: %w", dir, err)
	}
	art, err := NewArtifact(ArtifactFile, wasm)
	if err != nil {
		return nil, nil, err
	}
	return def, art, nil
}

// Manifest is the versioned index written by the node compiler (generated/manifest.json).
type Manifest struct {
	ManifestVersion int             `json:"manifestVersion"`
	Plugins         []ManifestEntry `json:"plugins"`
}

// ManifestEntry maps an exact identity to its original definition and artifact.
type ManifestEntry struct {
	PluginType      string          `json:"pluginType"`
	PluginVersion   int             `json:"pluginVersion"`
	ContractVersion int             `json:"contractVersion"`
	Category        Category        `json:"category"`
	Definition      ManifestFile    `json:"definition"`
	Artifact        *ManifestFile   `json:"artifact"`
	Kotlin          *ManifestKotlin `json:"kotlin,omitempty"`
}

// ManifestFile references a file relative to the library root together with its digest.
type ManifestFile struct {
	Path   string `json:"path"`
	Digest string `json:"digest"`
}

// ManifestKotlin records the generated Kotlin development asset of a plugin version.
type ManifestKotlin struct {
	Package string `json:"package"`
	Class   string `json:"class"`
	Path    string `json:"path"`
}

// ManifestVersion is the current manifest format version.
const ManifestVersion = 1

// ManifestPath is the manifest location relative to the library root.
const ManifestPath = "generated/manifest.json"

// LoadLibrary builds a registry from a node library's manifest, verifying every recorded digest.
func LoadLibrary(fsys fs.FS) (*Registry, *Manifest, error) {
	raw, err := fs.ReadFile(fsys, ManifestPath)
	if err != nil {
		return nil, nil, err
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, nil, fmt.Errorf("%s: %w", ManifestPath, err)
	}
	if m.ManifestVersion != ManifestVersion {
		return nil, nil, fmt.Errorf("%s: unsupported manifestVersion %d", ManifestPath, m.ManifestVersion)
	}
	reg := NewRegistry()
	for _, e := range m.Plugins {
		defRaw, err := fs.ReadFile(fsys, e.Definition.Path)
		if err != nil {
			return nil, nil, err
		}
		def, err := ParseDefinition(defRaw)
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %w", e.Definition.Path, err)
		}
		if def.Digest() != e.Definition.Digest {
			return nil, nil, fmt.Errorf("%s: digest %s does not match manifest %s", e.Definition.Path, def.Digest(), e.Definition.Digest)
		}
		if def.PluginType != e.PluginType || def.PluginVersion != e.PluginVersion {
			return nil, nil, fmt.Errorf("%s: identity %s does not match manifest %s@%d", e.Definition.Path, def.Identity(), e.PluginType, e.PluginVersion)
		}
		var art *Artifact
		if e.Artifact != nil {
			wasm, err := fs.ReadFile(fsys, e.Artifact.Path)
			if err != nil {
				return nil, nil, err
			}
			if art, err = NewArtifact(e.Artifact.Path, wasm); err != nil {
				return nil, nil, err
			}
			if art.Digest != e.Artifact.Digest {
				return nil, nil, fmt.Errorf("%s: digest %s does not match manifest %s", e.Artifact.Path, art.Digest, e.Artifact.Digest)
			}
		}
		if err := reg.Add(def, art); err != nil {
			return nil, nil, err
		}
	}
	return reg, &m, nil
}
