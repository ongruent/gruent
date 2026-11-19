package channelsValidate

import (
	"bytes"
	"fmt"

	"github.com/ongruent/gruent/libs/engine/steps"
	"github.com/ongruent/gruent/libs/legacy/engine/channels"
)

// libraryStepErrors validates steps created from the step library against their exact definition, so the
// editor shows configuration errors before publishing. The controller runs the same validation when it
// compiles the channel. Steps created before the step library have no plugin identity and are skipped.
func libraryStepErrors(registry *steps.Registry, nodes []channels.Node) map[string][]string {
	errors := map[string][]string{}
	for _, node := range nodes {
		metadata := node.Metadata
		if metadata.PluginType == "" {
			continue
		}
		identity := steps.Identity{PluginType: metadata.PluginType, PluginVersion: metadata.PluginVersion}
		entry, err := registry.Resolve(identity)
		if err != nil {
			errors[node.Id] = append(errors[node.Id], fmt.Sprintf("%s is not in the step library", identity))
			continue
		}
		if string(entry.Definition.Category) != metadata.Type {
			errors[node.Id] = append(errors[node.Id], fmt.Sprintf("step type %q does not match %s, which is a %s step", metadata.Type, identity, entry.Definition.Category))
		}
		config := bytes.TrimSpace(metadata.Config)
		if len(config) == 0 || bytes.Equal(config, []byte("null")) {
			config = []byte("{}")
		}
		for _, issue := range entry.Definition.ValidateConfig(config) {
			errors[node.Id] = append(errors[node.Id], issue.String())
		}
	}
	return errors
}
