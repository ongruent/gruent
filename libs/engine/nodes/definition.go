// Package nodes implements the Go consumer of the Gruent node contract (contract v1).
//
// Go never uses per-plugin types. Definitions are ingested as their original JSON documents, validated
// against the embedded envelope schema plus the contract's cross-field rules, and plugin configuration is
// validated as generic JSON with a standard JSON Schema validator compiled from the definition itself.
package nodes

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// ContractVersion is the node definition contract version implemented by this package.
const ContractVersion = 1

// EnvelopeSchemaURL identifies the embedded envelope schema. It is a URN so it can never be fetched.
const EnvelopeSchemaURL = "urn:gruent:node-definition:v1"

//go:embed contracts/v1/node-definition.schema.json
var envelopeSchemaJSON []byte

// EnvelopeSchema returns a copy of the machine-readable contract v1 envelope schema.
func EnvelopeSchema() []byte { return bytes.Clone(envelopeSchemaJSON) }

// Category classifies a plugin.
type Category string

const (
	CategorySource      Category = "source"
	CategoryProcessing  Category = "processing"
	CategoryAction      Category = "action"
	CategoryConditional Category = "conditional"
	CategoryCustom      Category = "custom"
)

// FieldType is the JSON Schema type of a configuration field.
type FieldType string

const (
	TypeString  FieldType = "string"
	TypeNumber  FieldType = "number"
	TypeInteger FieldType = "integer"
	TypeBoolean FieldType = "boolean"
	TypeArray   FieldType = "array"
)

// Identity is the exact plugin identity persisted by channels. There is no "latest".
type Identity struct {
	PluginType    string `json:"pluginType"`
	PluginVersion int    `json:"pluginVersion"`
}

func (i Identity) String() string { return fmt.Sprintf("%s@%d", i.PluginType, i.PluginVersion) }

// Option is a static select option.
type Option struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Disabled bool   `json:"disabled,omitempty"`
}

// NamedOptions identifies a parent-supplied option collection.
type NamedOptions struct {
	Name             string            `json:"name"`
	Params           map[string]any    `json:"params,omitempty"`
	ParamsFromFields map[string]string `json:"paramsFromFields,omitempty"`
}

// Options declares the option sources of a select or multiselect.
type Options struct {
	Static []Option      `json:"static,omitempty"`
	Named  *NamedOptions `json:"named,omitempty"`
}

// HasStatic reports whether value is one of the static option values.
func (o *Options) HasStatic(value string) bool {
	if o == nil {
		return false
	}
	for _, s := range o.Static {
		if s.Value == value {
			return true
		}
	}
	return false
}

// Condition is a declarative visibility condition. Exactly one of Equals or In is set.
type Condition struct {
	Field  string `json:"field"`
	Equals any    `json:"equals,omitempty"`
	In     []any  `json:"in,omitempty"`
}

// FieldUI holds the x-ui annotation of a field.
type FieldUI struct {
	Control     string     `json:"control"`
	Order       int        `json:"order"`
	Group       string     `json:"group,omitempty"`
	Placeholder string     `json:"placeholder,omitempty"`
	Step        *float64   `json:"step,omitempty"`
	VisibleWhen *Condition `json:"visibleWhen,omitempty"`
	Options     *Options   `json:"options,omitempty"`
}

// Items describes the primitive items of an array field.
type Items struct {
	Type             FieldType `json:"type"`
	MinLength        *int64    `json:"minLength,omitempty"`
	MaxLength        *int64    `json:"maxLength,omitempty"`
	Pattern          string    `json:"pattern,omitempty"`
	Enum             []string  `json:"enum,omitempty"`
	Minimum          *float64  `json:"minimum,omitempty"`
	Maximum          *float64  `json:"maximum,omitempty"`
	ExclusiveMinimum *float64  `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum *float64  `json:"exclusiveMaximum,omitempty"`
}

// Field is one top-level configuration property. Its identity is its location in the schema.
type Field struct {
	Name             string          `json:"-"`
	Pointer          string          `json:"-"`
	Required         bool            `json:"-"`
	Type             FieldType       `json:"type"`
	Title            string          `json:"title"`
	Description      string          `json:"description,omitempty"`
	MinLength        *int64          `json:"minLength,omitempty"`
	MaxLength        *int64          `json:"maxLength,omitempty"`
	Pattern          string          `json:"pattern,omitempty"`
	Format           string          `json:"format,omitempty"`
	Enum             []string        `json:"enum,omitempty"`
	Minimum          *float64        `json:"minimum,omitempty"`
	Maximum          *float64        `json:"maximum,omitempty"`
	ExclusiveMinimum *float64        `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum *float64        `json:"exclusiveMaximum,omitempty"`
	Items            *Items          `json:"items,omitempty"`
	MinItems         *int64          `json:"minItems,omitempty"`
	MaxItems         *int64          `json:"maxItems,omitempty"`
	UniqueItems      bool            `json:"uniqueItems,omitempty"`
	Default          json.RawMessage `json:"default,omitempty"`
	UI               FieldUI         `json:"x-ui"`
}

// Group is a schema-level layout section. Groups never add object-valued configuration.
type Group struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	VisibleWhen *Condition `json:"visibleWhen,omitempty"`
}

type rawConfigSchema struct {
	Required   []string                   `json:"required"`
	Properties map[string]json.RawMessage `json:"properties"`
	UI         struct {
		Groups []Group `json:"groups"`
	} `json:"x-ui"`
}

// Definition is a validated, immutable node definition.
type Definition struct {
	ContractVersion int             `json:"contractVersion"`
	PluginType      string          `json:"pluginType"`
	PluginVersion   int             `json:"pluginVersion"`
	DisplayName     string          `json:"displayName"`
	Description     string          `json:"description"`
	Category        Category        `json:"category"`
	ConfigSchema    json.RawMessage `json:"configSchema"`

	fields []Field
	groups []Group
	raw    []byte
	digest string
	schema *jsonschema.Schema
}

// Identity returns the exact plugin identity.
func (d *Definition) Identity() Identity {
	return Identity{PluginType: d.PluginType, PluginVersion: d.PluginVersion}
}

// Digest returns "sha256:<hex>" of the original definition bytes.
func (d *Definition) Digest() string { return d.digest }

// Raw returns a copy of the original definition bytes, for clients such as the editor.
func (d *Definition) Raw() []byte { return bytes.Clone(d.raw) }

// Fields returns the configuration fields ordered by x-ui.order.
func (d *Definition) Fields() []Field { return append([]Field(nil), d.fields...) }

// Field returns the field with the given name.
func (d *Definition) Field(name string) (Field, bool) {
	for _, f := range d.fields {
		if f.Name == name {
			return f, true
		}
	}
	return Field{}, false
}

// Groups returns the layout groups in declaration order.
func (d *Definition) Groups() []Group { return append([]Group(nil), d.groups...) }

// Digest computes the digest used for definitions.
func Digest(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Issue is a single validation problem. Path is a JSON Pointer into the validated document.
type Issue struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

func (i Issue) String() string {
	p := i.Path
	if p == "" {
		p = "(root)"
	}
	return p + ": " + i.Message
}

// DefinitionError reports why a definition was rejected.
type DefinitionError struct {
	Issues []Issue
}

func (e *DefinitionError) Error() string {
	parts := make([]string, len(e.Issues))
	for i, is := range e.Issues {
		parts[i] = is.String()
	}
	return "invalid node definition:\n  " + strings.Join(parts, "\n  ")
}

// ParseDefinition validates a definition document and returns the immutable Definition.
// Rejections are returned as *DefinitionError.
func ParseDefinition(raw []byte) (*Definition, error) {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return nil, &DefinitionError{Issues: []Issue{{Path: "", Message: "invalid JSON: " + err.Error()}}}
	}

	envelope, err := envelopeValidator()
	if err != nil {
		return nil, err
	}
	if err := envelope.Validate(doc); err != nil {
		return nil, &DefinitionError{Issues: flattenEnvelope(err)}
	}

	d := &Definition{raw: bytes.Clone(raw), digest: Digest(raw)}
	if err := json.Unmarshal(raw, d); err != nil {
		return nil, &DefinitionError{Issues: []Issue{{Message: err.Error()}}}
	}

	var cs rawConfigSchema
	if err := json.Unmarshal(d.ConfigSchema, &cs); err != nil {
		return nil, &DefinitionError{Issues: []Issue{{Path: "/configSchema", Message: err.Error()}}}
	}
	required := map[string]bool{}
	for _, r := range cs.Required {
		required[r] = true
	}
	for name, fraw := range cs.Properties {
		var f Field
		if err := json.Unmarshal(fraw, &f); err != nil {
			return nil, &DefinitionError{Issues: []Issue{{Path: propPath(name), Message: err.Error()}}}
		}
		f.Name = name
		f.Pointer = "/" + name
		f.Required = required[name]
		d.fields = append(d.fields, f)
	}
	sort.Slice(d.fields, func(i, j int) bool {
		if d.fields[i].UI.Order != d.fields[j].UI.Order {
			return d.fields[i].UI.Order < d.fields[j].UI.Order
		}
		return d.fields[i].Name < d.fields[j].Name
	})
	d.groups = cs.UI.Groups

	issues := checkSemantics(d, cs.Required)
	if len(issues) == 0 {
		d.schema, err = configValidator(d.digest, d.ConfigSchema)
		if err != nil {
			issues = append(issues, Issue{Path: "/configSchema", Message: err.Error()})
		}
	}
	if len(issues) == 0 {
		issues = checkDefaults(d)
	}
	if len(issues) > 0 {
		sortIssues(issues)
		return nil, &DefinitionError{Issues: issues}
	}
	return d, nil
}

func propPath(name string, rest ...string) string {
	p := "/configSchema/properties/" + escapePointer(name)
	for _, r := range rest {
		p += "/" + r
	}
	return p
}

func escapePointer(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}

func sortIssues(issues []Issue) {
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Path != issues[j].Path {
			return issues[i].Path < issues[j].Path
		}
		return issues[i].Message < issues[j].Message
	})
}

// NewConfig returns the initial configuration for a newly created node: every declared default and nothing
// else. This is the only place defaults are applied; validators and editors never inject them.
func (d *Definition) NewConfig() json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, f := range d.fields {
		if len(f.Default) > 0 {
			out[f.Name] = f.Default
		}
	}
	b, _ := json.Marshal(out)
	return b
}
