package steps

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

var printer = message.NewPrinter(language.English)

// denyLoader refuses every external reference so schemas can never trigger network or file access.
type denyLoader struct{}

func (denyLoader) Load(url string) (any, error) {
	return nil, fmt.Errorf("external schema references are not allowed: %s", url)
}

// dateTimeFormat replaces the library's date-time format so every language applies the same strict
// RFC 3339 profile (see IsDateTime).
var dateTimeFormat = &jsonschema.Format{
	Name: "date-time",
	Validate: func(v any) error {
		s, ok := v.(string)
		if !ok || IsDateTime(s) {
			return nil
		}
		return errors.New("must be an RFC 3339 date-time such as 2026-01-01T09:00:00Z")
	},
}

func newCompiler() *jsonschema.Compiler {
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	c.UseLoader(denyLoader{})
	c.AssertFormat()
	c.RegisterFormat(dateTimeFormat)
	return c
}

var (
	envelopeOnce   sync.Once
	envelopeSchema *jsonschema.Schema
	envelopeErr    error
)

func envelopeValidator() (*jsonschema.Schema, error) {
	envelopeOnce.Do(func() {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(envelopeSchemaJSON))
		if err != nil {
			envelopeErr = err
			return
		}
		c := newCompiler()
		if err := c.AddResource(EnvelopeSchemaURL, doc); err != nil {
			envelopeErr = err
			return
		}
		envelopeSchema, envelopeErr = c.Compile(EnvelopeSchemaURL)
	})
	return envelopeSchema, envelopeErr
}

// validatorCache holds compiled configuration validators keyed by immutable definition digest.
var validatorCache sync.Map // map[string]*jsonschema.Schema

func configValidator(digest string, configSchema []byte) (*jsonschema.Schema, error) {
	if v, ok := validatorCache.Load(digest); ok {
		return v.(*jsonschema.Schema), nil
	}
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(configSchema))
	if err != nil {
		return nil, err
	}
	url := "urn:gruent:config:" + strings.TrimPrefix(digest, "sha256:")
	c := newCompiler()
	if err := c.AddResource(url, doc); err != nil {
		return nil, err
	}
	sch, err := c.Compile(url)
	if err != nil {
		return nil, err
	}
	actual, _ := validatorCache.LoadOrStore(digest, sch)
	return actual.(*jsonschema.Schema), nil
}

// ValidateConfig validates plugin configuration against the definition's configSchema. It returns nil when
// the configuration is valid. Issue paths are JSON Pointers into the configuration; missing required and
// unknown properties are reported at the property's own pointer. This checks shape only: resource
// references and permissions are checked separately (see References).
func (d *Definition) ValidateConfig(config []byte) []Issue {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(config))
	if err != nil {
		return []Issue{{Path: "", Message: "invalid JSON: " + err.Error()}}
	}
	return d.validateValue(doc)
}

func (d *Definition) validateValue(doc any) []Issue {
	if err := d.schema.Validate(doc); err != nil {
		var ve *jsonschema.ValidationError
		if !errors.As(err, &ve) {
			return []Issue{{Message: err.Error()}}
		}
		issues := flatten(ve, nil)
		sortIssues(issues)
		return dedupe(issues)
	}
	return nil
}

func flattenEnvelope(err error) []Issue {
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		return []Issue{{Message: err.Error()}}
	}
	issues := dedupe(flatten(ve, nil))
	sortIssues(issues)
	return issues
}

func flatten(ve *jsonschema.ValidationError, out []Issue) []Issue {
	if len(ve.Causes) > 0 {
		for _, c := range ve.Causes {
			out = flatten(c, out)
		}
		return out
	}
	base := pointer(ve.InstanceLocation)
	msg := ve.ErrorKind.LocalizedString(printer)
	switch k := ve.ErrorKind.(type) {
	case *kind.Required:
		for _, m := range k.Missing {
			out = append(out, Issue{Path: base + "/" + escapePointer(m), Message: "is required"})
		}
	case *kind.AdditionalProperties:
		for _, p := range k.Properties {
			out = append(out, Issue{Path: base + "/" + escapePointer(p), Message: "is not allowed"})
		}
	default:
		out = append(out, Issue{Path: base, Message: msg})
	}
	return out
}

func pointer(loc []string) string {
	var b strings.Builder
	for _, s := range loc {
		b.WriteByte('/')
		b.WriteString(escapePointer(s))
	}
	return b.String()
}

func dedupe(issues []Issue) []Issue {
	seen := map[Issue]bool{}
	out := issues[:0]
	for _, i := range issues {
		if !seen[i] {
			seen[i] = true
			out = append(out, i)
		}
	}
	return out
}

var dateTimeRe = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$`)

// IsDateTime implements the contract's date-time profile: RFC 3339 with an upper-case "T" separator,
// mandatory seconds, optional fraction, and a "Z" or ±hh:mm offset. Leap seconds are rejected.
// Go, TypeScript and Kotlin implement the identical rule.
func IsDateTime(s string) bool {
	m := dateTimeRe.FindStringSubmatch(s)
	if m == nil {
		return false
	}
	n := func(i int) int { v, _ := strconv.Atoi(m[i]); return v }
	year, month, day := n(1), n(2), n(3)
	if month < 1 || month > 12 || day < 1 || day > daysIn(year, month) {
		return false
	}
	if n(4) > 23 || n(5) > 59 || n(6) > 59 {
		return false
	}
	if m[8] != "Z" && (n(9) > 23 || n(10) > 59) {
		return false
	}
	return true
}

func daysIn(year, month int) int {
	switch month {
	case 2:
		if year%4 == 0 && (year%100 != 0 || year%400 == 0) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}
