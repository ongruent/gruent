package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/ongruent/gruent/libs/engine/steps"
)

const kotlinBasePackage = "com.gruent.steps.plugins"

// kotlinTarget identifies the generated Kotlin asset of one plugin version. Every version has its own
// package so multiple versions of a plugin can coexist on one classpath.
type kotlinTarget struct {
	Package string
	Class   string
	Path    string // relative to the library root
}

func kotlinTargetFor(id steps.Identity) kotlinTarget {
	pkg := fmt.Sprintf("%s.%s.v%d", kotlinBasePackage, strings.ReplaceAll(id.PluginType, "-", ""), id.PluginVersion)
	class := pascal(id.PluginType) + "Config"
	return kotlinTarget{
		Package: pkg,
		Class:   class,
		Path:    "generated/kotlin/" + strings.ReplaceAll(pkg, ".", "/") + "/" + class + ".kt",
	}
}

func pascal(s string) string {
	var b strings.Builder
	for _, part := range strings.Split(s, "-") {
		if part != "" {
			b.WriteString(strings.ToUpper(part[:1]) + part[1:])
		}
	}
	return b.String()
}

var nonIdent = regexp.MustCompile(`[^A-Za-z0-9]+`)

// enumEntryName maps a static option value to a Kotlin enum entry name.
func enumEntryName(value string) string {
	n := strings.Trim(nonIdent.ReplaceAllString(value, "_"), "_")
	n = strings.ToUpper(n)
	if n == "" || (n[0] >= '0' && n[0] <= '9') {
		n = "V_" + n
	}
	return n
}

// kotlinString renders s as a Kotlin string literal. Everything outside printable ASCII is escaped so the
// generated source is deterministic and encoding-independent.
func kotlinString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '\\':
			b.WriteString(`\\`)
		case r == '"':
			b.WriteString(`\"`)
		case r == '$':
			b.WriteString(`\$`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r >= 0x20 && r < 0x7f:
			b.WriteRune(r)
		default:
			for _, u := range utf16.Encode([]rune{r}) {
				fmt.Fprintf(&b, `\u%04x`, u)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func kotlinDouble(f float64) string {
	s := strconv.FormatFloat(f, 'g', -1, 64)
	if !strings.ContainsAny(s, ".eE") {
		s += ".0"
	}
	return s
}

func kotlinLong(f float64) string { return strconv.FormatInt(int64(f), 10) + "L" }

func kdocText(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "*/", "*&#47;"), "/*", "/&#42;")
}

type kotlinField struct {
	f        steps.Field
	kType    string       // element type for arrays
	enumName string       // Kotlin enum class name when the field (or its items) is a static-only enum
	item     *kotlinClass // nested class of object items
}

// kotlinClass is a generated data class: the configuration, or the items of an objectList field.
type kotlinClass struct {
	name   string
	fields []kotlinField
}

// kotlinFields maps fields to Kotlin members. Enums and item classes are nested in the class that declares
// the field, so their names only need to be unique within it; reserved are the names they cannot use.
func kotlinFields(fields []steps.Field, reserved map[string]bool) ([]kotlinField, error) {
	var out []kotlinField
	nested := map[string]bool{}
	claim := func(f steps.Field, name string) error {
		if nested[name] || reserved[name] || name == "Definition" || name == "Companion" {
			return fmt.Errorf("%s: Kotlin class name %s is ambiguous", f.Pointer, name)
		}
		nested[name] = true
		return nil
	}
	for _, f := range fields {
		kf := kotlinField{f: f}
		enum := f.Enum
		elemType := f.Type
		if f.Type == steps.TypeArray {
			elemType = f.Items.Type
			enum = f.Items.Enum
		}
		if elemType == steps.TypeObject {
			name := strings.ToUpper(f.Name[:1]) + f.Name[1:] + "Item"
			if err := claim(f, name); err != nil {
				return nil, err
			}
			itemFields, err := kotlinFields(f.Items.Fields, map[string]bool{name: true})
			if err != nil {
				return nil, fmt.Errorf("%s/items: %w", f.Pointer, err)
			}
			kf.item = &kotlinClass{name: name, fields: itemFields}
			kf.kType = name
			out = append(out, kf)
			continue
		}
		if len(enum) > 0 {
			kf.enumName = strings.ToUpper(f.Name[:1]) + f.Name[1:]
			if f.Type == steps.TypeArray {
				kf.enumName += "Item"
			}
			if err := claim(f, kf.enumName); err != nil {
				return nil, err
			}
			seen := map[string]string{}
			for _, v := range enum {
				n := enumEntryName(v)
				if prev, ok := seen[n]; ok {
					return nil, fmt.Errorf("%s: enum values %q and %q both map to Kotlin entry %s", f.Pointer, prev, v, n)
				}
				seen[n] = v
			}
		}
		switch {
		case kf.enumName != "":
			kf.kType = kf.enumName
		case elemType == steps.TypeString:
			kf.kType = "String"
		case elemType == steps.TypeInteger:
			kf.kType = "Long"
		case elemType == steps.TypeNumber:
			kf.kType = "Double"
		case elemType == steps.TypeBoolean:
			kf.kType = "Boolean"
		}
		out = append(out, kf)
	}
	return out, nil
}

// kotlinWriter writes indented Kotlin source.
type kotlinWriter struct {
	b *strings.Builder
}

// line writes one line at the given indentation (two spaces per level); empty format writes an empty line.
func (w kotlinWriter) line(indent int, format string, args ...any) {
	if format == "" {
		w.b.WriteString("\n")
		return
	}
	w.b.WriteString(strings.Repeat("  ", indent))
	fmt.Fprintf(w.b, format, args...)
	w.b.WriteString("\n")
}

// properties writes the constructor properties of a data class.
func (w kotlinWriter) properties(indent int, fields []kotlinField) {
	for _, kf := range fields {
		f := kf.f
		w.line(indent, "/**")
		w.line(indent, " * %s", kdocText(f.Title))
		if f.Description != "" {
			w.line(indent, " *")
			w.line(indent, " * %s", kdocText(f.Description))
		}
		if len(f.Default) > 0 {
			w.line(indent, " *")
			w.line(indent, " * Default for new configurations: `%s`. Defaults are not applied when decoding.", kdocText(string(f.Default)))
		}
		w.line(indent, " */")
		typ := kf.kType
		if f.Type == steps.TypeArray {
			typ = "List<" + typ + ">"
		}
		if f.Required {
			w.line(indent, "val %s: %s,", f.Name, typ)
		} else {
			w.line(indent, "val %s: %s? = null,", f.Name, typ)
		}
	}
}

// nested writes the enums and item classes declared by fields.
func (w kotlinWriter) nested(indent int, fields []kotlinField) {
	for _, kf := range fields {
		if kf.item != nil {
			w.itemClass(indent, kf)
			w.line(0, "")
			continue
		}
		if kf.enumName == "" {
			continue
		}
		enum := enumOf(kf.f)
		w.line(indent, "enum class %s(val value: String) {", kf.enumName)
		for i, v := range enum {
			sep := ","
			if i == len(enum)-1 {
				sep = ";"
			}
			w.line(indent+1, "%s(%s)%s", enumEntryName(v), kotlinString(v), sep)
		}
		w.line(0, "")
		w.line(indent+1, "companion object {")
		w.line(indent+2, "fun fromValue(value: String): %s = entries.first { it.value == value }", kf.enumName)
		w.line(indent+1, "}")
		w.line(indent, "}")
		w.line(0, "")
	}
}

// constants writes the property set, required list, patterns and enum value sets of a validator.
func (w kotlinWriter) constants(indent int, fields []kotlinField) {
	var props, required []string
	for _, kf := range fields {
		props = append(props, kotlinString(kf.f.Name))
		if kf.f.Required {
			required = append(required, kotlinString(kf.f.Name))
		}
	}
	w.line(indent, "private val properties: Set<String> = setOf(%s)", strings.Join(props, ", "))
	w.line(indent, "private val required: List<String> = listOf(%s)", strings.Join(required, ", "))
	for _, kf := range fields {
		if p := patternOf(kf.f); p != "" {
			w.line(indent, "private val %sPattern = Regex(%s)", kf.f.Name, kotlinString(p))
		}
		if enum := enumOf(kf.f); len(enum) > 0 {
			quoted := make([]string, len(enum))
			for i, v := range enum {
				quoted[i] = kotlinString(v)
			}
			w.line(indent, "private val %sValues: Set<String> = setOf(%s)", kf.f.Name, strings.Join(quoted, ", "))
		}
	}
}

// checks writes the validation of every field of obj; path returns the Kotlin expression of a field's path.
func (w kotlinWriter) checks(indent int, fields []kotlinField, path func(steps.Field) string) {
	for _, kf := range fields {
		w.line(indent, "obj[%s]?.let { %s }", kotlinString(kf.f.Name), checkExpr(kf, "it", path(kf.f)))
	}
}

// decode writes the constructor arguments that decode every field of obj.
func (w kotlinWriter) decode(indent int, fields []kotlinField) {
	for _, kf := range fields {
		f := kf.f
		get := fmt.Sprintf("obj.getValue(%s)", kotlinString(f.Name))
		if !f.Required {
			get = fmt.Sprintf("obj[%s]?", kotlinString(f.Name))
		}
		w.line(indent, "%s = %s.%s,", f.Name, get, decodeExpr(kf))
	}
}

// encode writes the entries that encode every field of value.
func (w kotlinWriter) encode(indent int, fields []kotlinField) {
	for _, kf := range fields {
		w.line(indent, "%s to %s,", kotlinString(kf.f.Name), encodeExpr(kf, "value."+kf.f.Name, kf.f.Required))
	}
}

// itemClass writes the data class of an objectList field's items, with its validator and codec.
func (w kotlinWriter) itemClass(indent int, kf kotlinField) {
	c := kf.item
	w.line(indent, "/** An item of %s. */", kdocText(kf.f.Title))
	w.line(indent, "data class %s(", c.name)
	w.properties(indent+1, c.fields)
	w.line(indent, ") {")
	w.nested(indent+1, c.fields)
	w.line(indent+1, "fun toJsonObject(): JsonObject = Companion.toJsonObject(this)")
	w.line(0, "")
	w.line(indent+1, "companion object {")
	w.constants(indent+2, c.fields)
	w.line(0, "")
	w.line(indent+2, "fun check(v: ConfigValidator, element: JsonElement, path: String) {")
	w.line(indent+3, "val obj = v.objectAt(element, path) ?: return")
	w.line(indent+3, "v.closed(obj, path, properties, required)")
	w.checks(indent+3, c.fields, func(f steps.Field) string {
		return "ConfigValidator.child(path, " + kotlinString(f.Name) + ")"
	})
	w.line(indent+2, "}")
	w.line(0, "")
	w.line(indent+2, "fun fromValidated(obj: JsonObject): %s =", c.name)
	w.line(indent+3, "%s(", c.name)
	w.decode(indent+4, c.fields)
	w.line(indent+3, ")")
	w.line(0, "")
	w.line(indent+2, "fun toJsonObject(value: %s): JsonObject =", c.name)
	w.line(indent+3, "ConfigCodec.objectOf(")
	w.encode(indent+4, c.fields)
	w.line(indent+3, ")")
	w.line(indent+1, "}")
	w.line(indent, "}")
}

// generateKotlin renders the configuration type, validator and codec for one definition. Rendering
// annotations (x-ui) never become members; static option sets only surface as enums when the schema itself
// constrains values with enum.
func generateKotlin(def *steps.Definition, sourcePath string) (string, error) {
	t := kotlinTargetFor(def.Identity())
	fields, err := kotlinFields(def.Fields(), map[string]bool{t.Class: true})
	if err != nil {
		return "", err
	}

	var b strings.Builder
	w := func(format string, args ...any) { fmt.Fprintf(&b, format, args...) }
	kw := kotlinWriter{b: &b}

	w("// Code generated by libs/engine/steps/compiler from %s. DO NOT EDIT.\n", sourcePath)
	w("//\n// Plugin: %s, contract version %d.\n", def.Identity(), def.ContractVersion)
	w("// Regenerate with `nx run steps:compile`. The original step.json remains the source of truth.\n\n")
	w("package %s\n\n", t.Package)
	w("import com.gruent.steps.config.ConfigCodec\n")
	w("import com.gruent.steps.config.ConfigValidator\n")
	w("import com.gruent.steps.config.ConfigViolation\n")
	w("import com.gruent.steps.config.StepConfigDefinition\n")
	w("import kotlinx.serialization.json.JsonElement\n")
	w("import kotlinx.serialization.json.JsonObject\n\n")

	w("/**\n * %s\n *\n * %s\n */\n", kdocText(def.DisplayName), kdocText(def.Description))
	if len(fields) == 0 {
		w("class %s {\n", t.Class)
		w("  override fun equals(other: Any?): Boolean = other is %s\n\n", t.Class)
		w("  override fun hashCode(): Int = 0\n\n")
		w("  override fun toString(): String = %s\n", kotlinString(t.Class+"()"))
		w("\n  fun toJson(): String = Definition.encode(this)\n\n")
	} else {
		w("data class %s(\n", t.Class)
		kw.properties(1, fields)
		w(") {\n")
		kw.nested(1, fields)
		w("  fun toJson(): String = Definition.encode(this)\n\n")
	}

	// Companion: identity, validator and codec.
	w("  companion object Definition : StepConfigDefinition<%s> {\n", t.Class)
	w("    override val pluginType: String = %s\n", kotlinString(def.PluginType))
	w("    override val pluginVersion: Int = %d\n", def.PluginVersion)
	w("    override val contractVersion: Int = %d\n", def.ContractVersion)
	w("    override val definitionDigest: String = %s\n\n", kotlinString(def.Digest()))
	kw.constants(2, fields)
	w("\n    override fun validate(element: JsonElement): List<ConfigViolation> {\n")
	w("      val v = ConfigValidator()\n")
	w("      val obj = v.objectAt(element, \"\") ?: return v.violations\n")
	w("      v.closed(obj, \"\", properties, required)\n")
	kw.checks(3, fields, func(f steps.Field) string { return kotlinString(f.Pointer) })
	w("      return v.violations\n    }\n\n")

	// Decode.
	w("    override fun fromValidated(obj: JsonObject): %s", t.Class)
	if len(fields) == 0 {
		w(" = %s()\n\n", t.Class)
	} else {
		w(" =\n      %s(\n", t.Class)
		kw.decode(4, fields)
		w("      )\n\n")
	}

	// Encode.
	w("    override fun toJsonObject(value: %s): JsonObject =\n", t.Class)
	w("      ConfigCodec.objectOf(\n")
	kw.encode(4, fields)
	w("      )\n")
	w("  }\n}\n")
	return b.String(), nil
}

func patternOf(f steps.Field) string {
	if f.Type == steps.TypeArray {
		return f.Items.Pattern
	}
	return f.Pattern
}

func enumOf(f steps.Field) []string {
	if f.Type == steps.TypeArray {
		return f.Items.Enum
	}
	return f.Enum
}

func optDouble(p *float64) string {
	if p == nil {
		return "null"
	}
	return kotlinDouble(*p)
}

func optInt(p *int64) string {
	if p == nil {
		return "null"
	}
	return strconv.FormatInt(*p, 10)
}

type scalarSpec struct {
	Type                   steps.FieldType
	MinLength, MaxLength   *int64
	HasPattern, HasEnum    bool
	DateTime               bool
	Min, Max, ExMin, ExMax *float64
}

func scalarCheck(name string, s scalarSpec, value, path string) string {
	switch s.Type {
	case steps.TypeString:
		args := []string{value, path}
		if s.MinLength != nil {
			args = append(args, "minLength = "+optInt(s.MinLength))
		}
		if s.MaxLength != nil {
			args = append(args, "maxLength = "+optInt(s.MaxLength))
		}
		if s.HasPattern {
			args = append(args, "pattern = "+name+"Pattern")
		}
		if s.HasEnum {
			args = append(args, "allowed = "+name+"Values")
		}
		if s.DateTime {
			args = append(args, "dateTime = true")
		}
		return "v.string(" + strings.Join(args, ", ") + ")"
	case steps.TypeInteger:
		return fmt.Sprintf("v.integer(%s, %s, minimum = %s, maximum = %s)", value, path, kotlinLong(*s.Min), kotlinLong(*s.Max))
	case steps.TypeNumber:
		args := []string{value, path}
		for _, kv := range []struct {
			k string
			p *float64
		}{{"minimum", s.Min}, {"maximum", s.Max}, {"exclusiveMinimum", s.ExMin}, {"exclusiveMaximum", s.ExMax}} {
			if kv.p != nil {
				args = append(args, kv.k+" = "+kotlinDouble(*kv.p))
			}
		}
		return "v.number(" + strings.Join(args, ", ") + ")"
	case steps.TypeBoolean:
		return fmt.Sprintf("v.boolean(%s, %s)", value, path)
	}
	panic("unsupported type " + s.Type)
}

func checkExpr(kf kotlinField, value, path string) string {
	f := kf.f
	if f.Type != steps.TypeArray {
		return scalarCheck(f.Name, scalarSpec{
			Type: f.Type, MinLength: f.MinLength, MaxLength: f.MaxLength, HasPattern: f.Pattern != "",
			HasEnum: len(f.Enum) > 0, DateTime: f.Format == "date-time",
			Min: f.Minimum, Max: f.Maximum, ExMin: f.ExclusiveMinimum, ExMax: f.ExclusiveMaximum,
		}, value, path)
	}
	it := f.Items
	var item string
	if kf.item != nil {
		item = kf.item.name + ".check(v, item, itemPath)"
	} else {
		item = scalarCheck(f.Name, scalarSpec{
			Type: it.Type, MinLength: it.MinLength, MaxLength: it.MaxLength, HasPattern: it.Pattern != "",
			HasEnum: len(it.Enum) > 0, Min: it.Minimum, Max: it.Maximum, ExMin: it.ExclusiveMinimum, ExMax: it.ExclusiveMaximum,
		}, "item", "itemPath")
	}
	args := []string{value, path}
	if f.MinItems != nil {
		args = append(args, "minItems = "+optInt(f.MinItems))
	}
	if f.MaxItems != nil {
		args = append(args, "maxItems = "+optInt(f.MaxItems))
	}
	if f.UniqueItems {
		args = append(args, "uniqueItems = true")
	}
	return "v.array(" + strings.Join(args, ", ") + ") { item, itemPath -> " + item + " }"
}

func scalarDecode(t steps.FieldType) string {
	switch t {
	case steps.TypeString:
		return "ConfigCodec.string(%s)"
	case steps.TypeInteger:
		return "ConfigCodec.long(%s)"
	case steps.TypeNumber:
		return "ConfigCodec.double(%s)"
	case steps.TypeBoolean:
		return "ConfigCodec.boolean(%s)"
	}
	panic("unsupported type " + t)
}

func decodeExpr(kf kotlinField) string {
	f := kf.f
	if kf.item != nil {
		return "let { ConfigCodec.list(it) { item -> " + kf.item.name + ".fromValidated(item as JsonObject) } }"
	}
	elem := f.Type
	if f.Type == steps.TypeArray {
		elem = f.Items.Type
	}
	one := scalarDecode(elem)
	if kf.enumName != "" {
		one = kf.enumName + ".fromValue(" + one + ")"
	}
	if f.Type == steps.TypeArray {
		return "let { ConfigCodec.list(it) { item -> " + fmt.Sprintf(one, "item") + " } }"
	}
	return "let { " + fmt.Sprintf(one, "it") + " }"
}

func encodeExpr(kf kotlinField, value string, required bool) string {
	f := kf.f
	elem := "it"
	if kf.enumName != "" {
		elem = "it.value"
	}
	var expr string
	if f.Type == steps.TypeArray {
		inner := "ConfigCodec.primitive(" + elem + ")"
		if kf.item != nil {
			inner = elem + ".toJsonObject()"
		}
		if required {
			return value + ".let { list -> ConfigCodec.array(list.map { " + inner + " }) }"
		}
		return value + "?.let { list -> ConfigCodec.array(list.map { " + inner + " }) }"
	}
	if required {
		expr = value + ".let { ConfigCodec.primitive(" + elem + ") }"
	} else {
		expr = value + "?.let { ConfigCodec.primitive(" + elem + ") }"
	}
	return expr
}
