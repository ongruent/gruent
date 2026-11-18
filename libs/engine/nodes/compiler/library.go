package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ongruent/gruent/libs/engine/nodes"
)

var versionDir = regexp.MustCompile(`^v([1-9][0-9]*)$`)

// diagnostics collects actionable errors tagged with their source file.
type diagnostics []string

func (d *diagnostics) add(source, format string, args ...any) {
	*d = append(*d, source+": "+fmt.Sprintf(format, args...))
}

func (d *diagnostics) addIssues(source string, err error) {
	var de *nodes.DefinitionError
	if errors.As(err, &de) {
		for _, i := range de.Issues {
			d.add(source, "%s", i)
		}
		return
	}
	d.add(source, "%v", err)
}

func (d diagnostics) err() error {
	if len(d) == 0 {
		return nil
	}
	return errors.New(strings.Join(d, "\n"))
}

type compiledPlugin struct {
	Source string // node.json path relative to the library root
	Def    *nodes.Definition
	Kotlin kotlinTarget
}

// isLibraryRoot reports whether dir looks like a node library root.
func isLibraryRoot(dir string) bool {
	st, err := os.Stat(filepath.Join(dir, "plugins"))
	return err == nil && st.IsDir()
}

// loadLibrary discovers plugins/<pluginType>/v<N>/node.json, validates each definition and its fixtures,
// and rejects mismatched directories, duplicate identities and Kotlin package collisions.
func loadLibrary(root string) ([]compiledPlugin, error) {
	var diags diagnostics
	var plugins []compiledPlugin

	typeDirs, err := os.ReadDir(filepath.Join(root, "plugins"))
	if err != nil {
		return nil, err
	}
	for _, td := range typeDirs {
		typePath := filepath.ToSlash(filepath.Join("plugins", td.Name()))
		if !td.IsDir() {
			diags.add(typePath, "unexpected file; expected plugins/<pluginType>/v<N>/node.json")
			continue
		}
		versions, err := os.ReadDir(filepath.Join(root, typePath))
		if err != nil {
			return nil, err
		}
		for _, vd := range versions {
			vPath := typePath + "/" + vd.Name()
			m := versionDir.FindStringSubmatch(vd.Name())
			if !vd.IsDir() || m == nil {
				diags.add(vPath, "unexpected entry; version directories are named v1, v2, ...")
				continue
			}
			source := vPath + "/" + nodes.DefinitionFile
			raw, err := os.ReadFile(filepath.Join(root, source))
			if err != nil {
				diags.add(source, "%v", err)
				continue
			}
			def, err := nodes.ParseDefinition(raw)
			if err != nil {
				diags.addIssues(source, err)
				continue
			}
			version, _ := strconv.Atoi(m[1])
			if def.PluginType != td.Name() {
				diags.add(source, "/pluginType: %q does not match its directory %q", def.PluginType, td.Name())
			}
			if def.PluginVersion != version {
				diags.add(source, "/pluginVersion: %d does not match its directory %q", def.PluginVersion, vd.Name())
			}
			p := compiledPlugin{Source: source, Def: def, Kotlin: kotlinTargetFor(def.Identity())}
			checkFixtures(root, vPath, def, &diags)
			plugins = append(plugins, p)
		}
	}
	checkCollisions(plugins, &diags)
	sortPlugins(plugins)
	return plugins, diags.err()
}

func checkCollisions(plugins []compiledPlugin, diags *diagnostics) {
	identities := map[nodes.Identity]string{}
	packages := map[string]string{}
	for _, p := range plugins {
		id := p.Def.Identity()
		if prev, ok := identities[id]; ok {
			diags.add(p.Source, "duplicate plugin identity %s (also declared by %s)", id, prev)
		}
		identities[id] = p.Source
		if prev, ok := packages[p.Kotlin.Package]; ok && prev != p.Source {
			diags.add(p.Source, "Kotlin package %s collides with %s; choose a distinct pluginType", p.Kotlin.Package, prev)
		}
		packages[p.Kotlin.Package] = p.Source
	}
}

func sortPlugins(plugins []compiledPlugin) {
	sort.Slice(plugins, func(i, j int) bool {
		a, b := plugins[i].Def, plugins[j].Def
		if a.PluginType != b.PluginType {
			return a.PluginType < b.PluginType
		}
		return a.PluginVersion < b.PluginVersion
	})
}

// checkFixtures runs fixtures/valid and fixtures/invalid through the Go validator so authors get feedback
// at compile time. The Go, TypeScript and Kotlin test suites run the same files.
func checkFixtures(root, vPath string, def *nodes.Definition, diags *diagnostics) {
	for _, kind := range []string{"valid", "invalid"} {
		dir := vPath + "/fixtures/" + kind
		entries, err := os.ReadDir(filepath.Join(root, dir))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			diags.add(dir, "%v", err)
			continue
		}
		for _, e := range entries {
			path := dir + "/" + e.Name()
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
				diags.add(path, "fixtures must be .json files")
				continue
			}
			raw, err := os.ReadFile(filepath.Join(root, path))
			if err != nil {
				diags.add(path, "%v", err)
				continue
			}
			var fx struct {
				Description string          `json:"description"`
				Config      json.RawMessage `json:"config"`
				Errors      []string        `json:"errors"`
			}
			dec := json.NewDecoder(bytes.NewReader(raw))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&fx); err != nil || fx.Config == nil {
				diags.add(path, `fixtures are {"description", "config", "errors"} objects (errors only for invalid fixtures): %v`, err)
				continue
			}
			got := issuePaths(def.ValidateConfig(fx.Config))
			want := append([]string(nil), fx.Errors...)
			sort.Strings(want)
			switch {
			case kind == "valid" && len(want) > 0:
				diags.add(path, "valid fixtures must not declare errors")
			case kind == "invalid" && len(want) == 0:
				diags.add(path, "invalid fixtures must declare the expected error paths")
			case strings.Join(got, ",") != strings.Join(want, ","):
				diags.add(path, "validation reported %v, fixture expects %v", got, want)
			}
		}
	}
}

func issuePaths(issues []nodes.Issue) []string {
	set := map[string]bool{}
	for _, i := range issues {
		set[i.Path] = true
	}
	out := []string{}
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// render produces every generated file keyed by its path relative to the library root.
func render(plugins []compiledPlugin) (map[string][]byte, error) {
	out := map[string][]byte{}
	manifest := nodes.Manifest{ManifestVersion: nodes.ManifestVersion, Plugins: []nodes.ManifestEntry{}}
	var diags diagnostics
	for _, p := range plugins {
		src, err := generateKotlin(p.Def, p.Source)
		if err != nil {
			diags.add(p.Source, "%v", err)
			continue
		}
		out[p.Kotlin.Path] = []byte(src)
		manifest.Plugins = append(manifest.Plugins, nodes.ManifestEntry{
			PluginType:      p.Def.PluginType,
			PluginVersion:   p.Def.PluginVersion,
			ContractVersion: p.Def.ContractVersion,
			Category:        p.Def.Category,
			Definition:      nodes.ManifestFile{Path: p.Source, Digest: p.Def.Digest()},
			Kotlin:          &nodes.ManifestKotlin{Package: p.Kotlin.Package, Class: p.Kotlin.Class, Path: p.Kotlin.Path},
		})
	}
	if err := diags.err(); err != nil {
		return nil, err
	}
	b, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	out[nodes.ManifestPath] = append(b, '\n')
	return out, nil
}

// existingGenerated lists files currently under generated/.
func existingGenerated(root string) (map[string]bool, error) {
	files := map[string]bool{}
	err := filepath.WalkDir(filepath.Join(root, "generated"), func(p string, d fs.DirEntry, err error) error {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if !d.IsDir() {
			rel, _ := filepath.Rel(root, p)
			files[filepath.ToSlash(rel)] = true
		}
		return nil
	})
	return files, err
}

// sync writes the generated files and removes stale ones, or with check=true only reports differences.
func syncGenerated(root string, files map[string][]byte, check bool) ([]string, error) {
	existing, err := existingGenerated(root)
	if err != nil {
		return nil, err
	}
	var drift []string
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, p := range paths {
		current, err := os.ReadFile(filepath.Join(root, p))
		if err == nil && bytes.Equal(current, files[p]) {
			continue
		}
		drift = append(drift, p)
		if !check {
			if err := os.MkdirAll(filepath.Dir(filepath.Join(root, p)), 0o755); err != nil {
				return nil, err
			}
			if err := os.WriteFile(filepath.Join(root, p), files[p], 0o644); err != nil {
				return nil, err
			}
		}
	}
	var stale []string
	for p := range existing {
		if _, ok := files[p]; !ok && p != "generated/README.md" {
			stale = append(stale, p)
		}
	}
	sort.Strings(stale)
	for _, p := range stale {
		drift = append(drift, p+" (stale)")
		if !check {
			if err := os.Remove(filepath.Join(root, p)); err != nil {
				return nil, err
			}
		}
	}
	if !check {
		removeEmptyDirs(filepath.Join(root, "generated"))
	}
	return drift, nil
}

func removeEmptyDirs(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			removeEmptyDirs(filepath.Join(dir, e.Name()))
		}
	}
	if entries, err = os.ReadDir(dir); err == nil && len(entries) == 0 {
		_ = os.Remove(dir)
	}
}
