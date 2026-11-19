package deployments

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/signing"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// ErrNotFound is returned when a channel or its deployment state does not exist.
var ErrNotFound = errors.New("not found")

// ChannelSource loads the channel to compile.
type ChannelSource interface {
	// Channel returns the compiler input for a channel, or ErrNotFound.
	Channel(ctx context.Context, channelID string) (compiler.Input, error)
}

// Prepared is a successfully prepared version of a channel.
type Prepared struct {
	ChannelID string
	SpaceID   string
	// Artifacts holds the plan, dependency bundle, payload schema and routing artifact.
	Artifacts []artifacts.Reference
	Policies  plan.Policies
}

func (p Prepared) artifact(kind string) artifacts.Reference {
	index := slices.IndexFunc(p.Artifacts, func(r artifacts.Reference) bool { return r.Kind == kind })
	if index < 0 {
		return artifacts.Reference{}
	}
	return p.Artifacts[index]
}

// Failure is a failed preparation of a channel.
type Failure struct {
	ChannelID string
	SpaceID   string
	Stage     string
	Message   string
}

// Observation is a runtime's report about a channel.
type Observation struct {
	ChannelID string
	Status    string
	Version   string
	Message   string
}

// Store persists deployment state.
type Store interface {
	// RecordPrepared records the artifacts and makes the plan the desired version.
	RecordPrepared(ctx context.Context, prepared Prepared) (State, error)
	// RecordFailure records a failed preparation, keeping the last prepared version as desired.
	RecordFailure(ctx context.Context, failure Failure) (State, error)
	// SetUnpublished sets the desired state to unpublished, or returns ErrNotFound.
	SetUnpublished(ctx context.Context, channelID string) (State, error)
	// Get returns the deployment state, or ErrNotFound.
	Get(ctx context.Context, channelID string) (State, error)
	// ArtifactExists reports whether a version of an artifact was prepared for the channel.
	ArtifactExists(ctx context.Context, channelID, kind, version string) (bool, error)
	// RecordObserved records a runtime's report, or returns ErrNotFound.
	RecordObserved(ctx context.Context, observation Observation) (State, error)
}

// PreparationError is returned when a channel could not be prepared. The failure is recorded in the
// deployment state.
type PreparationError struct {
	Stage string
	Err   error
}

func (e *PreparationError) Error() string {
	return fmt.Sprintf("%s failed: %v", e.Stage, e.Err)
}

func (e *PreparationError) Unwrap() error {
	return e.Err
}

// InvalidObservationError is returned when a runtime report is invalid.
type InvalidObservationError struct {
	Reason string
}

func (e *InvalidObservationError) Error() string {
	return "invalid observation: " + e.Reason
}

// Service prepares channel artifacts and records deployment state.
type Service struct {
	Channels  ChannelSource
	Resolver  compiler.Resolver
	Artifacts artifacts.Store
	Signer    *signing.Signer
	Store     Store
}

// Publish compiles the channel, signs and uploads its artifacts, and records the plan as the desired
// version. If any stage fails, the failure is recorded and a *PreparationError is returned; a channel
// that does not compile wraps a *compiler.Error with its diagnostics. Publishing does not change the
// observed state.
func (s *Service) Publish(ctx context.Context, channelID string) (State, error) {
	input, err := s.Channels.Channel(ctx, channelID)
	if err != nil {
		// Without the channel, there is no space to record a failure against.
		if errors.Is(err, ErrNotFound) {
			return State{}, err
		}
		return State{}, &PreparationError{Stage: StageLoad, Err: err}
	}

	fail := func(stage string, err error) (State, error) {
		state, recordErr := s.Store.RecordFailure(ctx, Failure{
			ChannelID: input.ChannelID,
			SpaceID:   input.SpaceID,
			Stage:     stage,
			Message:   err.Error(),
		})
		if recordErr != nil {
			return State{}, errors.Join(&PreparationError{Stage: stage, Err: err}, fmt.Errorf("record failure: %w", recordErr))
		}
		return state, &PreparationError{Stage: stage, Err: err}
	}

	result, err := compiler.Compile(ctx, input, s.Resolver)
	if err != nil {
		return fail(StageCompile, err)
	}
	if result.HasErrors() {
		return fail(StageCompile, &compiler.Error{Diagnostics: result.Diagnostics})
	}

	// Artifacts are uploaded after the artifacts they reference, so a reference never points to a
	// missing artifact.
	var references []artifacts.Reference
	for _, artifact := range result.Artifacts.Refs() {
		reference, err := artifacts.Upload(ctx, s.Artifacts, s.Signer, artifact.Ref, artifact.Data)
		if err != nil {
			return fail(StageUpload, err)
		}
		references = append(references, reference)
	}

	return s.Store.RecordPrepared(ctx, Prepared{
		ChannelID: input.ChannelID,
		SpaceID:   input.SpaceID,
		Artifacts: references,
		Policies:  result.Artifacts.Plan.Policies,
	})
}

// DraftRequest is a soft compilation request for a whole channel.
type DraftRequest struct {
	SpaceID   string
	ChannelID string
	// Config is a draft configuration to compile instead of the saved one, or nil.
	Config []byte
}

// CompileDraft soft-compiles a channel: it runs the same validation and type resolution as Publish
// and compiles the plan and dependency bundle, but uploads nothing, records nothing, and needs no
// runtime. The versions in the result are what Publish would produce for the same configuration and
// dependencies.
func (s *Service) CompileDraft(ctx context.Context, request DraftRequest) (*compiler.Result, error) {
	input, err := s.Channels.Channel(ctx, request.ChannelID)
	if err != nil {
		return nil, err
	}
	if input.SpaceID != request.SpaceID {
		return nil, ErrNotFound
	}
	if request.Config != nil {
		input.Config = request.Config
	}
	return compiler.Compile(ctx, input, s.Resolver)
}

// CompileStep soft-compiles a single step with the given upstream type context.
func (s *Service) CompileStep(ctx context.Context, spaceID string, step []byte, upstream *types.Type) (*compiler.StepResult, error) {
	return compiler.CompileStep(ctx, compiler.StepInput{SpaceID: spaceID, Step: step, UpstreamType: upstream}, s.Resolver)
}

// Unpublish sets the desired state to unpublished. Artifacts are kept, so that the observed version
// can still be resolved.
func (s *Service) Unpublish(ctx context.Context, channelID string) (State, error) {
	return s.Store.SetUnpublished(ctx, channelID)
}

// Status returns the deployment state of a channel, or ErrNotFound if it was never published.
func (s *Service) Status(ctx context.Context, channelID string) (State, error) {
	return s.Store.Get(ctx, channelID)
}

// RecordObserved records a runtime's acknowledgement of a channel. This is the boundary through which
// future runtime integration reports observed versions and status; it is the only way the observed
// state leaves "unknown". Applied and failed reports must name a plan version that was prepared for the
// channel.
func (s *Service) RecordObserved(ctx context.Context, observation Observation) (State, error) {
	statuses := []string{ObservedUnknown, ObservedApplied, ObservedFailed, ObservedStopped}
	if !slices.Contains(statuses, observation.Status) {
		return State{}, &InvalidObservationError{Reason: fmt.Sprintf("unknown status %q", observation.Status)}
	}
	if observation.Status == ObservedApplied || observation.Status == ObservedFailed {
		if observation.Version == "" {
			return State{}, &InvalidObservationError{Reason: fmt.Sprintf("status %q requires a version", observation.Status)}
		}
	}
	if observation.Version != "" {
		exists, err := s.Store.ArtifactExists(ctx, observation.ChannelID, plan.ArtifactPlan, observation.Version)
		if err != nil {
			return State{}, err
		}
		if !exists {
			return State{}, &InvalidObservationError{Reason: fmt.Sprintf("version %s was not prepared for channel %s", observation.Version, observation.ChannelID)}
		}
	}
	return s.Store.RecordObserved(ctx, observation)
}
