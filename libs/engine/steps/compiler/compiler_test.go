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
	if err := run([]string{"create", "--root", root, "--name", "my-step", "--category", "action"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	// Existing step without an answer and without a terminal: actionable error, nothing written.
	err := run([]string{"create", "--root", root, "--name", "my-step"}, strings.NewReader(""), &out, &out)
	if err == nil || !strings.Contains(err.Error(), "new-version") {
		t.Fatalf("err = %v", err)
	}
	if err := run([]string{"create", "--root", root, "--name", "my-step", "--no"}, nil, &out, &out); err == nil {
		t.Fatal("expected abort")
	}
	// Redirect to new-version.
	if err := run([]string{"create", "--root", root, "--name", "my-step", "--yes"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"new-version", "--root", root, "--name", "my-step"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	v3, err := os.ReadFile(filepath.Join(root, "plugins/my-step/v3/step.json"))
	if err != nil || !strings.Contains(string(v3), `"pluginVersion": 3`) {
		t.Fatalf("v3 = %s %v", v3, err)
	}
	if _, err := os.Stat(filepath.Join(root, "plugins/my-step/v3/fixtures/invalid/unknown-property.json")); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"compile", root}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	manifest, _ := os.ReadFile(filepath.Join(root, "generated/manifest.json"))
	for _, v := range []string{`"pluginVersion": 1`, `"pluginVersion": 2`, `"pluginVersion": 3`, "mystep.v3"} {
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
	if err := run([]string{"create", "--root", root, "--name", "a-step"}, nil, &out, &out); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(root, "plugins/a-step/v1"), filepath.Join(root, "plugins/a-step/v2")); err != nil {
		t.Fatal(err)
	}
	err := run([]string{"compile", root}, nil, &out, &out)
	if err == nil || !strings.Contains(err.Error(), "plugins/a-step/v2/step.json: /pluginVersion: 1 does not match") {
		t.Fatalf("err = %v", err)
	}
}

func TestKotlinString(t *testing.T) {
	if got := kotlinString("a\"$b\\\n👋"); got != `"a\"\$b\\\n\ud83d\udc4b"` {
		t.Fatalf("got %s", got)
	}
}
