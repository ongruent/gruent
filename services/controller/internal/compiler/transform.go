package compiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

const (
	pluginTransform = "transform"
	// transformOutputModelField is the configuration field of transform@1's output model. It also declares
	// the step's output type (see libraryModelFields). The input type is inferred from the previous step.
	transformOutputModelField = "outputModelId"
)

// Sources of transform@1 mappings other than an input field.
const (
	transformFromValue    = "$value"
	transformFromTemplate = "$template"
)

// Source kinds of compiled transform rules.
const (
	transformSourceVariable = "variable"
	transformSourceValue    = "value"
	transformSourceTemplate = "template"
)

// transformCompiled is the plan step's compiled data of transform@1: the rules that build the output from
// the input, in configuration order. Paths are relative to the input and the output, in variable syntax.
type transformCompiled struct {
	OutputModelRef string          `json:"outputModelRef"`
	Rules          []transformRule `json:"rules"`
}

type transformRule struct {
	// Target is the output field, e.g. "location.lat" or "values[].c" (every item of the array).
	Target string `json:"target"`
	// Required is set when the output model requires the target (and every object or array on the way),
	// so a missing input value fails the step instead of leaving the field out.
	Required bool            `json:"required,omitempty"`
	Source   transformSource `json:"source"`
}

type transformSource struct {
	Kind string `json:"kind"`
	// Path is the input value of a variable source ("device.id", "readings[].celsius", or "" for the
	// whole input).
	Path string `json:"path,omitempty"`
	// Value is the JSON value of a fixed source.
	Value json.RawMessage `json:"value,omitempty"`
	// Parts are the text and input values of a template source.
	Parts []transformPart `json:"parts,omitempty"`
}

type transformPart struct {
	Text string `json:"text,omitempty"`
	// Path is an input value, rendered as text.
	Path *string `json:"path,omitempty"`
}

// transformMapping is one row of transform@1's mappings: an output field and where its value comes from.
type transformMapping struct {
	Target string  `json:"target"`
	Source string  `json:"source"`
	Value  *string `json:"value"`
}

var (
	// transformInputPath is an input field relative to the input, possibly through arrays.
	transformInputPath   = regexp.MustCompile(`^[^.\s\[\]{}]+(?:\[\])?(?:\.[^.\s\[\]{}]+(?:\[\])?)*$`)
	transformPlaceholder = regexp.MustCompile(`\{\{\s*([^{}]*?)\s*\}\}`)
)

// compileTransform checks the mappings of a transform step against its output model and its input type,
// which is inferred from the previous step, and compiles them into the plan step. input is nil when the
// input type is unknown (node-only compilation without upstream context); mappings that read the input are
// then only checked once the step is connected.
func (c *compilation) compileTransform(step *plan.Step, library *libraryStep, input *types.Type) error {
	outputID, ok := library.modelOf(transformOutputModelField)
	if !ok {
		return nil
	}
	outputModel, ok := c.models[outputID]
	if !ok {
		return nil // reported by resolveModels
	}

	var config struct {
		Mappings []transformMapping `json:"mappings"`
	}
	if err := json.Unmarshal(step.Config, &config); err != nil {
		return fmt.Errorf("decode configuration of step %s: %w", step.ID, err)
	}

	compiled := transformCompiled{OutputModelRef: outputID, Rules: []transformRule{}}
	valid := true
	for index, mapping := range config.Mappings {
		base := fmt.Sprintf("/config/mappings/%d", index)
		rule, field, problem := transformRuleOf(mapping)
		if problem == "" {
			field, problem = checkTransformRule(&rule, input, outputModel.t)
		}
		if problem == "" {
			for _, other := range compiled.Rules {
				if overlaps(rule.Target, other.Target) {
					field, problem = "target", fmt.Sprintf("%s is already set by the mapping of %s", rule.Target, other.Target)
					break
				}
			}
		}
		if problem == untypedInput {
			c.errorf("untyped_transform_input", step.ID, base+"/source", "the input of step %s %s, so the mapping of %s can't read input fields; give the previous step's output a model, or use a fixed value", step.ID, describeUntyped(input), mapping.Target)
			valid = false
			continue
		}
		if problem != "" {
			c.errorf("invalid_mapping", step.ID, base+"/"+field, "mapping %d of step %s (%s): %s", index+1, step.ID, mapping.Target, problem)
			valid = false
			continue
		}
		compiled.Rules = append(compiled.Rules, rule)
	}
	if !valid {
		return nil
	}
	for _, field := range unmappedRequiredFields(outputModel.t, "", compiled.Rules) {
		c.errorf("unmapped_required_field", step.ID, "/config/mappings", "the output model of step %s requires %s, but nothing is mapped to it", step.ID, field)
	}

	encoded, err := plan.Canonicalize(mustMarshal(compiled))
	if err != nil {
		return err
	}
	step.Compiled = encoded
	return nil
}

// untypedInput is the problem of a mapping that reads fields of an input without fields.
const untypedInput = "untyped input"

func describeUntyped(input *types.Type) string {
	if input != nil && input.Kind == types.KindSignal {
		return "is a signal without data"
	}
	return "has no model"
}

func overlaps(a, b string) bool {
	return a == b || strings.HasPrefix(a, b+".") || strings.HasPrefix(a, b+"[]") || strings.HasPrefix(b, a+".") || strings.HasPrefix(b, a+"[]")
}

// transformRuleOf turns a mapping into a rule. Fixed values are typed later, against the output field. It
// returns the configuration field with a problem and its description if the mapping is invalid.
func transformRuleOf(mapping transformMapping) (transformRule, string, string) {
	rule := transformRule{Target: mapping.Target}
	switch mapping.Source {
	case transformFromValue, transformFromTemplate:
		if mapping.Value == nil {
			return rule, "value", "a value is required"
		}
		if mapping.Source == transformFromValue {
			rule.Source = transformSource{Kind: transformSourceValue, Value: mustMarshal(*mapping.Value)}
			return rule, "", ""
		}
		parts, problem := parseTemplate(*mapping.Value)
		if problem != "" {
			return rule, "value", problem
		}
		if len(parts) == 0 || len(parts) == 1 && parts[0].Path == nil {
			rule.Source = transformSource{Kind: transformSourceValue, Value: mustMarshal(*mapping.Value)}
		} else {
			rule.Source = transformSource{Kind: transformSourceTemplate, Parts: parts}
		}
	default:
		if !transformInputPath.MatchString(mapping.Source) {
			return rule, "source", fmt.Sprintf("%s is not an input field such as device.id or readings[].celsius", mapping.Source)
		}
		rule.Source = transformSource{Kind: transformSourceVariable, Path: mapping.Source}
	}
	return rule, "", ""
}

// parseTemplate splits a text into literal parts and {{device.id}} placeholders of input fields.
func parseTemplate(text string) ([]transformPart, string) {
	var parts []transformPart
	last := 0
	for _, match := range transformPlaceholder.FindAllStringSubmatchIndex(text, -1) {
		if match[0] > last {
			parts = append(parts, transformPart{Text: text[last:match[0]]})
		}
		path := text[match[2]:match[3]]
		if !transformInputPath.MatchString(path) || strings.Contains(path, "[]") {
			return nil, fmt.Sprintf("{{%s}} is not a single input field such as {{device.id}}", path)
		}
		parts = append(parts, transformPart{Path: &path})
		last = match[1]
	}
	if last < len(text) {
		parts = append(parts, transformPart{Text: text[last:]})
	}
	return parts, ""
}

// checkTransformRule checks a rule against the input type (nil if unknown) and the output model, types its
// fixed value and sets whether its target is required. It returns the configuration field with a problem
// and its description if the rule cannot produce a valid output.
func checkTransformRule(rule *transformRule, input *types.Type, output types.Type) (string, string) {
	target, targetArrays, required, ok := typeAtPath(output, rule.Target)
	if !ok {
		return "target", fmt.Sprintf("%s is not a field of the output model", rule.Target)
	}
	if targetArrays > 1 {
		return "target", fmt.Sprintf("%s goes through more than one array", rule.Target)
	}
	rule.Required = required

	// Input fields can only be checked against an input with fields.
	readsInput := rule.Source.Kind == transformSourceVariable || rule.Source.Kind == transformSourceTemplate
	if readsInput && input != nil && (input.Kind == types.KindBytes || input.Kind == types.KindSignal) {
		return "source", untypedInput
	}
	known := input != nil

	switch rule.Source.Kind {
	case transformSourceValue:
		value, problem := typedFixedValue(rule.Source.Value, target, targetArrays)
		if problem != "" {
			return "value", problem
		}
		rule.Source.Value = value
	case transformSourceTemplate:
		if targetArrays > 0 || target.Kind != types.KindString {
			return "value", fmt.Sprintf("%s is not a text field, so it can't be set to text", rule.Target)
		}
		for _, part := range rule.Source.Parts {
			if part.Path == nil || !known {
				continue
			}
			value, arrays, _, ok := typeAtPath(*input, *part.Path)
			if !ok {
				return "value", fmt.Sprintf("%s is not part of the input", *part.Path)
			}
			if arrays > 0 || value.Kind == types.KindObject || value.Kind == types.KindArray {
				return "value", fmt.Sprintf("%s is not a single value that can be written as text", *part.Path)
			}
		}
	case transformSourceVariable:
		if !known {
			return "", ""
		}
		source, sourceArrays, _, ok := typeAtPath(*input, rule.Source.Path)
		if !ok {
			return "source", fmt.Sprintf("%s is not part of the input", rule.Source.Path)
		}
		switch {
		case sourceArrays > 1:
			return "source", fmt.Sprintf("%s goes through more than one array", rule.Source.Path)
		case sourceArrays == 1 && targetArrays == 1:
			// Items are mapped by index: values[].c = readings[].celsius
		case sourceArrays == 1 && target.Kind == types.KindArray && target.Items != nil:
			// The values of every item become the array: values = readings[].celsius
			target = *target.Items
		case sourceArrays == 1:
			return "source", fmt.Sprintf("%s has a value per array item, but %s is not an array", rule.Source.Path, rule.Target)
		case targetArrays == 1:
			return "source", fmt.Sprintf("%s sets every item of an array, but %s is a single value", rule.Target, rule.Source.Path)
		}
		if !source.AssignableTo(target) {
			return "source", fmt.Sprintf("%s is a %s that doesn't match %s (%s)", rule.Source.Path, source.Kind, rule.Target, target.Kind)
		}
	}
	return "", ""
}

// typedFixedValue converts a fixed value, entered as text, to the JSON value of the output field's type.
func typedFixedValue(raw json.RawMessage, target types.Type, targetArrays int) (json.RawMessage, string) {
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return nil, "invalid fixed value"
	}
	if targetArrays > 0 {
		return nil, "a fixed value can't set every item of an array"
	}
	trimmed := strings.TrimSpace(text)
	switch target.Kind {
	case types.KindString:
		return raw, ""
	case types.KindNumber:
		if !fixedNumber.MatchString(trimmed) {
			return nil, fmt.Sprintf("%q is not a number", text)
		}
		return json.RawMessage(trimmed), ""
	case types.KindBoolean:
		switch strings.ToLower(trimmed) {
		case "true":
			return json.RawMessage("true"), ""
		case "false":
			return json.RawMessage("false"), ""
		}
		return nil, fmt.Sprintf("%q is not true or false", text)
	}
	return nil, fmt.Sprintf("a fixed value can only set text, number or true/false fields, not %s fields", target.Kind)
}

func prefixed(path string) string {
	if path == "" {
		return ""
	}
	return "." + path
}

// typeAtPath returns the type at a path in variable syntax ("" is the type itself), the number of arrays
// the path goes through, and whether every field on the way is required.
func typeAtPath(t types.Type, path string) (types.Type, int, bool, bool) {
	current, arrays, required := t, 0, true
	if path == "" {
		return current, 0, true, true
	}
	descend := func(name string) bool {
		depth := 0
		for strings.HasSuffix(name, "[]") {
			name = strings.TrimSuffix(name, "[]")
			depth++
		}
		if name != "" {
			if current.Kind != types.KindObject {
				return false
			}
			index := slices.IndexFunc(current.Fields, func(f types.Field) bool { return f.Name == name })
			if index < 0 {
				return false
			}
			required = required && current.Fields[index].Required
			current = current.Fields[index].Type
		}
		for range depth {
			if current.Kind != types.KindArray || current.Items == nil {
				return false
			}
			current = *current.Items
			arrays++
		}
		return true
	}
	for _, segment := range strings.Split(path, ".") {
		if !descend(segment) {
			return types.Type{}, 0, false, false
		}
	}
	return current, arrays, required, true
}

// unmappedRequiredFields lists the required fields of an output type (objects descended into) that no rule
// sets, neither the field itself nor anything within it.
func unmappedRequiredFields(t types.Type, prefix string, rules []transformRule) []string {
	var missing []string
	for _, field := range t.Fields {
		if !field.Required {
			continue
		}
		path := prefix + field.Name
		exact := slices.ContainsFunc(rules, func(r transformRule) bool { return r.Target == path })
		within := slices.ContainsFunc(rules, func(r transformRule) bool {
			return strings.HasPrefix(r.Target, path+".") || strings.HasPrefix(r.Target, path+"[]")
		})
		switch {
		case exact:
		case within && field.Type.Kind == types.KindObject:
			missing = append(missing, unmappedRequiredFields(field.Type, path+".", rules)...)
		case within:
		default:
			missing = append(missing, path)
		}
	}
	return missing
}
