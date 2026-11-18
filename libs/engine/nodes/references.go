package nodes

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Reference is a configuration value that identifies a parent-owned resource (a model, secret, thing, ...).
// References are derived purely from the definition: every value of a select or multiselect field with
// named options that is not one of the field's static values.
type Reference struct {
	// Path is the JSON Pointer of the value in the configuration (e.g. /thingIds/1).
	Path string `json:"path"`
	// Collection is the named option collection, e.g. "secrets".
	Collection string `json:"collection"`
	// ID is the referenced identifier.
	ID string `json:"id"`
	// Params are the named-option parameters resolved against the configuration, so resolvers can check
	// that a selection is compatible with the fields it depends on.
	Params map[string]any `json:"params,omitempty"`
}

// References extracts resource references from a configuration that has already passed ValidateConfig.
// Options shown in an editor are never authoritative: callers must resolve every reference (existence and
// permissions) before relying on them.
func (d *Definition) References(config []byte) ([]Reference, error) {
	var values map[string]json.RawMessage
	if err := json.Unmarshal(config, &values); err != nil {
		return nil, fmt.Errorf("decode configuration: %w", err)
	}
	var refs []Reference
	for _, f := range d.fields {
		o := f.UI.Options
		raw, ok := values[f.Name]
		if o == nil || o.Named == nil || !ok {
			continue
		}
		params := map[string]any{}
		for k, v := range o.Named.Params {
			params[k] = v
		}
		for k, ptr := range o.Named.ParamsFromFields {
			if v, ok := values[strings.TrimPrefix(ptr, "/")]; ok {
				var x any
				_ = json.Unmarshal(v, &x)
				params[k] = x
			}
		}
		if len(params) == 0 {
			params = nil
		}
		var ids []string
		var paths []string
		if f.Type == TypeArray {
			if err := json.Unmarshal(raw, &ids); err != nil {
				return nil, fmt.Errorf("%s: %w", f.Pointer, err)
			}
			for i := range ids {
				paths = append(paths, fmt.Sprintf("%s/%d", f.Pointer, i))
			}
		} else {
			var id string
			if err := json.Unmarshal(raw, &id); err != nil {
				return nil, fmt.Errorf("%s: %w", f.Pointer, err)
			}
			ids, paths = []string{id}, []string{f.Pointer}
		}
		for i, id := range ids {
			if o.HasStatic(id) {
				continue
			}
			refs = append(refs, Reference{Path: paths[i], Collection: o.Named.Name, ID: id, Params: params})
		}
	}
	return refs, nil
}
