package plan

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/ongruent/gruent/libs/engine/nodes"
)

type fakeResolver struct{ denied map[string]bool }

func (f fakeResolver) Resolve(_ context.Context, _ *Channel, _ Node, ref nodes.Reference) error {
	if f.denied[ref.ID] {
		return errors.New("not found or not permitted")
	}
	return nil
}

type fixedPolicy struct{}

func (fixedPolicy) Resources(_ context.Context, ch *Channel) (Resources, error) {
	return Resources{"tier": ch.Runtime.Size}, nil
}

func (fixedPolicy) ProcessingMode(context.Context, Node, *nodes.Definition) (string, error) {
	return "test-mode", nil
}

func registry(t *testing.T) *nodes.Registry {
	t.Helper()
	reg, _, err := nodes.LoadLibrary(os.DirFS(".."))
	if err != nil {
		t.Fatal(err)
	}
	// The custom package is loaded dynamically, with no generated types anywhere.
	def, art, err := nodes.LoadPackage("../testdata/packages/echo")
	if err != nil {
		t.Fatal(err)
	}
	if err := reg.Add(def, art); err != nil {
		t.Fatal(err)
	}
	// Source plugin defined inline to exercise a full DAG.
	src, err := nodes.ParseDefinition([]byte(`{"contractVersion":1,"pluginType":"test-source","pluginVersion":1,
		"displayName":"Source","description":"Test source.","category":"source",
		"io":{"inputs":[],"outputs":["processing","custom"]},
		"configSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object",
		"additionalProperties":false,"properties":{}}}`))
	if err != nil {
		t.Fatal(err)
	}
	wasm := []byte("\x00asm\x01\x00\x00\x00")
	srcArt, _ := nodes.NewArtifact("test-source.wasm", wasm)
	if err := reg.Add(src, srcArt); err != nil {
		t.Fatal(err)
	}
	hwDef, _ := reg.Resolve(nodes.Identity{PluginType: "hello-world", PluginVersion: 1})
	hwArt, _ := nodes.NewArtifact("hello-world.wasm", wasm)
	if err := reg.Add(hwDef.Definition, hwArt); err != nil {
		t.Fatal(err)
	}
	return reg
}

func channel() *Channel {
	return &Channel{
		ID: "ch_1", Name: "Test", Runtime: Runtime{Size: "small"},
		Nodes: []Node{
			{ID: "src", PluginType: "test-source", PluginVersion: 1},
			{ID: "hello", PluginType: "hello-world", PluginVersion: 1, Config: json.RawMessage(
				`{"greeting":"Hi","language":"en","repeatCount":1,"secretId":"sec_1","thingIds":["t1"]}`)},
			{ID: "echo", PluginType: "custom-echo", PluginVersion: 3, Config: json.RawMessage(`{"prefix":"> "}`)},
		},
		Edges: []Edge{{ID: "e1", From: "src", To: "hello"}, {ID: "e2", From: "hello", To: "echo"}},
	}
}

func TestHydrate(t *testing.T) {
	p, err := Hydrate(context.Background(), channel(), registry(t), fakeResolver{}, fixedPolicy{})
	if err != nil {
		t.Fatalf("%v %+v", err, err)
	}
	var ids []string
	for _, n := range p.Nodes {
		ids = append(ids, n.ID)
	}
	if strings.Join(ids, ",") != "src,hello,echo" {
		t.Fatalf("order = %v", ids)
	}
	hello := p.Nodes[1]
	if hello.PluginType != "hello-world" || hello.PluginVersion != 1 || !strings.HasPrefix(hello.DefinitionDigest, "sha256:") ||
		hello.ProcessingMode != "test-mode" || hello.Inputs[0] != "src" || hello.Outputs[0] != "echo" ||
		len(hello.References) != 2 || hello.Artifact.Digest == "" {
		t.Fatalf("unexpected plan node %+v", hello)
	}
	if p.Runtime.Resources["tier"] != "small" {
		t.Fatalf("resources = %v", p.Runtime.Resources)
	}
}

func validationError(t *testing.T, ch *Channel, resolver ResourceResolver) *ValidationError {
	t.Helper()
	err := Validate(context.Background(), ch, registry(t), resolver)
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	return ve
}

func TestValidateRejectsUnknownVersionWithoutFallback(t *testing.T) {
	ch := channel()
	ch.Nodes[1].PluginVersion = 2
	ve := validationError(t, ch, nil)
	if len(ve.NodeErrors["hello"]) != 1 || !strings.Contains(ve.NodeErrors["hello"][0].Message, "hello-world@2") {
		t.Fatalf("node errors = %v", ve.NodeErrors)
	}
}

func TestValidateConfigAndReferences(t *testing.T) {
	ch := channel()
	ch.Nodes[2].Config = json.RawMessage(`{"prefix":5}`)
	ve := validationError(t, ch, fakeResolver{denied: map[string]bool{"t1": true}})
	if ve.NodeErrors["echo"][0].Path != "/prefix" {
		t.Fatalf("echo errors = %v", ve.NodeErrors["echo"])
	}
	if got := ve.NodeErrors["hello"]; len(got) != 1 || got[0].Path != "/thingIds/0" {
		t.Fatalf("hello errors = %v", got)
	}
}

func TestValidateIOBothEnds(t *testing.T) {
	ch := channel()
	// hello-world (processing) cannot feed the source, and a source accepts no input.
	ch.Edges = append(ch.Edges, Edge{ID: "e3", From: "echo", To: "src"})
	ve := validationError(t, ch, nil)
	joined := strings.Join(ve.ChannelErrors, "\n")
	for _, want := range []string{
		"edge e3: echo (custom-echo@3) cannot output to source nodes",
		"edge e3: src (test-source@1) cannot accept input from custom nodes",
		"source node src cannot have inputs",
		"edges contain a cycle",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
}

func TestValidateDAGShape(t *testing.T) {
	ch := channel()
	ch.Runtime.Size = "huge"
	ch.Nodes = append(ch.Nodes, Node{ID: "lonely", PluginType: "custom-echo", PluginVersion: 3})
	ch.Edges = append(ch.Edges, Edge{ID: "e2", From: "src", To: "echo"})
	joined := strings.Join(validationError(t, ch, nil).ChannelErrors, "\n")
	for _, want := range []string{"runtime size", "node lonely has no edges", "node echo has more than one input", "duplicate edge id e2"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
}

func TestHydrateRequiresArtifact(t *testing.T) {
	reg := registry(t)
	def, _ := reg.Resolve(nodes.Identity{PluginType: "custom-echo", PluginVersion: 3})
	fresh := nodes.NewRegistry()
	for _, id := range reg.Identities() {
		e, _ := reg.Resolve(id)
		if id.PluginType == "custom-echo" {
			_ = fresh.Add(def.Definition, nil)
			continue
		}
		_ = fresh.Add(e.Definition, e.Artifact)
	}
	_, err := Hydrate(context.Background(), channel(), fresh, fakeResolver{}, fixedPolicy{})
	if !errors.Is(err, ErrMissingArtifact) {
		t.Fatalf("err = %v", err)
	}
}
