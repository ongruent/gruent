package channelsCompile

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	pbController "github.com/ongruent/gruent/libs/protocols/controller"
	"github.com/ongruent/gruent/services/http-api/config"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/otel/attribute"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.ChannelId", request.Input.ChannelId),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	// TODO: Add TLS to this connection for production
	controllerConn, err := grpc.NewClient(config.VaultConf.ControllerGrpcServiceUrl,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
	)
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "grpc_request"),
			attribute.String("error.message", fmt.Sprintf("failed to setup controller grpc client: endpoint is %v and error is %v", config.VaultConf.ControllerGrpcServiceUrl, err)),
		)
		return nil, unavailable()
	}
	defer controllerConn.Close()

	client := pbController.NewControllerServiceClient(controllerConn)
	ctx, cancel := context.WithTimeout(request.Context, time.Second*5)
	defer cancel()
	response, err := client.Compile(ctx, &pbController.CompileRequest{
		SpaceId:       request.Input.SpaceId,
		ChannelId:     request.Input.ChannelId,
		ChannelConfig: request.Input.Config,
		StepConfig:    request.Input.Step,
		UpstreamType:  request.Input.UpstreamType,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "grpc_request"),
			attribute.String("error.message", fmt.Sprintf("could not compile the channel: %s", err)),
		)
		switch status.Code(err) {
		case codes.InvalidArgument:
			response := gruenthttp.NewErrorResponse([]any{status.Convert(err).Message()})
			responseJson, _ := response.MarshalJson()
			return nil, fiber.NewError(fiber.StatusBadRequest, string(responseJson))
		case codes.NotFound:
			response := gruenthttp.NewErrorResponse([]any{fmt.Sprintf("no channel found with ID %s", request.Input.ChannelId)})
			responseJson, _ := response.MarshalJson()
			return nil, fiber.NewError(fiber.StatusNotFound, string(responseJson))
		}
		return nil, unavailable()
	}

	output := &Output{
		Valid:       response.GetValid(),
		Diagnostics: []Diagnostic{},
		Types:       json.RawMessage(response.GetResolvedTypes()),
	}
	for _, diagnostic := range response.GetDiagnostics() {
		output.Diagnostics = append(output.Diagnostics, Diagnostic{
			Severity: diagnostic.GetSeverity(),
			Code:     diagnostic.GetCode(),
			Message:  diagnostic.GetMessage(),
			StepId:   diagnostic.GetStepId(),
			Path:     diagnostic.GetPath(),
		})
	}
	if response.GetPlanVersion() != "" {
		output.Versions = &ArtifactVersions{
			Plan:             response.GetPlanVersion(),
			DependencyBundle: response.GetDependencyBundleVersion(),
			PayloadSchema:    response.GetPayloadSchemaVersion(),
			Routing:          response.GetRoutingVersion(),
		}
	}
	return output, nil
}

func unavailable() error {
	response := gruenthttp.NewErrorResponse([]any{"Could not compile the channel at this time. Please try again."})
	responseJson, _ := response.MarshalJson()
	return fiber.NewError(fiber.StatusServiceUnavailable, string(responseJson))
}
