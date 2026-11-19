package flatbuffers

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ongruent/gruent/services/controller/internal/types"
)

func TestGenerate(t *testing.T) {
	number := types.Type{Kind: types.KindNumber}
	str := types.Type{Kind: types.KindString}
	nested := types.Type{Kind: types.KindArray, Items: &types.Type{Kind: types.KindArray, Items: &number}}
	reading := types.Type{Kind: types.KindObject, Fields: []types.Field{{Name: "value", Type: number, Required: true}}}
	object := types.Type{Kind: types.KindObject, Fields: []types.Field{
		{Name: "1st-reading", Type: number},
		{Name: "matrix", Type: nested},
		{Name: "readings", Type: types.Type{Kind: types.KindArray, Items: &reading}, Required: true},
		{Name: "table", Type: str},
	}}
	roots := []types.Type{object, types.Bytes, types.Signal, str, object}

	schema := Generate(roots)
	if again := Generate(roots); again.Source != schema.Source {
		t.Fatal("generation is not deterministic")
	}
	if schema.Roots[object.ID()] != TableName(object) || schema.Roots[types.Bytes.ID()] != BytesTable || schema.Roots[types.Signal.ID()] != SignalTable {
		t.Fatalf("unexpected roots: %v", schema.Roots)
	}
	for _, want := range []string{
		`f_1st_reading:double (gruent_name: "1st-reading");`,
		`f_table:string (gruent_name: "table");`,
		"value:double;", // scalars cannot be required
		"readings:[" + TableName(reading) + "] (required);",
		"table " + TableName(str) + " {\n  value:string;\n}",
	} {
		if !strings.Contains(schema.Source, want) {
			t.Fatalf("schema does not contain %q:\n%s", want, schema.Source)
		}
	}

	flatc, err := exec.LookPath("flatc")
	if err != nil {
		t.Log("flatc is not installed; skipping schema compilation")
		return
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "payloads.fbs")
	if err := os.WriteFile(path, []byte(schema.Source), 0o600); err != nil {
		t.Fatal(err)
	}
	if output, err := exec.Command(flatc, "--go", "-o", dir, path).CombinedOutput(); err != nil {
		t.Fatalf("flatc rejected the schema: %v\n%s\n%s", err, output, schema.Source)
	}
}
