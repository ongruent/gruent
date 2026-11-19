package api

import (
	"context"
	"encoding/json"
	"errors"

	pb "github.com/ongruent/gruent/libs/protocols/controller"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	"github.com/ongruent/gruent/services/controller/internal/types"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Deployments is the deployment service used by the gRPC API.
type Deployments interface {
	Publish(ctx context.Context, channelID string) (deployments.State, error)
	Unpublish(ctx context.Context, channelID string) (deployments.State, error)
	Status(ctx context.Context, channelID string) (deployments.State, error)
	CompileDraft(ctx context.Context, request deployments.DraftRequest) (*compiler.Result, error)
	CompileStep(ctx context.Context, spaceID string, step []byte, upstream *types.Type) (*compiler.StepResult, error)
}

type controllerGRPC struct {
	pb.UnimplementedControllerServiceServer
	deployments Deployments
}

func newControllerGRPC(deployments Deployments) *controllerGRPC {
	return &controllerGRPC{deployments: deployments}
}

func (c *controllerGRPC) Publish(ctx context.Context, request *pb.PublishRequest) (*pb.PublishResponse, error) {
	if request.GetChannelId() == "" {
		return nil, status.Error(codes.InvalidArgument, "channelId is required")
	}
	state, err := c.deployments.Publish(ctx, request.GetChannelId())
	if err != nil {
		return nil, grpcError(request.GetChannelId(), err)
	}
	return &pb.PublishResponse{Deployment: toProto(state)}, nil
}

func (c *controllerGRPC) Unpublish(ctx context.Context, request *pb.UnpublishRequest) (*pb.UnpublishResponse, error) {
	if request.GetChannelId() == "" {
		return nil, status.Error(codes.InvalidArgument, "channelId is required")
	}
	state, err := c.deployments.Unpublish(ctx, request.GetChannelId())
	if errors.Is(err, deployments.ErrNotFound) {
		// The channel was never published, so it is already unpublished.
		return &pb.UnpublishResponse{}, nil
	}
	if err != nil {
		return nil, grpcError(request.GetChannelId(), err)
	}
	return &pb.UnpublishResponse{Deployment: toProto(state)}, nil
}

func (c *controllerGRPC) Status(ctx context.Context, request *pb.StatusRequest) (*pb.StatusResponse, error) {
	if request.GetChannelId() == "" {
		return nil, status.Error(codes.InvalidArgument, "channelId is required")
	}
	state, err := c.deployments.Status(ctx, request.GetChannelId())
	if errors.Is(err, deployments.ErrNotFound) {
		return &pb.StatusResponse{Status: pb.ChannelStatus_UNPUBLISHED}, nil
	}
	if err != nil {
		return nil, grpcError(request.GetChannelId(), err)
	}
	return &pb.StatusResponse{Status: channelStatus(state), Deployment: toProto(state)}, nil
}

func (c *controllerGRPC) Compile(ctx context.Context, request *pb.CompileRequest) (*pb.CompileResponse, error) {
	if request.GetSpaceId() == "" {
		return nil, status.Error(codes.InvalidArgument, "spaceId is required")
	}

	if len(request.GetStepConfig()) > 0 {
		upstream, err := compiler.ParseType(request.GetUpstreamType())
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		result, err := c.deployments.CompileStep(ctx, request.GetSpaceId(), request.GetStepConfig(), upstream)
		if err != nil {
			return nil, grpcError(request.GetChannelId(), err)
		}
		return compileResponse(result.Diagnostics, []types.Resolved{result.Types}, nil)
	}

	if request.GetChannelId() == "" {
		return nil, status.Error(codes.InvalidArgument, "channelId or stepConfig is required")
	}
	draft := deployments.DraftRequest{SpaceID: request.GetSpaceId(), ChannelID: request.GetChannelId()}
	if len(request.GetChannelConfig()) > 0 {
		draft.Config = request.GetChannelConfig()
	}
	result, err := c.deployments.CompileDraft(ctx, draft)
	if err != nil {
		return nil, grpcError(request.GetChannelId(), err)
	}
	return compileResponse(result.Diagnostics, result.Types, result.Artifacts)
}

func compileResponse(diagnostics []compiler.Diagnostic, resolved []types.Resolved, artifacts *compiler.Artifacts) (*pb.CompileResponse, error) {
	encodedTypes, err := json.Marshal(resolved)
	if err != nil {
		return nil, status.Error(codes.Internal, "encode resolved types")
	}
	response := &pb.CompileResponse{Valid: true, ResolvedTypes: encodedTypes}
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == types.SeverityError {
			response.Valid = false
		}
		response.Diagnostics = append(response.Diagnostics, &pb.Diagnostic{
			Severity: diagnostic.Severity,
			Code:     diagnostic.Code,
			Message:  diagnostic.Message,
			StepId:   diagnostic.StepID,
			Path:     diagnostic.Path,
		})
	}
	if artifacts != nil {
		response.PlanVersion = artifacts.EncodedPlan.Version
		response.DependencyBundleVersion = artifacts.EncodedBundle.Version
		response.PayloadSchemaVersion = artifacts.EncodedSchema.Version
		response.RoutingVersion = artifacts.EncodedRouting.Version
	}
	return response, nil
}

// channelStatus summarizes a deployment state. Desired state alone never makes a channel PUBLISHED:
// that requires a runtime to acknowledge the desired version.
func channelStatus(state deployments.State) pb.ChannelStatus {
	if state.PreparationStatus == deployments.PreparationFailed {
		return pb.ChannelStatus_ERROR
	}
	switch state.DesiredState {
	case deployments.DesiredPublished:
		if state.Converged() {
			return pb.ChannelStatus_PUBLISHED
		}
		if state.ObservedStatus == deployments.ObservedFailed && state.ObservedVersion == state.DesiredVersion() {
			return pb.ChannelStatus_ERROR
		}
	case deployments.DesiredUnpublished:
		if state.ObservedStatus == deployments.ObservedStopped {
			return pb.ChannelStatus_UNPUBLISHED
		}
	}
	return pb.ChannelStatus_UNKNOWN
}

func grpcError(channelID string, err error) error {
	var compileErr *compiler.Error
	var preparationErr *deployments.PreparationError
	switch {
	case errors.Is(err, deployments.ErrNotFound):
		return status.Errorf(codes.NotFound, "channel %s not found", channelID)
	case errors.As(err, &compileErr):
		return status.Error(codes.InvalidArgument, compileErr.Error())
	case errors.As(err, &preparationErr):
		log.Error().Err(err).Str("channelId", channelID).Msg("channel preparation failed")
		return status.Errorf(codes.Unavailable, "could not prepare channel %s: %s failed", channelID, preparationErr.Stage)
	default:
		log.Error().Err(err).Str("channelId", channelID).Msg("controller request failed")
		return status.Error(codes.Internal, "internal error")
	}
}

func toProto(state deployments.State) *pb.Deployment {
	deployment := &pb.Deployment{
		ChannelId:               state.ChannelID,
		DesiredState:            state.DesiredState,
		MemoryMiB:               int32(state.MemoryMiB),
		MemoryReservationMiB:    int32(state.MemoryReservationMiB),
		MaxConcurrentExecutions: int32(state.MaxConcurrentExecutions),
		MaxQueuedExecutions:     int32(state.MaxQueuedExecutions),
		PreparationStatus:       state.PreparationStatus,
		PreparationErrorStage:   state.PreparationErrorStage,
		PreparationError:        state.PreparationError,
		ObservedStatus:          state.ObservedStatus,
		ObservedVersion:         state.ObservedVersion,
		ObservedMessage:         state.ObservedMessage,
	}
	deployment.Plan = artifactRef(state.Plan)
	deployment.DependencyBundle = artifactRef(state.DependencyBundle)
	deployment.PayloadSchema = artifactRef(state.PayloadSchema)
	deployment.Routing = artifactRef(state.Routing)
	return deployment
}

func artifactRef(ref *deployments.ArtifactRef) *pb.ArtifactRef {
	if ref == nil {
		return nil
	}
	return &pb.ArtifactRef{Version: ref.Version, StorageKey: ref.StorageKey}
}
