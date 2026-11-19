package steps

import (
	"embed"
	"io/fs"
	"sync"
)

// embeddedLibrary is the step library at build time: the manifest and every published definition.
//
//go:embed generated/manifest.json plugins/*/v*/step.json
var embeddedLibrary embed.FS

// EmbeddedLibraryFS returns the step library compiled into the binary, in the layout LoadLibrary reads.
func EmbeddedLibraryFS() fs.FS { return embeddedLibrary }

var loadEmbedded = sync.OnceValues(func() (*Registry, error) {
	registry, _, err := LoadLibrary(embeddedLibrary)
	return registry, err
})

// EmbeddedLibrary returns a registry of the step library compiled into the binary. Services that
// validate saved channels (the API and the controller) use it, so a step is accepted by the backend once
// its definition is published and the services are rebuilt.
func EmbeddedLibrary() (*Registry, error) { return loadEmbedded() }
