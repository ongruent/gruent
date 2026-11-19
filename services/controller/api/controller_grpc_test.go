package api

import (
	"context"
	"errors"
	"strings"
	"testing"

	pb "github.com/ongruent/gruent/libs/protocols/controller"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/deployments"
	"github.com/ongruent/gruent/services/controller/internal/types"
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
	state  deployments.State
	result *compiler.Result
	err    error
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

func (f fakeDeployments) CompileDraft(context.Context, deployments.DraftRequest) (*compiler.Result, error) {
	return f.result, f.err
}

func (f fakeDeployments) CompileStep(_ context.Context, _ string, _ []byte, upstream *types.Type) (*compiler.StepResult, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &compiler.StepResult{Diagnostics: []compiler.Diagnostic{}, Types: types.Resolved{StepID: "n1", Input: upstream, Output: upstream}}, nil
}

func TestPublishErrors(t *testing.T) {
	cases := map[string]struct {
		err  error
		want codes.Code
	}{
		"not found":     {deployments.ErrNotFound, codes.NotFound},
		"compile error": {&deployments.PreparationError{Stage: deployments.StageCompile, Err: &compiler.Error{Diagnostics: []compiler.Diagnostic{{Severity: "error", Message: "bad"}}}}, codes.InvalidArgument},
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

func TestCompile(t *testing.T) {
	server := newControllerGRPC(fakeDeployments{result: &compiler.Result{
		Diagnostics: []compiler.Diagnostic{{Severity: types.SeverityError, Code: "type_mismatch", Message: "bad", StepID: "n1"}},
		Types:       []types.Resolved{{StepID: "n1"}},
	}})
	response, err := server.Compile(context.Background(), &pb.CompileRequest{SpaceId: "s1", ChannelId: "c1"})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetValid() || len(response.GetDiagnostics()) != 1 || response.GetDiagnostics()[0].GetCode() != "type_mismatch" || response.GetPlanVersion() != "" {
		t.Fatalf("unexpected response: %v", response)
	}

	step, err := server.Compile(context.Background(), &pb.CompileRequest{SpaceId: "s1", StepConfig: []byte(`{}`), UpstreamType: []byte(`{"kind":"bytes"}`)})
	if err != nil {
		t.Fatal(err)
	}
	if !step.GetValid() || !strings.Contains(string(step.GetResolvedTypes()), `"kind":"bytes"`) {
		t.Fatalf("unexpected step response: %v", step)
	}

	for name, request := range map[string]*pb.CompileRequest{
		"no space":     {ChannelId: "c1"},
		"no target":    {SpaceId: "s1"},
		"invalid type": {SpaceId: "s1", StepConfig: []byte(`{}`), UpstreamType: []byte(`{"kind":1}`)},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := server.Compile(context.Background(), request); status.Code(err) != codes.InvalidArgument {
				t.Fatalf("got %v, want InvalidArgument", err)
			}
		})
	}
}
