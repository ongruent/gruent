package steps

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
)

// kotlinKeywords are hard keywords that cannot be used as Kotlin property names. Rejecting them in the
// contract (rather than only in the Kotlin generator) keeps field names identical in every consumer.
var kotlinKeywords = map[string]bool{
	"as": true, "break": true, "class": true, "continue": true, "do": true, "else": true, "false": true,
	"for": true, "fun": true, "if": true, "in": true, "interface": true, "is": true, "null": true,
	"object": true, "package": true, "return": true, "super": true, "this": true, "throw": true,
	"true": true, "try": true, "typealias": true, "typeof": true, "val": true, "var": true, "when": true,
	"while": true,
}

// stringControls maps each control to the field types it can render.
var controlTypes = map[string]FieldType{
	"text":        TypeString,
	"textarea":    TypeString,
	"select":      TypeString,
	"datetime":    TypeString,
	"number":      "", // number or integer
	"toggle":      TypeBoolean,
	"multiselect": TypeArray,
	"list":        TypeArray,
	"objectList":  TypeArray,
}

// checkSemantics enforces the contract rules that the envelope schema cannot express. The TypeScript
// consumer implements the same rules (ts/src/definition.ts); both are exercised by contracts/v1/fixtures.
func checkSemantics(d *Definition, required []string) []Issue {
	var issues []Issue
	add := func(path, format string, args ...any) {
		issues = append(issues, Issue{Path: path, Message: fmt.Sprintf(format, args...)})
	}

	byName := map[string]*Field{}
	for i := range d.fields {
		byName[d.fields[i].Name] = &d.fields[i]
	}
	for i, r := range required {
		if byName[r] == nil {
			add(fmt.Sprintf("/configSchema/required/%d", i), "required field %q is not declared in properties", r)
		}
	}

	groups := map[string]*Group{}
	for i := range d.groups {
		g := &d.groups[i]
		if groups[g.ID] != nil {
			add(fmt.Sprintf("/configSchema/x-ui/groups/%d/id", i), "duplicate group id %q", g.ID)
			continue
		}
		groups[g.ID] = g
	}
	for i, g := range d.groups {
		if g.VisibleWhen == nil {
			continue
		}
		path := fmt.Sprintf("/configSchema/x-ui/groups/%d/visibleWhen", i)
		if target := checkCondition(path, g.VisibleWhen, byName, "", add); target != nil && target.UI.Group == g.ID {
			add(path+"/field", "group %q cannot depend on its own field %s", g.ID, target.Pointer)
		}
	}

	checkFields(fieldScope{fields: byName, top: byName, groups: groups, path: propPath}, add)
	return issues
}

// fieldScope is a set of sibling fields: the top-level configuration fields, or the fields of an array's
// object items.
type fieldScope struct {
	// fields are the siblings, which visibleWhen conditions and orders refer to.
	fields map[string]*Field
	// top are the top-level fields, which named option parameters are derived from.
	top map[string]*Field
	// groups are the layout groups; nil for item fields, which cannot be grouped.
	groups map[string]*Group
	// path returns the definition path of a sibling's schema, e.g. /configSchema/properties/rows/items/properties/x.
	path func(name string, rest ...string) string
}

func checkFields(scope fieldScope, add func(string, string, ...any)) {
	orders := map[int]string{}
	names := make([]string, 0, len(scope.fields))
	for name := range scope.fields {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		f := scope.fields[name]
		path := func(rest ...string) string { return scope.path(name, rest...) }
		ui := path("x-ui")

		if kotlinKeywords[name] {
			add(path(), "field name %q is a reserved word in generated Kotlin", name)
		}
		if other, ok := orders[f.UI.Order]; ok {
			add(ui+"/order", "order %d is already used by field %q", f.UI.Order, other)
		} else {
			orders[f.UI.Order] = name
		}
		if f.UI.Group != "" && scope.groups[f.UI.Group] == nil {
			add(ui+"/group", "group %q is not declared in configSchema.x-ui.groups", f.UI.Group)
		}
		if f.UI.VisibleWhen != nil {
			checkCondition(ui+"/visibleWhen", f.UI.VisibleWhen, scope.fields, name, add)
		}

		// Control and type agreement.
		want := controlTypes[f.UI.Control]
		if f.UI.Control == "number" {
			if f.Type != TypeNumber && f.Type != TypeInteger {
				add(ui+"/control", "control %q cannot render a %s field", f.UI.Control, f.Type)
			}
		} else if want != f.Type {
			add(ui+"/control", "control %q cannot render a %s field", f.UI.Control, f.Type)
		}
		if f.Type == TypeString {
			if (f.UI.Control == "datetime") != (f.Format == "date-time") {
				add(ui+"/control", `format "date-time" and control "datetime" must be used together`)
			}
			if len(f.Enum) > 0 && f.UI.Control != "select" {
				add(path("enum"), `enum is only supported on select fields with static options`)
			}
		}
		objectItems := f.Type == TypeArray && f.Items != nil && f.Items.Type == TypeObject
		if objectItems != (f.UI.Control == "objectList") {
			add(ui+"/control", "object items and control \"objectList\" must be used together")
		}

		// Options.
		if f.UI.Options != nil {
			enumPath, enum := path("enum"), f.Enum
			if f.Type == TypeArray {
				enumPath = path("items", "enum")
				if f.Items != nil {
					enum = f.Items.Enum
				}
				if f.Items == nil || f.Items.Type != TypeString {
					add(path("items", "type"), "multiselect values must be strings")
				}
			}
			checkOptions(ui+"/options", f, enumPath, enum, scope.top, add)
		} else if f.Type == TypeArray && f.Items != nil && len(f.Items.Enum) > 0 {
			add(path("items", "enum"), "enum on array items requires the multiselect control with static options")
		}

		// Constraint consistency.
		checkRange(path(), f.Minimum, f.Maximum, f.ExclusiveMinimum, f.ExclusiveMaximum, add)
		checkLengths(path("maxLength"), f.MinLength, f.MaxLength, "minLength", add)
		checkLengths(path("maxItems"), f.MinItems, f.MaxItems, "minItems", add)
		checkPattern(path("pattern"), f.Pattern, add)
		if f.Items != nil {
			it := f.Items
			checkRange(path("items"), it.Minimum, it.Maximum, it.ExclusiveMinimum, it.ExclusiveMaximum, add)
			checkLengths(path("items", "maxLength"), it.MinLength, it.MaxLength, "minLength", add)
			checkPattern(path("items", "pattern"), it.Pattern, add)
		}

		if f.UI.KeyField != "" {
			key := (*Field)(nil)
			if objectItems {
				for i := range f.Items.Fields {
					if f.Items.Fields[i].Name == f.UI.KeyField {
						key = &f.Items.Fields[i]
					}
				}
			}
			switch {
			case !objectItems:
				add(ui+"/keyField", "keyField is only supported on objectList fields")
			case key == nil:
				add(ui+"/keyField", "item field %q does not exist", f.UI.KeyField)
			case !key.Required || key.UI.Control != "select" || key.UI.Options == nil || key.UI.Options.Named == nil || len(key.UI.Options.Static) > 0 || key.UI.VisibleWhen != nil:
				add(ui+"/keyField", "the key field must be a required, always visible select with named options only")
			}
		}
		if objectItems {
			if f.UniqueItems {
				add(path("uniqueItems"), "object items cannot be unique")
			}
			items := map[string]*Field{}
			for i := range f.Items.Fields {
				items[f.Items.Fields[i].Name] = &f.Items.Fields[i]
			}
			for i, r := range f.Items.Required {
				if items[r] == nil {
					add(fmt.Sprintf("%s/%d", path("items", "required"), i), "required field %q is not declared in properties", r)
				}
			}
			parent := name
			checkFields(fieldScope{
				fields: items,
				top:    scope.top,
				path: func(item string, rest ...string) string {
					return propPath(parent, append([]string{"items", "properties", escapePointer(item)}, rest...)...)
				},
			}, add)
		}
	}
}

func checkCondition(path string, c *Condition, byName map[string]*Field, self string, add func(string, string, ...any)) *Field {
	name := strings.TrimPrefix(c.Field, "/")
	target := byName[name]
	if target == nil {
		add(path+"/field", "field %s does not exist", c.Field)
		return nil
	}
	if name == self {
		add(path+"/field", "a field cannot depend on itself")
		return nil
	}
	if target.Type == TypeArray {
		add(path+"/field", "conditions cannot reference array field %s", c.Field)
		return nil
	}
	values := c.In
	valuesPath := path + "/in"
	if values == nil {
		values = []any{c.Equals}
		valuesPath = path + "/equals"
	}
	for _, v := range values {
		if !scalarMatches(target, v) {
			add(valuesPath, "value %v cannot match %s field %s", v, target.Type, c.Field)
			break
		}
	}
	return target
}

func scalarMatches(f *Field, v any) bool {
	switch x := v.(type) {
	case string:
		return f.Type == TypeString
	case bool:
		return f.Type == TypeBoolean
	case float64:
		if f.Type == TypeInteger {
			return x == math.Trunc(x)
		}
		return f.Type == TypeNumber
	}
	return false
}

// checkOptions checks a select's options. top are the top-level fields, which named option parameters are
// derived from.
func checkOptions(path string, f *Field, enumPath string, enum []string, top map[string]*Field, add func(string, string, ...any)) {
	o := f.UI.Options
	seen := map[string]bool{}
	for i, s := range o.Static {
		if seen[s.Value] {
			add(fmt.Sprintf("%s/static/%d/value", path, i), "duplicate static option value %q", s.Value)
		}
		seen[s.Value] = true
	}

	if o.Named != nil {
		if len(enum) > 0 {
			add(enumPath, "selects with named options must not declare enum; dynamic values would be rejected")
		}
		keys := make([]string, 0, len(o.Named.ParamsFromFields))
		for k := range o.Named.ParamsFromFields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			ptr := o.Named.ParamsFromFields[k]
			p := path + "/named/paramsFromFields/" + k
			name := strings.TrimPrefix(ptr, "/")
			if top[name] == nil {
				add(p, "field %s does not exist", ptr)
			} else if top[name] == f {
				add(p, "a field cannot derive parameters from itself")
			}
			if _, dup := o.Named.Params[k]; dup {
				add(p, "parameter %q is declared in both params and paramsFromFields", k)
			}
		}
		return
	}

	// Static-only: an enum is optional but must agree exactly with the static values.
	if len(enum) > 0 {
		inEnum := map[string]bool{}
		for _, e := range enum {
			inEnum[e] = true
		}
		var missing, extra []string
		for _, s := range o.Static {
			if !inEnum[s.Value] {
				missing = append(missing, s.Value)
			}
		}
		for _, e := range enum {
			if !seen[e] {
				extra = append(extra, e)
			}
		}
		if len(missing) > 0 || len(extra) > 0 {
			add(enumPath, "enum must match the static option values (not in enum: %v, without a static option: %v)", missing, extra)
		}
	}
}

func checkRange(path string, min, max, exMin, exMax *float64, add func(string, string, ...any)) {
	if min != nil && exMin != nil {
		add(path+"/exclusiveMinimum", "declare either minimum or exclusiveMinimum, not both")
	}
	if max != nil && exMax != nil {
		add(path+"/exclusiveMaximum", "declare either maximum or exclusiveMaximum, not both")
	}
	lo, hi := min, max
	if lo == nil {
		lo = exMin
	}
	if hi == nil {
		hi = exMax
	}
	if lo != nil && hi != nil && *lo > *hi {
		add(path+"/maximum", "maximum %v is less than minimum %v", *hi, *lo)
	}
}

func checkLengths(path string, min, max *int64, minName string, add func(string, string, ...any)) {
	if min != nil && max != nil && *min > *max {
		add(path, "is less than %s", minName)
	}
}

func checkPattern(path, pattern string, add func(string, string, ...any)) {
	if pattern == "" {
		return
	}
	if msg := unportablePattern(pattern); msg != "" {
		add(path, "pattern is not portable across RE2, ECMAScript and Java: %s", msg)
		return
	}
	if _, err := regexp.Compile(pattern); err != nil {
		add(path, "pattern does not compile: %v", err)
	}
}

// unportablePattern rejects constructs whose support or meaning differs between Go (RE2), TypeScript
// (ECMAScript, u flag) and Kotlin (java.util.regex). Only plain "(?:" groups are allowed after "(?", and
// backreferences are rejected. The TypeScript consumer applies the same scan.
func unportablePattern(p string) string {
	for i := 0; i < len(p); i++ {
		switch p[i] {
		case '\\':
			if i+1 < len(p) && (p[i+1] >= '1' && p[i+1] <= '9' || p[i+1] == 'k') {
				return "backreferences are not supported"
			}
			i++
		case '(':
			if i+1 < len(p) && p[i+1] == '?' && (i+2 >= len(p) || p[i+2] != ':') {
				return "only (?: groups are supported (no lookaround, named groups or inline flags)"
			}
		}
	}
	return ""
}

// checkDefaults validates every declared default against its field schema.
func checkDefaults(d *Definition) []Issue {
	defaults := map[string]any{}
	for _, f := range d.fields {
		if len(f.Default) > 0 {
			defaults[f.Name] = decodeNumber(f.Default)
		}
	}
	var issues []Issue
	for _, is := range d.validateValue(defaults) {
		name := strings.SplitN(strings.TrimPrefix(is.Path, "/"), "/", 2)[0]
		if _, ok := defaults[name]; !ok {
			continue // missing required fields are expected here
		}
		issues = append(issues, Issue{Path: propPath(name, "default"), Message: "default " + is.Message})
	}

	// Item field defaults initialize new rows; check them as one row of the array.
	for _, f := range d.fields {
		if f.Items == nil || f.Items.Type != TypeObject {
			continue
		}
		item := map[string]any{}
		for _, field := range f.Items.Fields {
			if len(field.Default) > 0 {
				item[field.Name] = decodeNumber(field.Default)
			}
		}
		if len(item) == 0 {
			continue
		}
		prefix := f.Pointer + "/0/"
		for _, is := range d.validateValue(map[string]any{f.Name: []any{item}}) {
			rest, ok := strings.CutPrefix(is.Path, prefix)
			if !ok {
				continue
			}
			key := strings.SplitN(rest, "/", 2)[0]
			if _, ok := item[key]; !ok {
				continue
			}
			issues = append(issues, Issue{Path: propPath(f.Name, "items", "properties", escapePointer(key), "default"), Message: "default " + is.Message})
		}
	}
	return issues
}

func decodeNumber(raw json.RawMessage) any {
	var v any
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	_ = dec.Decode(&v)
	return v
}
