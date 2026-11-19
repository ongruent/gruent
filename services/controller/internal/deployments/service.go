package deployments

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/plan"
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
	Plan      artifacts.Reference
	Routing   artifacts.Reference
	Policies  plan.Policies
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
	ArtifactExists(ctx context.Context, channelID string, kind artifacts.Kind, version string) (bool, error)
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
	Store     Store
}

// Publish compiles the channel, uploads its artifacts, and records the plan as the desired version.
// If any stage fails, the failure is recorded and a *PreparationError is returned. Publishing does not
// change the observed state.
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

	// Upload the plan before the routing artifact, so that a routing artifact never references a plan
	// that is not in storage.
	planRef, err := artifacts.Upload(ctx, s.Artifacts, input.OrgID, input.SpaceID, input.ChannelID, artifacts.KindExecutionPlan, result.EncodedPlan)
	if err != nil {
		return fail(StageUpload, err)
	}
	routingRef, err := artifacts.Upload(ctx, s.Artifacts, input.OrgID, input.SpaceID, input.ChannelID, artifacts.KindRouting, result.EncodedRouting)
	if err != nil {
		return fail(StageUpload, err)
	}

	return s.Store.RecordPrepared(ctx, Prepared{
		ChannelID: input.ChannelID,
		SpaceID:   input.SpaceID,
		Plan:      planRef,
		Routing:   routingRef,
		Policies:  result.Plan.Policies,
	})
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
// state leaves "unknown". Applied and failed reports must name an execution plan version that was
// prepared for the channel.
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
		exists, err := s.Store.ArtifactExists(ctx, observation.ChannelID, artifacts.KindExecutionPlan, observation.Version)
		if err != nil {
			return State{}, err
		}
		if !exists {
			return State{}, &InvalidObservationError{Reason: fmt.Sprintf("version %s was not prepared for channel %s", observation.Version, observation.ChannelID)}
		}
	}
	return s.Store.RecordObserved(ctx, observation)
}
