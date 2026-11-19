package channelsValidate

import (
	"fmt"

	"github.com/ongruent/gruent/libs/engine/steps"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/libs/legacy/engine/channels"
	resolveModels "github.com/ongruent/gruent/libs/legacy/engine/dependencies/models/resolve"
	resolveConnections "github.com/ongruent/gruent/libs/legacy/engine/dependencies/things/resolve"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	// Create validation errors
	validationErrors := &channels.ValidationError{
		ChannelErrors: []string{},
		NodeErrors:    map[string][]string{},
	}

	// Expand the channel config
	for i, step := range request.Input.Config.Nodes {
		modelsResolveConfig := resolveModels.ResolveConfig{
			Metadata:    &step.Metadata,
			SqlcQueries: sqlc.Queries,
		}

		if err := resolveModels.ResolveInNode(&modelsResolveConfig); err != nil {
			validationErrors.NodeErrors[step.Id] = append(validationErrors.NodeErrors[step.Id], fmt.Sprintf("could not expand models in step %v, %v", step.Metadata.Name, err))
		}

		connectionsExpandConfig := resolveConnections.ExpandConfig{
			Metadata:    &step.Metadata,
			SqlcQueries: sqlc.Queries,
		}

		if err := resolveConnections.ExpandInNode(&connectionsExpandConfig); err != nil {
			validationErrors.NodeErrors[step.Id] = append(validationErrors.NodeErrors[step.Id], fmt.Sprintf("could not expand connections in step %v, %v", step.Metadata.Name, err))
		}

		request.Input.Config.Nodes[i] = step
	}

	// Validate the expanded channel config
	ve := request.Input.Config.Validate()

	// Combined validation errors
	if ve != nil {
		validationErrors.ChannelErrors = append(validationErrors.ChannelErrors, ve.ChannelErrors...)
		validationErrors.NodeErrors = mergeStepErrors(validationErrors.NodeErrors, ve.NodeErrors)
	}

	// Validate the configuration of steps from the step library
	library, err := steps.EmbeddedLibrary()
	if err != nil {
		return nil, fmt.Errorf("load step library: %w", err)
	}
	validationErrors.NodeErrors = mergeStepErrors(validationErrors.NodeErrors, libraryStepErrors(library, request.Input.Config.Nodes))

	output := &Output{
		ChannelErrors: validationErrors.ChannelErrors,
		StepErrors:    validationErrors.NodeErrors,
	}

	return output, nil
}

func mergeStepErrors(existingErrors map[string][]string, newErrors map[string][]string) map[string][]string {
	for stepId, errors := range newErrors {
		if existingErrors[stepId] == nil {
			existingErrors[stepId] = []string{}
		}
		existingErrors[stepId] = append(existingErrors[stepId], errors...)
	}
	return existingErrors
}
