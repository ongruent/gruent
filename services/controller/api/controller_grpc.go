package api

import (
	"context"
	"errors"

	pb "github.com/ongruent/gruent/libs/protocols/controller"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Deployments is the deployment service used by the gRPC API.
type Deployments interface {
	Publish(ctx context.Context, channelID string) (deployments.State, error)
	Unpublish(ctx context.Context, channelID string) (deployments.State, error)
	Status(ctx context.Context, channelID string) (deployments.State, error)
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
	if state.Plan != nil {
		deployment.Plan = &pb.ArtifactRef{Version: state.Plan.Version, StorageKey: state.Plan.StorageKey}
	}
	if state.Routing != nil {
		deployment.Routing = &pb.ArtifactRef{Version: state.Routing.Version, StorageKey: state.Routing.StorageKey}
	}
	return deployment
}
