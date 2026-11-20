package deployments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/ongruent/gruent/libs/engine/workers"
)

// HandleObservation records a runtime worker's observation message (workers.Observation).
//
// A replaced worker reports "stopped" for its old version after the new version is already desired, and
// possibly after the new worker reported "applied". Such stale reports are ignored, so they never
// overwrite the new version's state.
func (s *Service) HandleObservation(ctx context.Context, data []byte) (State, error) {
	var observation workers.Observation
	if err := json.Unmarshal(data, &observation); err != nil {
		return State{}, &InvalidObservationError{Reason: fmt.Sprintf("decode: %v", err)}
	}
	if observation.Kind != workers.KindObservation || observation.ChannelID == "" {
		return State{}, &InvalidObservationError{Reason: "not a runtime observation"}
	}
	if observation.Status == workers.StatusStopped {
		state, err := s.Store.Get(ctx, observation.ChannelID)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return State{}, err
		}
		if err == nil && state.DesiredState == DesiredPublished && state.DesiredVersion() != observation.PlanVersion {
			return state, nil
		}
	}
	return s.RecordObserved(ctx, Observation{
		ChannelID: observation.ChannelID,
		Status:    observation.Status,
		Version:   observation.PlanVersion,
		Message:   observation.Message,
	})
}
