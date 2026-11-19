package api

import (
	"context"
	"errors"
	"testing"

	pb "github.com/ongruent/gruent/libs/protocols/controller"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestChannelStatus(t *testing.T) {
	plan := &deployments.ArtifactRef{Version: "sha256:v2"}
	cases := map[string]struct {
		state deployments.State
		want  pb.ChannelStatus
	}{
		"prepared but not acknowledged": {
			state: deployments.State{DesiredState: deployments.DesiredPublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedUnknown},
			want:  pb.ChannelStatus_UNKNOWN,
		},
		"acknowledged": {
			state: deployments.State{DesiredState: deployments.DesiredPublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedApplied, ObservedVersion: "sha256:v2"},
			want:  pb.ChannelStatus_PUBLISHED,
		},
		"older version acknowledged": {
			state: deployments.State{DesiredState: deployments.DesiredPublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedApplied, ObservedVersion: "sha256:v1"},
			want:  pb.ChannelStatus_UNKNOWN,
		},
		"runtime failed": {
			state: deployments.State{DesiredState: deployments.DesiredPublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedFailed, ObservedVersion: "sha256:v2"},
			want:  pb.ChannelStatus_ERROR,
		},
		"preparation failed": {
			state: deployments.State{DesiredState: deployments.DesiredPublished, Plan: plan, PreparationStatus: deployments.PreparationFailed, ObservedStatus: deployments.ObservedApplied, ObservedVersion: "sha256:v2"},
			want:  pb.ChannelStatus_ERROR,
		},
		"unpublished but not acknowledged": {
			state: deployments.State{DesiredState: deployments.DesiredUnpublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedApplied, ObservedVersion: "sha256:v2"},
			want:  pb.ChannelStatus_UNKNOWN,
		},
		"stopped": {
			state: deployments.State{DesiredState: deployments.DesiredUnpublished, Plan: plan, PreparationStatus: deployments.PreparationReady, ObservedStatus: deployments.ObservedStopped},
			want:  pb.ChannelStatus_UNPUBLISHED,
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := channelStatus(tc.state); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

type fakeDeployments struct {
	state deployments.State
	err   error
}

func (f fakeDeployments) Publish(context.Context, string) (deployments.State, error) {
	return f.state, f.err
}

func (f fakeDeployments) Unpublish(context.Context, string) (deployments.State, error) {
	return f.state, f.err
}

func (f fakeDeployments) Status(context.Context, string) (deployments.State, error) {
	return f.state, f.err
}

func TestPublishErrors(t *testing.T) {
	cases := map[string]struct {
		err  error
		want codes.Code
	}{
		"not found":     {deployments.ErrNotFound, codes.NotFound},
		"compile error": {&deployments.PreparationError{Stage: deployments.StageCompile, Err: &compiler.Error{Problems: []string{"bad"}}}, codes.InvalidArgument},
		"upload error":  {&deployments.PreparationError{Stage: deployments.StageUpload, Err: errors.New("down")}, codes.Unavailable},
		"other":         {errors.New("boom"), codes.Internal},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			server := newControllerGRPC(fakeDeployments{err: tc.err})
			_, err := server.Publish(context.Background(), &pb.PublishRequest{ChannelId: "c1"})
			if got := status.Code(err); got != tc.want {
				t.Fatalf("got %v, want %v (%v)", got, tc.want, err)
			}
		})
	}
}

func TestStatusOfUnpublishedChannel(t *testing.T) {
	server := newControllerGRPC(fakeDeployments{err: deployments.ErrNotFound})
	response, err := server.Status(context.Background(), &pb.StatusRequest{ChannelId: "c1"})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetStatus() != pb.ChannelStatus_UNPUBLISHED || response.GetDeployment() != nil {
		t.Fatalf("unexpected response: %v", response)
	}
}
