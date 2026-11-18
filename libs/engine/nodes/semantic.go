package nodes

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
}

// checkSemantics enforces the contract rules that the envelope schema cannot express. The TypeScript
// consumer implements the same rules (ts/src/definition.ts); both are exercised by contracts/v1/fixtures.
func checkSemantics(d *Definition, required []string) []Issue {
	var issues []Issue
	add := func(path, format string, args ...any) {
		issues = append(issues, Issue{Path: path, Message: fmt.Sprintf(format, args...)})
	}

	// I/O allowlists.
	if d.Category == CategorySource && len(d.IO.Inputs) > 0 {
		add("/io/inputs", "source plugins cannot accept inputs")
	}
	if d.Category != CategorySource && len(d.IO.Inputs) == 0 {
		add("/io/inputs", "%s plugins must accept at least one input category", d.Category)
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

	orders := map[int]string{}
	names := make([]string, 0, len(d.fields))
	for _, f := range d.fields {
		names = append(names, f.Name)
	}
	sort.Strings(names)
	for _, name := range names {
		f := byName[name]
		ui := propPath(name, "x-ui")

		if kotlinKeywords[name] {
			add(propPath(name), "field name %q is a reserved word in generated Kotlin", name)
		}
		if other, ok := orders[f.UI.Order]; ok {
			add(ui+"/order", "order %d is already used by field %q", f.UI.Order, other)
		} else {
			orders[f.UI.Order] = name
		}
		if f.UI.Group != "" && groups[f.UI.Group] == nil {
			add(ui+"/group", "group %q is not declared in configSchema.x-ui.groups", f.UI.Group)
		}
		if f.UI.VisibleWhen != nil {
			checkCondition(ui+"/visibleWhen", f.UI.VisibleWhen, byName, name, add)
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
				add(propPath(name, "enum"), `enum is only supported on select fields with static options`)
			}
		}

		// Options.
		if f.UI.Options != nil {
			enumPath, enum := propPath(name, "enum"), f.Enum
			if f.Type == TypeArray {
				enumPath = propPath(name, "items", "enum")
				if f.Items != nil {
					enum = f.Items.Enum
				}
				if f.Items == nil || f.Items.Type != TypeString {
					add(propPath(name, "items", "type"), "multiselect values must be strings")
				}
			}
			checkOptions(ui+"/options", f, enumPath, enum, byName, add)
		} else if f.Type == TypeArray && f.Items != nil && len(f.Items.Enum) > 0 {
			add(propPath(name, "items", "enum"), "enum on array items requires the multiselect control with static options")
		}

		// Constraint consistency.
		checkRange(propPath(name), f.Minimum, f.Maximum, f.ExclusiveMinimum, f.ExclusiveMaximum, add)
		checkLengths(propPath(name, "maxLength"), f.MinLength, f.MaxLength, "minLength", add)
		checkLengths(propPath(name, "maxItems"), f.MinItems, f.MaxItems, "minItems", add)
		checkPattern(propPath(name, "pattern"), f.Pattern, add)
		if f.Items != nil {
			it := f.Items
			checkRange(propPath(name, "items"), it.Minimum, it.Maximum, it.ExclusiveMinimum, it.ExclusiveMaximum, add)
			checkLengths(propPath(name, "items", "maxLength"), it.MinLength, it.MaxLength, "minLength", add)
			checkPattern(propPath(name, "items", "pattern"), it.Pattern, add)
		}
	}
	return issues
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

func checkOptions(path string, f *Field, enumPath string, enum []string, byName map[string]*Field, add func(string, string, ...any)) {
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
			if byName[name] == nil {
				add(p, "field %s does not exist", ptr)
			} else if name == f.Name {
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
			var v any
			dec := json.NewDecoder(strings.NewReader(string(f.Default)))
			dec.UseNumber()
			_ = dec.Decode(&v)
			defaults[f.Name] = v
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
	return issues
}
