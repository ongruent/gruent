package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"text/template"

	"github.com/ongruent/gruent/libs/engine/nodes"
)

var slug = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

var nodeTemplate = template.Must(template.New("node").Funcs(template.FuncMap{
	"quote": strconv.Quote,
}).Parse(`{
  "contractVersion": 1,
  "pluginType": {{quote .Name}},
  "pluginVersion": 1,
  "displayName": {{quote .DisplayName}},
  "description": {{quote .Description}},
  "category": {{quote (printf "%s" .Category)}},
  "configSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  }
}
`))

const validFixture = `{
  "description": "An empty configuration is valid while the plugin declares no fields.",
  "config": {}
}
`

const invalidFixture = `{
  "description": "Unknown properties are rejected.",
  "config": { "unexpected": true },
  "errors": ["/unexpected"]
}
`

type createOptions struct {
	Name        string
	DisplayName string
	Description string
	Category    nodes.Category
	// Answer pre-answers the "create a new version instead?" prompt: "yes", "no" or "" to ask.
	Answer string
}

// latestVersion returns the highest v<N> directory of a plugin, or 0 when the plugin does not exist.
func latestVersion(root, name string) (int, error) {
	entries, err := os.ReadDir(filepath.Join(root, "plugins", name))
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	latest := 0
	for _, e := range entries {
		if m := versionDir.FindStringSubmatch(e.Name()); e.IsDir() && m != nil {
			if v, _ := strconv.Atoi(m[1]); v > latest {
				latest = v
			}
		}
	}
	return latest, nil
}

func create(root string, opts createOptions, in io.Reader, out io.Writer, interactive bool) error {
	if !slug.MatchString(opts.Name) || len(opts.Name) > 64 {
		return fmt.Errorf("invalid plugin name %q: use lowercase kebab-case such as my-plugin", opts.Name)
	}
	switch opts.Category {
	case nodes.CategorySource, nodes.CategoryProcessing, nodes.CategoryAction, nodes.CategoryConditional, nodes.CategoryCustom:
	default:
		return fmt.Errorf("invalid category %q: use source, processing, action, conditional or custom", opts.Category)
	}

	latest, err := latestVersion(root, opts.Name)
	if err != nil {
		return err
	}
	if _, statErr := os.Stat(filepath.Join(root, "plugins", opts.Name)); statErr == nil {
		if latest == 0 {
			return fmt.Errorf("plugins/%s exists but has no version directories; fix or remove it first", opts.Name)
		}
		question := fmt.Sprintf("Node %q already exists (latest v%d). Create v%d with new-version instead?", opts.Name, latest, latest+1)
		answer := opts.Answer
		if answer == "" {
			if !interactive {
				return fmt.Errorf("%s Re-run with --yes, or use `nx run nodes:new-version --name=%s`", question, opts.Name)
			}
			fmt.Fprintf(out, "%s [y/N] ", question)
			line, _ := bufio.NewReader(in).ReadString('\n')
			if a := strings.ToLower(strings.TrimSpace(line)); a == "y" || a == "yes" {
				answer = "yes"
			}
		}
		if answer != "yes" {
			return fmt.Errorf("aborted: node %q already exists", opts.Name)
		}
		return newVersion(root, opts.Name, out)
	}

	if opts.DisplayName == "" {
		words := strings.Split(opts.Name, "-")
		words[0] = strings.ToUpper(words[0][:1]) + words[0][1:]
		opts.DisplayName = strings.Join(words, " ")
	}
	if opts.Description == "" {
		opts.Description = "TODO: describe what " + opts.DisplayName + " does."
	}
	dir := filepath.Join(root, "plugins", opts.Name, "v1")
	var node strings.Builder
	if err := nodeTemplate.Execute(&node, opts); err != nil {
		return err
	}
	if _, err := nodes.ParseDefinition([]byte(node.String())); err != nil {
		return fmt.Errorf("scaffold produced an invalid definition: %w", err)
	}
	files := map[string]string{
		nodes.DefinitionFile:                     node.String(),
		"fixtures/valid/empty.json":              validFixture,
		"fixtures/invalid/unknown-property.json": invalidFixture,
	}
	for rel, content := range files {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			return err
		}
	}
	fmt.Fprintf(out, "Created plugins/%s/v1. Add fields to node.json, then run `nx run nodes:compile`.\n", opts.Name)
	return nil
}

var pluginVersionField = regexp.MustCompile(`("pluginVersion"\s*:\s*)([0-9]+)`)

// newVersion copies the latest version's authored assets into v<N+1> and bumps pluginVersion.
func newVersion(root, name string, out io.Writer) error {
	if !slug.MatchString(name) {
		return fmt.Errorf("invalid plugin name %q", name)
	}
	latest, err := latestVersion(root, name)
	if err != nil {
		return err
	}
	if latest == 0 {
		return fmt.Errorf("node %q does not exist; create it with `nx run nodes:create --name=%s`", name, name)
	}
	src := filepath.Join(root, "plugins", name, fmt.Sprintf("v%d", latest))
	dst := filepath.Join(root, "plugins", name, fmt.Sprintf("v%d", latest+1))
	if _, err := os.Stat(dst); err == nil {
		return fmt.Errorf("%s already exists", dst)
	}

	raw, err := os.ReadFile(filepath.Join(src, nodes.DefinitionFile))
	if err != nil {
		return err
	}
	matches := pluginVersionField.FindAllSubmatchIndex(raw, -1)
	if len(matches) != 1 || string(raw[matches[0][4]:matches[0][5]]) != strconv.Itoa(latest) {
		return fmt.Errorf("%s: expected exactly one \"pluginVersion\": %d", filepath.Join(src, nodes.DefinitionFile), latest)
	}
	bumped := append([]byte{}, raw[:matches[0][4]]...)
	bumped = append(bumped, strconv.Itoa(latest+1)...)
	bumped = append(bumped, raw[matches[0][5]:]...)
	if _, err := nodes.ParseDefinition(bumped); err != nil {
		return fmt.Errorf("v%d is not a valid definition; fix it before creating a new version: %w", latest, err)
	}

	var copied []string
	err = filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		switch {
		case d.IsDir():
			return os.MkdirAll(target, 0o755)
		case rel == nodes.DefinitionFile:
			copied = append(copied, rel)
			return os.WriteFile(target, bumped, 0o644)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		copied = append(copied, rel)
		return os.WriteFile(target, b, 0o644)
	})
	if err != nil {
		return err
	}
	sort.Strings(copied)
	fmt.Fprintf(out, "Created plugins/%s/v%d from v%d (%d files). Edit it, then run `nx run nodes:compile`.\n", name, latest+1, latest, len(copied))
	return nil
}
