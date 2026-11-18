package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratedFilesAreUpToDate(t *testing.T) {
	var out bytes.Buffer
	if err := run([]string{"compile", "--check", ".."}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
}

func TestCreateAndNewVersion(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "plugins"), 0o755); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := run([]string{"create", "--root", root, "--name", "my-node", "--category", "action"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	// Existing node without an answer and without a terminal: actionable error, nothing written.
	err := run([]string{"create", "--root", root, "--name", "my-node"}, strings.NewReader(""), &out, &out)
	if err == nil || !strings.Contains(err.Error(), "new-version") {
		t.Fatalf("err = %v", err)
	}
	if err := run([]string{"create", "--root", root, "--name", "my-node", "--no"}, nil, &out, &out); err == nil {
		t.Fatal("expected abort")
	}
	// Redirect to new-version.
	if err := os.WriteFile(filepath.Join(root, "plugins/my-node/v1/plugin.wasm"), []byte("\x00asm\x01\x00\x00\x00"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"create", "--root", root, "--name", "my-node", "--yes"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"new-version", "--root", root, "--name", "my-node"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	v3, err := os.ReadFile(filepath.Join(root, "plugins/my-node/v3/node.json"))
	if err != nil || !strings.Contains(string(v3), `"pluginVersion": 3`) {
		t.Fatalf("v3 = %s %v", v3, err)
	}
	if _, err := os.Stat(filepath.Join(root, "plugins/my-node/v2/plugin.wasm")); !os.IsNotExist(err) {
		t.Fatal("WASM artifacts are per version and must not be copied")
	}
	if _, err := os.Stat(filepath.Join(root, "plugins/my-node/v3/fixtures/invalid/unknown-property.json")); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"compile", root}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	manifest, _ := os.ReadFile(filepath.Join(root, "generated/manifest.json"))
	for _, v := range []string{`"pluginVersion": 1`, `"pluginVersion": 2`, `"pluginVersion": 3`, "mynode.v3"} {
		if !strings.Contains(string(manifest), v) {
			t.Errorf("manifest lacks %s:\n%s", v, manifest)
		}
	}
	if err := run([]string{"compile", "--check", root}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
}

func TestCompileRejectsMismatchedDirectory(t *testing.T) {
	root := t.TempDir()
	var out bytes.Buffer
	_ = os.MkdirAll(filepath.Join(root, "plugins"), 0o755)
	if err := run([]string{"create", "--root", root, "--name", "a-node"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(root, "plugins/a-node/v1"), filepath.Join(root, "plugins/a-node/v2")); err != nil {
		t.Fatal(err)
	}
	err := run([]string{"compile", root}, nil, &out, &out)
	if err == nil || !strings.Contains(err.Error(), "plugins/a-node/v2/node.json: /pluginVersion: 1 does not match") {
		t.Fatalf("err = %v", err)
	}
}

func TestKotlinString(t *testing.T) {
	if got := kotlinString("a\"$b\\\n👋"); got != `"a\"\$b\\\n\ud83d\udc4b"` {
		t.Fatalf("got %s", got)
	}
}
