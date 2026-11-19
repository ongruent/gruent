package compiler

import (
	"bytes"
	"strconv"
	"strings"

	"github.com/ongruent/gruent/libs/engine/steps"
	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// Step library plugin types that the compiler gives behavior beyond configuration validation, e.g. source
// bindings. Every other library step only needs a valid configuration.
const (
	pluginHTTPSource         = "http-source"
	pluginTimerSource        = "timer-source"
	pluginMessageQueueSource = "message-queue-source"
)

// Named option collections whose values the compiler resolves as dependencies.
const (
	collectionModels      = "models"
	collectionConnections = "connections"
)

// Configuration fields of library steps that declare a step's input or output model explicitly. They map
// to the type contracts of package types; any other model field of a source declares the source's output.
var libraryModelFields = map[string]string{
	"inputModelId":  types.InputModelField,
	"outputModelId": types.OutputModelField,
}

// libraryStep is a step created from the step library, resolved against its exact definition.
type libraryStep struct {
	definition *steps.Definition
	// valid reports whether the configuration satisfies the definition's schema.
	valid bool
	// references are the dependencies selected in the configuration (models, connections, ...).
	references []steps.Reference
}

func (s *libraryStep) is(pluginType string, pluginVersion int) bool {
	return s != nil && s.definition != nil && s.definition.PluginType == pluginType && s.definition.PluginVersion == pluginVersion
}

// modelDependency is a model selected in a step's configuration field.
type modelDependency struct {
	field   string
	modelID string
}

// resolveLibraryStep resolves a step's exact plugin identity in the step library and validates its
// configuration against the definition, reporting schema violations at their configuration pointers.
// It returns nil for steps created before the step library, which have no plugin identity.
func (c *compilation) resolveLibraryStep(node nodeConfig) *libraryStep {
	metadata := node.Metadata
	if metadata.PluginType == "" {
		return nil
	}
	if s, ok := c.libraryCache[node.ID]; ok {
		return s
	}
	s := c.newLibraryStep(node)
	c.libraryCache[node.ID] = s
	return s
}

func (c *compilation) newLibraryStep(node nodeConfig) *libraryStep {
	metadata := node.Metadata
	identity := steps.Identity{PluginType: metadata.PluginType, PluginVersion: metadata.PluginVersion}
	entry, err := c.library.Resolve(identity)
	if err != nil {
		// Channels resolve exact versions: there is no fallback to another version of the plugin.
		c.errorf("unknown_step_definition", node.ID, "/pluginType", "step %s uses %s, which is not in the step library", node.ID, identity)
		return &libraryStep{}
	}
	s := &libraryStep{definition: entry.Definition}
	if string(entry.Definition.Category) != metadata.Type {
		c.errorf("step_category_mismatch", node.ID, "/type", "step %s has type %q, but %s is a %s step", node.ID, metadata.Type, identity, entry.Definition.Category)
	}

	config := []byte(metadata.Config)
	if len(bytes.TrimSpace(config)) == 0 || bytes.Equal(bytes.TrimSpace(config), []byte("null")) {
		config = []byte("{}")
	}
	issues := entry.Definition.ValidateConfig(config)
	for _, issue := range issues {
		c.errorf("invalid_step_config", node.ID, "/config"+issue.Path, "step %s (%s): %s", node.ID, metadata.Name, issueMessage(issue))
	}
	if len(issues) > 0 {
		return s
	}
	references, err := entry.Definition.References(config)
	if err != nil {
		c.errorf("invalid_step_config", node.ID, "/config", "step %s (%s): %v", node.ID, metadata.Name, err)
		return s
	}
	s.valid = true
	s.references = references
	return s
}

func issueMessage(issue steps.Issue) string {
	if issue.Path == "" {
		return issue.Message
	}
	return issue.Path + ": " + issue.Message
}

// referencesTo returns the IDs selected for a named collection and the configuration field of each.
func (s *libraryStep) referencesTo(collection string) []modelDependency {
	if s == nil {
		return nil
	}
	var dependencies []modelDependency
	for _, reference := range s.references {
		if reference.Collection != collection {
			continue
		}
		field := strings.SplitN(strings.TrimPrefix(reference.Path, "/"), "/", 2)[0]
		dependencies = append(dependencies, modelDependency{field: field, modelID: reference.ID})
	}
	return dependencies
}

// stepDefinition returns the definition pin of a library step.
func (s *libraryStep) stepDefinition() *plan.StepDefinition {
	if s == nil || s.definition == nil {
		return nil
	}
	return &plan.StepDefinition{
		PluginType:    s.definition.PluginType,
		PluginVersion: s.definition.PluginVersion,
		Digest:        s.definition.Digest(),
	}
}

// libraryStepType returns the plan type and version of a library step.
func libraryStepType(node nodeConfig) (string, string) {
	return node.Metadata.Type + "." + node.Metadata.PluginType, strconv.Itoa(node.Metadata.PluginVersion)
}
