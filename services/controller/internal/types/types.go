// Package types resolves the payload types that flow through a channel graph.
//
// The source step's declared model is the initial type. Every other step's output type is derived from
// its input type through the step type's contract (see contract.go), so intermediate steps only need an
// explicit model when their output cannot be inferred, as with transforms. Graph-level inference and
// validation live here; FlatBuffer schema generation (package flatbuffers) only consumes the result.
package types

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// Kind is the kind of a payload type.
type Kind string

const (
	KindObject  Kind = "object"
	KindArray   Kind = "array"
	KindString  Kind = "string"
	KindNumber  Kind = "number"
	KindBoolean Kind = "boolean"
	// KindBytes is an opaque payload, e.g. an HTTP body without a declared model.
	KindBytes Kind = "bytes"
	// KindSignal is a trigger without data, e.g. a timer tick. It carries the trigger time.
	KindSignal Kind = "signal"
)

// Type is a payload type. Object fields are sorted by name, so equal shapes have equal encodings.
type Type struct {
	Kind   Kind    `json:"kind"`
	Fields []Field `json:"fields,omitempty"`
	Items  *Type   `json:"items,omitempty"`
	// ModelRef is the model this type was declared by, if any. It does not affect the shape.
	ModelRef string `json:"modelRef,omitempty"`
}

// Field is a field of an object type.
type Field struct {
	Name     string `json:"name"`
	Type     Type   `json:"type"`
	Required bool   `json:"required,omitempty"`
}

// Bytes and Signal are the types of opaque payloads and triggers.
var (
	Bytes  = Type{Kind: KindBytes}
	Signal = Type{Kind: KindSignal}
)

// Category returns the legacy step I/O data type ("json", "bytes", "signal") that a type belongs to.
// Stored step definitions declare which categories their inputs accept.
func (t Type) Category() string {
	switch t.Kind {
	case KindBytes:
		return "bytes"
	case KindSignal:
		return "signal"
	default:
		return "json"
	}
}

// Shape returns the type without model references, for comparing and naming shapes.
func (t Type) Shape() Type {
	shape := Type{Kind: t.Kind}
	for _, field := range t.Fields {
		shape.Fields = append(shape.Fields, Field{Name: field.Name, Type: field.Type.Shape(), Required: field.Required})
	}
	if t.Items != nil {
		items := t.Items.Shape()
		shape.Items = &items
	}
	return shape
}

// ID returns a stable identifier of the type's shape: "sha256:<hex>" of its JSON encoding, which is
// canonical because types only contain structs and sorted slices.
func (t Type) ID() string {
	encoded, err := json.Marshal(t.Shape())
	if err != nil {
		panic(fmt.Sprintf("encode type: %v", err)) // types only hold encodable values
	}
	sum := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// AssignableTo reports whether a value of type t satisfies want: kinds match, and every field that want
// requires is present in t with an assignable type. Extra fields are allowed.
func (t Type) AssignableTo(want Type) bool {
	if t.Kind != want.Kind {
		return false
	}
	switch t.Kind {
	case KindObject:
		for _, wanted := range want.Fields {
			index := slices.IndexFunc(t.Fields, func(f Field) bool { return f.Name == wanted.Name })
			if index < 0 {
				if wanted.Required {
					return false
				}
				continue
			}
			if !t.Fields[index].Type.AssignableTo(wanted.Type) {
				return false
			}
		}
	case KindArray:
		if t.Items != nil && want.Items != nil {
			return t.Items.AssignableTo(*want.Items)
		}
	}
	return true
}

// Variable is a value that a step can reference, e.g. in typed string templates.
type Variable struct {
	// Path is the reference, e.g. "input.device.temperatureC" or "input.readings[]".
	Path string `json:"path"`
	Kind Kind   `json:"kind"`
}

// maxVariableDepth bounds the variables listed for deeply nested types.
const maxVariableDepth = 8

// Variables lists the values of a step input that can be referenced, in path order.
func Variables(input Type) []Variable {
	variables := []Variable{{Path: "input", Kind: input.Kind}}
	var walk func(prefix string, t Type, depth int)
	walk = func(prefix string, t Type, depth int) {
		if depth >= maxVariableDepth {
			return
		}
		switch t.Kind {
		case KindObject:
			for _, field := range t.Fields {
				path := prefix + "." + field.Name
				variables = append(variables, Variable{Path: path, Kind: field.Type.Kind})
				walk(path, field.Type, depth+1)
			}
		case KindArray:
			if t.Items != nil {
				path := prefix + "[]"
				variables = append(variables, Variable{Path: path, Kind: t.Items.Kind})
				walk(path, *t.Items, depth+1)
			}
		}
	}
	walk("input", input, 0)
	return variables
}

// modelAttribute is an attribute of a stored model (app.models.attributes, keyed by attribute ID).
type modelAttribute struct {
	ID                    string                    `json:"id"`
	Key                   string                    `json:"key"`
	Type                  string                    `json:"type"`
	Subtype               string                    `json:"subtype"`
	ArrayObjectAttributes map[string]modelAttribute `json:"arrayObjectAttributes"`
	ParentID              string                    `json:"parentId"`
	Required              bool                      `json:"required"`
}

// FromModel converts stored model attributes into an object type.
func FromModel(modelID string, attributes []byte) (Type, error) {
	var stored map[string]modelAttribute
	if err := json.Unmarshal(attributes, &stored); err != nil {
		return Type{}, fmt.Errorf("model %s has invalid attributes: %w", modelID, err)
	}
	all := make([]modelAttribute, 0, len(stored))
	for id, attribute := range stored {
		if attribute.ID == "" {
			attribute.ID = id
		}
		all = append(all, attribute)
	}
	t, err := objectFromAttributes(all, "")
	if err != nil {
		return Type{}, fmt.Errorf("model %s: %w", modelID, err)
	}
	t.ModelRef = modelID
	return t, nil
}

func objectFromAttributes(all []modelAttribute, parentID string) (Type, error) {
	object := Type{Kind: KindObject, Fields: []Field{}}
	for _, attribute := range all {
		if attribute.ParentID != parentID {
			continue
		}
		fieldType, err := attributeType(all, attribute)
		if err != nil {
			return Type{}, err
		}
		object.Fields = append(object.Fields, Field{Name: attribute.Key, Type: fieldType, Required: attribute.Required})
	}
	slices.SortFunc(object.Fields, func(a, b Field) int { return strings.Compare(a.Name, b.Name) })
	return object, nil
}

func attributeType(all []modelAttribute, attribute modelAttribute) (Type, error) {
	switch attribute.Type {
	case "string":
		return Type{Kind: KindString}, nil
	case "number":
		return Type{Kind: KindNumber}, nil
	case "boolean":
		return Type{Kind: KindBoolean}, nil
	case "object":
		return objectFromAttributes(all, attribute.ID)
	case "array":
		var items Type
		switch attribute.Subtype {
		case "string", "number", "boolean":
			items = Type{Kind: Kind(attribute.Subtype)}
		case "object":
			children := make([]modelAttribute, 0, len(attribute.ArrayObjectAttributes))
			for id, child := range attribute.ArrayObjectAttributes {
				if child.ID == "" {
					child.ID = id
				}
				if child.ParentID == attribute.ID {
					child.ParentID = ""
				}
				children = append(children, child)
			}
			object, err := objectFromAttributes(children, "")
			if err != nil {
				return Type{}, err
			}
			items = object
		default:
			return Type{}, fmt.Errorf("attribute %s has unsupported array subtype %q", attribute.Key, attribute.Subtype)
		}
		return Type{Kind: KindArray, Items: &items}, nil
	default:
		return Type{}, fmt.Errorf("attribute %s has unsupported type %q", attribute.Key, attribute.Type)
	}
}
