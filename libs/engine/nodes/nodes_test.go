package nodes

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

type configFixture struct {
	Description string          `json:"description"`
	Config      json.RawMessage `json:"config"`
	Errors      []string        `json:"errors"`
}

type definitionFixture struct {
	Description string          `json:"description"`
	Definition  json.RawMessage `json:"definition"`
	Errors      []string        `json:"errors"`
}

func readJSON(t *testing.T, path string, v any) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
}

func glob(t *testing.T, pattern string) []string {
	t.Helper()
	files, err := filepath.Glob(pattern)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatalf("no files match %s", pattern)
	}
	return files
}

func paths(issues []Issue) []string {
	set := map[string]bool{}
	for _, i := range issues {
		set[i.Path] = true
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// TestPluginConfigFixtures runs the shared configuration fixtures of every plugin. The TypeScript and Kotlin
// test suites run the same files and must report the same error paths.
func TestPluginConfigFixtures(t *testing.T) {
	for _, defPath := range glob(t, "plugins/*/v*/node.json") {
		raw, err := os.ReadFile(defPath)
		if err != nil {
			t.Fatal(err)
		}
		def, err := ParseDefinition(raw)
		if err != nil {
			t.Fatalf("%s: %v", defPath, err)
		}
		dir := filepath.Dir(defPath)
		for _, f := range glob(t, filepath.Join(dir, "fixtures", "*", "*.json")) {
			t.Run(strings.TrimPrefix(f, "plugins/"), func(t *testing.T) {
				var fx configFixture
				readJSON(t, f, &fx)
				got := paths(def.ValidateConfig(fx.Config))
				want := fx.Errors
				if want == nil {
					want = []string{}
				}
				sort.Strings(want)
				if strings.Contains(f, "/valid/") && len(want) > 0 {
					t.Fatal("valid fixtures cannot declare errors")
				}
				if strings.Contains(f, "/invalid/") && len(want) == 0 {
					t.Fatal("invalid fixtures must declare errors")
				}
				if !reflect.DeepEqual(got, want) {
					t.Errorf("error paths = %v, want %v\n%v", got, want, def.ValidateConfig(fx.Config))
				}
			})
		}
	}
}

// TestDefinitionFixtures runs the shared contract fixtures. Invalid fixtures list paths that must be reported.
func TestDefinitionFixtures(t *testing.T) {
	for _, f := range glob(t, "contracts/v1/fixtures/*/*.json") {
		t.Run(strings.TrimPrefix(f, "contracts/v1/fixtures/"), func(t *testing.T) {
			var fx definitionFixture
			readJSON(t, f, &fx)
			_, err := ParseDefinition(fx.Definition)
			if strings.Contains(f, "/valid/") {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			var de *DefinitionError
			if !errors.As(err, &de) {
				t.Fatalf("expected DefinitionError, got %v", err)
			}
			got := map[string]bool{}
			for _, p := range paths(de.Issues) {
				got[p] = true
			}
			for _, p := range fx.Errors {
				if !got[p] {
					t.Errorf("missing issue at %s; got %v", p, de.Issues)
				}
			}
		})
	}
}

func helloWorld(t *testing.T) *Definition {
	t.Helper()
	raw, err := os.ReadFile("plugins/hello-world/v1/node.json")
	if err != nil {
		t.Fatal(err)
	}
	def, err := ParseDefinition(raw)
	if err != nil {
		t.Fatal(err)
	}
	return def
}

func TestHelloWorldDefinition(t *testing.T) {
	def := helloWorld(t)
	if def.Identity() != (Identity{PluginType: "hello-world", PluginVersion: 1}) {
		t.Fatalf("identity = %v", def.Identity())
	}
	var order []string
	for _, f := range def.Fields() {
		order = append(order, f.Name)
	}
	want := []string{"greeting", "signature", "language", "uppercase", "repeatCount", "confidenceThreshold",
		"secretId", "modelId", "thingIds", "scheduled", "startAt"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("field order = %v", order)
	}
	controls := map[string]bool{}
	for _, f := range def.Fields() {
		controls[f.UI.Control] = true
	}
	for _, c := range []string{"text", "textarea", "select", "multiselect", "number", "toggle", "datetime"} {
		if !controls[c] {
			t.Errorf("hello-world does not exercise control %q", c)
		}
	}
	if def.Category != CategoryProcessing {
		t.Errorf("category = %s", def.Category)
	}
}

func TestNewConfigAppliesDefaultsOnly(t *testing.T) {
	def := helloWorld(t)
	got := string(def.NewConfig())
	want := `{"greeting":"Hello, world!","language":"en","repeatCount":1,"scheduled":false,"uppercase":false}`
	if got != want {
		t.Fatalf("NewConfig = %s", got)
	}
	if issues := def.ValidateConfig(def.NewConfig()); issues != nil {
		t.Fatalf("defaults are invalid: %v", issues)
	}
}

func TestReferences(t *testing.T) {
	def := helloWorld(t)
	cfg := []byte(`{"greeting":"Hi","language":"en","repeatCount":1,"secretId":"sec_1",
		"modelId":"mdl_9","thingIds":["t1","t2"]}`)
	refs, err := def.References(cfg)
	if err != nil {
		t.Fatal(err)
	}
	want := []Reference{
		{Path: "/secretId", Collection: "secrets", ID: "sec_1"},
		{Path: "/modelId", Collection: "models", ID: "mdl_9", Params: map[string]any{"capability": "text", "secretId": "sec_1"}},
		{Path: "/thingIds/0", Collection: "things", ID: "t1"},
		{Path: "/thingIds/1", Collection: "things", ID: "t2"},
	}
	if !reflect.DeepEqual(refs, want) {
		t.Fatalf("refs = %+v", refs)
	}

	// Static values of mixed-source selects are not resource references.
	refs, _ = def.References([]byte(`{"greeting":"Hi","language":"en","repeatCount":1,"modelId":"builtin:default"}`))
	if len(refs) != 0 {
		t.Fatalf("static value treated as reference: %+v", refs)
	}
}

func TestIsDateTime(t *testing.T) {
	for s, ok := range map[string]bool{
		"2026-11-18T09:30:00Z":          true,
		"2024-02-29T23:59:59.999-08:00": true,
		"2026-11-18t09:30:00Z":          false,
		"2026-11-18T09:30:00z":          false,
		"2026-11-18T09:30Z":             false,
		"2023-02-29T00:00:00Z":          false,
		"2026-11-18T24:00:00Z":          false,
		"2026-12-31T23:59:60Z":          false,
		"2026-11-18T09:30:00+24:00":     false,
	} {
		if IsDateTime(s) != ok {
			t.Errorf("IsDateTime(%q) = %v", s, !ok)
		}
	}
}

func TestRegistryExactResolution(t *testing.T) {
	def := helloWorld(t)
	reg := NewRegistry()
	if err := reg.Add(def); err != nil {
		t.Fatal(err)
	}
	if err := reg.Add(def); err != nil {
		t.Fatalf("re-adding identical definition: %v", err)
	}
	if _, err := reg.Resolve(Identity{PluginType: "hello-world", PluginVersion: 2}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound without fallback, got %v", err)
	}

	changed := strings.Replace(string(def.Raw()), `"Hello world"`, `"Hello world!"`, 1)
	def2, err := ParseDefinition([]byte(changed))
	if err != nil {
		t.Fatal(err)
	}
	if err := reg.Add(def2); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected immutability conflict, got %v", err)
	}
}

func TestLoadLibraryMatchesManifest(t *testing.T) {
	reg, m, err := LoadLibrary(os.DirFS("."))
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Plugins) == 0 {
		t.Fatal("manifest lists no plugins")
	}
	e, err := reg.Resolve(Identity{PluginType: "hello-world", PluginVersion: 1})
	if err != nil {
		t.Fatal(err)
	}
	if e.Definition.Digest() != helloWorld(t).Digest() {
		t.Fatal("manifest digest differs from definition")
	}
}

func TestEnvelopeSchemaIsEmbedded(t *testing.T) {
	onDisk, err := os.ReadFile("contracts/v1/node-definition.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	if string(onDisk) != string(EnvelopeSchema()) {
		t.Fatal("embedded schema differs")
	}
}
