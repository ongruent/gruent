// Command compiler validates step definitions and generates Kotlin configuration types and the versioned
// manifest. It also scaffolds new plugins and plugin versions.
//
//	compiler compile [--check] [--out DIR] [PATH ...]
//	compiler create --name NAME [--category CATEGORY] [--display-name TEXT] [--description TEXT] [--yes|--no]
//	compiler new-version --name NAME
//
// PATH is a step library root (default ".") or one or more step.json files. Kotlin is the only generated
// language: Go and TypeScript consume the original JSON definitions.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/ongruent/gruent/libs/engine/steps"
)

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

const usage = `usage:
  compiler compile [--check] [--out DIR] [PATH ...]
  compiler create --name NAME [--category CATEGORY] [--display-name TEXT] [--description TEXT] [--yes|--no]
  compiler new-version --name NAME`

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	cmd, args := args[0], args[1:]
	fset := flag.NewFlagSet(cmd, flag.ContinueOnError)
	fset.SetOutput(stderr)
	root := fset.String("root", ".", "step library root")

	switch cmd {
	case "compile":
		check := fset.Bool("check", false, "fail if generated files are out of date instead of writing them")
		outDir := fset.String("out", "", "output directory for Kotlin when compiling individual step.json files")
		if err := fset.Parse(args); err != nil {
			return err
		}
		paths := fset.Args()
		if len(paths) == 0 {
			paths = []string{*root}
		}
		if len(paths) == 1 && isLibraryRoot(paths[0]) {
			return compileLibrary(paths[0], *check, stdout)
		}
		return compileFiles(paths, *outDir, stdout)

	case "create":
		name := fset.String("name", "", "plugin type, lowercase kebab-case")
		category := fset.String("category", "processing", "source, processing, action, conditional or custom")
		display := fset.String("display-name", "", "display name (defaults to the name in sentence case)")
		desc := fset.String("description", "", "description")
		yes := fset.Bool("yes", false, "if the step exists, create a new version without asking")
		no := fset.Bool("no", false, "if the step exists, abort without asking")
		if err := fset.Parse(args); err != nil {
			return err
		}
		if *name == "" && fset.NArg() == 1 {
			*name = fset.Arg(0)
		}
		answer := ""
		if *yes {
			answer = "yes"
		} else if *no {
			answer = "no"
		}
		return create(*root, createOptions{
			Name: *name, DisplayName: *display, Description: *desc, Category: steps.Category(*category), Answer: answer,
		}, stdin, stdout, isTerminal(stdin))

	case "new-version":
		name := fset.String("name", "", "plugin type")
		if err := fset.Parse(args); err != nil {
			return err
		}
		if *name == "" && fset.NArg() == 1 {
			*name = fset.Arg(0)
		}
		return newVersion(*root, *name, stdout)
	}
	return fmt.Errorf("unknown command %q\n%s", cmd, usage)
}

func isTerminal(r io.Reader) bool {
	f, ok := r.(*os.File)
	if !ok {
		return false
	}
	st, err := f.Stat()
	return err == nil && st.Mode()&os.ModeCharDevice != 0
}

func compileLibrary(root string, check bool, out io.Writer) error {
	plugins, err := loadLibrary(root)
	if err != nil {
		return err
	}
	files, err := render(plugins)
	if err != nil {
		return err
	}
	drift, err := syncGenerated(root, files, check)
	if err != nil {
		return err
	}
	if check {
		if len(drift) > 0 {
			return fmt.Errorf("generated files are out of date; run `nx run steps:compile`:\n  %s", joinLines(drift))
		}
		fmt.Fprintf(out, "%d plugin version(s) valid; generated files are up to date.\n", len(plugins))
		return nil
	}
	fmt.Fprintf(out, "Compiled %d plugin version(s); %d generated file(s) changed.\n", len(plugins), len(drift))
	return nil
}

func compileFiles(paths []string, outDir string, out io.Writer) error {
	var diags diagnostics
	var plugins []compiledPlugin
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			diags.add(p, "%v", err)
			continue
		}
		def, err := steps.ParseDefinition(raw)
		if err != nil {
			diags.addIssues(p, err)
			continue
		}
		dir := filepath.Dir(p)
		checkFixtures(dir, ".", def, &diags)
		plugins = append(plugins, compiledPlugin{Source: filepath.ToSlash(p), Def: def, Kotlin: kotlinTargetFor(def.Identity())})
	}
	checkCollisions(plugins, &diags)
	if err := diags.err(); err != nil {
		return err
	}
	for _, p := range plugins {
		src, err := generateKotlin(p.Def, p.Source)
		if err != nil {
			return fmt.Errorf("%s: %w", p.Source, err)
		}
		if outDir == "" {
			fmt.Fprintf(out, "%s: valid (%s)\n", p.Source, p.Def.Identity())
			continue
		}
		target := filepath.Join(outDir, filepath.FromSlash(p.Kotlin.Path[len("generated/kotlin/"):]))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte(src), 0o644); err != nil {
			return err
		}
		fmt.Fprintf(out, "%s: wrote %s\n", p.Source, target)
	}
	return nil
}

func joinLines(lines []string) string {
	s := ""
	for i, l := range lines {
		if i > 0 {
			s += "\n  "
		}
		s += l
	}
	return s
}
