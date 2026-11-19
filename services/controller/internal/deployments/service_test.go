package deployments

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
	"github.com/ongruent/gruent/services/controller/internal/compiler"
	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// memoryStore implements Store in memory, with the same semantics as the Postgres queries.
type memoryStore struct {
	states    map[string]State
	artifacts map[string]bool
}

func newMemoryStore() *memoryStore {
	return &memoryStore{states: map[string]State{}, artifacts: map[string]bool{}}
}

func (m *memoryStore) state(channelID, spaceID string) State {
	state, ok := m.states[channelID]
	if !ok {
		state = State{ChannelID: channelID, SpaceID: spaceID, ObservedStatus: ObservedUnknown}
	}
	return state
}

func (m *memoryStore) RecordPrepared(_ context.Context, p Prepared) (State, error) {
	for _, reference := range p.Artifacts {
		m.artifacts[p.ChannelID+reference.Kind+reference.Version] = true
	}
	ref := func(kind string) *ArtifactRef {
		reference := p.artifact(kind)
		return &ArtifactRef{Version: reference.Version, StorageKey: reference.Key}
	}
	state := m.state(p.ChannelID, p.SpaceID)
	state.DesiredState = DesiredPublished
	state.Plan = ref(plan.ArtifactPlan)
	state.DependencyBundle = ref(plan.ArtifactDependencyBundle)
	state.PayloadSchema = ref(plan.ArtifactPayloadSchema)
	state.Routing = ref(plan.ArtifactRouting)
	state.MemoryMiB = p.Policies.Deployment.Resources.MemoryMiB
	state.MemoryReservationMiB = p.Policies.Deployment.Resources.MemoryReservationMiB
	state.MaxConcurrentExecutions = p.Policies.Runtime.Concurrency.MaxConcurrentExecutions
	state.MaxQueuedExecutions = p.Policies.Runtime.Concurrency.MaxQueuedExecutions
	state.PreparationStatus, state.PreparationErrorStage, state.PreparationError = PreparationReady, "", ""
	m.states[p.ChannelID] = state
	return state, nil
}

func (m *memoryStore) RecordFailure(_ context.Context, f Failure) (State, error) {
	state := m.state(f.ChannelID, f.SpaceID)
	state.DesiredState = DesiredPublished
	state.PreparationStatus, state.PreparationErrorStage, state.PreparationError = PreparationFailed, f.Stage, f.Message
	m.states[f.ChannelID] = state
	return state, nil
}

func (m *memoryStore) SetUnpublished(_ context.Context, channelID string) (State, error) {
	state, ok := m.states[channelID]
	if !ok {
		return State{}, ErrNotFound
	}
	state.DesiredState = DesiredUnpublished
	m.states[channelID] = state
	return state, nil
}

func (m *memoryStore) Get(_ context.Context, channelID string) (State, error) {
	state, ok := m.states[channelID]
	if !ok {
		return State{}, ErrNotFound
	}
	return state, nil
}

func (m *memoryStore) ArtifactExists(_ context.Context, channelID, kind, version string) (bool, error) {
	return m.artifacts[channelID+kind+version], nil
}

func (m *memoryStore) RecordObserved(_ context.Context, o Observation) (State, error) {
	state, ok := m.states[o.ChannelID]
	if !ok {
		return State{}, ErrNotFound
	}
	state.ObservedStatus, state.ObservedVersion, state.ObservedMessage = o.Status, o.Version, o.Message
	m.states[o.ChannelID] = state
	return state, nil
}

type channels map[string][]byte

func (c channels) Channel(_ context.Context, channelID string) (compiler.Input, error) {
	config, ok := c[channelID]
	if !ok {
		return compiler.Input{}, ErrNotFound
	}
	return compiler.Input{OrgID: "o1", SpaceID: "s1", ChannelID: channelID, ChannelName: "Channel", Config: config}, nil
}

type noDependencies struct{}

func (noDependencies) Model(context.Context, string, string) (compiler.ModelRecord, error) {
	return compiler.ModelRecord{}, compiler.ErrNotFound
}

func (noDependencies) Connection(context.Context, string, string) (compiler.ConnectionRecord, error) {
	return compiler.ConnectionRecord{}, compiler.ErrNotFound
}

const testSeed = "gn4yyRDEl9VZSnQMZDkd8Uz3KjkDDKZ3v181dnFB7ok="

func testSigner() *signing.Signer {
	signer, err := signing.NewSigner("test", testSeed)
	if err != nil {
		panic(err)
	}
	return signer
}

func timerChannel(memoryMiB int) []byte {
	config := map[string]any{
		"runtime": map[string]any{"memoryMiB": memoryMiB, "maxConcurrentExecutions": 4},
		"nodes": []any{
			map[string]any{"id": "n1", "metadata": map[string]any{"type": "source", "label": "timer", "config": map[string]any{"cronExpression": "* * * * *"}}},
			map[string]any{"id": "n2", "metadata": map[string]any{"type": "action", "label": "log", "config": map[string]any{}}},
		},
		"edges": []any{map[string]any{"from": map[string]any{"nodeId": "n1"}, "to": map[string]any{"nodeId": "n2"}}},
	}
	data, _ := json.Marshal(config)
	return data
}

func newService(config []byte) (*Service, *artifacts.MemoryStore, *memoryStore, channels) {
	files := artifacts.NewMemoryStore()
	store := newMemoryStore()
	source := channels{"c1": config}
	return &Service{Channels: source, Resolver: noDependencies{}, Artifacts: files, Signer: testSigner(), Store: store}, files, store, source
}

func TestPublishRecordsDesiredStateWithoutObservingIt(t *testing.T) {
	service, files, _, _ := newService(timerChannel(256))
	state, err := service.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}

	if state.DesiredState != DesiredPublished || state.PreparationStatus != PreparationReady {
		t.Fatalf("unexpected state: %+v", state)
	}
	if state.Plan == nil || state.DependencyBundle == nil || state.PayloadSchema == nil || state.Routing == nil {
		t.Fatal("artifact references were not recorded")
	}
	if state.MemoryMiB != 256 || state.MemoryReservationMiB != 256 || state.MaxConcurrentExecutions != 4 {
		t.Fatalf("resource contract was not recorded: %+v", state)
	}
	if state.ObservedStatus != ObservedUnknown || state.Converged() {
		t.Fatalf("uploading artifacts must not be reported as a deployment: %+v", state)
	}

	planData, ok := files.Objects[state.Plan.StorageKey]
	if !ok {
		t.Fatalf("plan %s was not uploaded", state.Plan.StorageKey)
	}
	// Consumers can verify every uploaded artifact against the signer's public key.
	keyring, err := signing.NewKeyring(map[string]string{"test": testSigner().PublicKey()})
	if err != nil {
		t.Fatal(err)
	}
	for kind, ref := range map[string]*ArtifactRef{
		plan.ArtifactPlan:             state.Plan,
		plan.ArtifactDependencyBundle: state.DependencyBundle,
		plan.ArtifactPayloadSchema:    state.PayloadSchema,
		plan.ArtifactRouting:          state.Routing,
	} {
		var envelope signing.Envelope
		if err := json.Unmarshal(files.Objects[artifacts.SignatureKey(ref.StorageKey)], &envelope); err != nil {
			t.Fatalf("%s signature: %v", kind, err)
		}
		if err := keyring.Verify(kind, ref.Version, files.Objects[ref.StorageKey], envelope); err != nil {
			t.Fatalf("%s does not verify: %v", kind, err)
		}
	}
	var published plan.Plan
	if err := json.Unmarshal(planData, &published); err != nil {
		t.Fatal(err)
	}
	if published.Dependencies.Version != state.DependencyBundle.Version || published.Payloads.Schema.Version != state.PayloadSchema.Version {
		t.Fatal("the plan does not pin the recorded dependency bundle and payload schema")
	}
	var routingArtifact plan.RoutingArtifact
	if err := json.Unmarshal(files.Objects[state.Routing.StorageKey], &routingArtifact); err != nil {
		t.Fatal(err)
	}
	if routingArtifact.PlanVersion != state.Plan.Version {
		t.Fatalf("routing artifact references %s, want %s", routingArtifact.PlanVersion, state.Plan.Version)
	}

	// Publishing an unchanged channel again uploads no artifact; only the routing table entry and its
	// signature are rewritten, with the same content.
	puts := files.Puts
	entry := string(files.Objects[routing.EntryKey("c1")])
	again, err := service.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if again.Plan.Version != state.Plan.Version || files.Puts != puts+2 || string(files.Objects[routing.EntryKey("c1")]) != entry {
		t.Fatal("republishing an unchanged channel created a new version")
	}
}

func TestCompileFailureKeepsLastPreparedVersion(t *testing.T) {
	service, _, _, source := newService(timerChannel(256))
	prepared, err := service.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}

	source["c1"] = timerChannel(1) // below the minimum memory budget
	state, err := service.Publish(context.Background(), "c1")
	var preparationErr *PreparationError
	var compileErr *compiler.Error
	if !errors.As(err, &preparationErr) || preparationErr.Stage != StageCompile || !errors.As(err, &compileErr) {
		t.Fatalf("expected a compile failure, got %v", err)
	}
	if state.PreparationStatus != PreparationFailed || state.PreparationErrorStage != StageCompile || state.PreparationError == "" {
		t.Fatalf("failure was not recorded: %+v", state)
	}
	if state.DesiredVersion() != prepared.DesiredVersion() {
		t.Fatal("a failed publish replaced the desired version")
	}
}

func TestUploadFailureIsRecorded(t *testing.T) {
	service, files, _, _ := newService(timerChannel(256))
	files.Err = errors.New("storage unavailable")
	state, err := service.Publish(context.Background(), "c1")
	var preparationErr *PreparationError
	if !errors.As(err, &preparationErr) || preparationErr.Stage != StageUpload {
		t.Fatalf("expected an upload failure, got %v", err)
	}
	if state.PreparationStatus != PreparationFailed || state.PreparationErrorStage != StageUpload || state.Plan != nil {
		t.Fatalf("unexpected state: %+v", state)
	}
}

func TestPublishUnknownChannel(t *testing.T) {
	service, _, _, _ := newService(timerChannel(256))
	if _, err := service.Publish(context.Background(), "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRecordObserved(t *testing.T) {
	service, _, _, _ := newService(timerChannel(256))
	state, err := service.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}

	var invalid *InvalidObservationError
	if _, err := service.RecordObserved(context.Background(), Observation{ChannelID: "c1", Status: "running", Version: state.DesiredVersion()}); !errors.As(err, &invalid) {
		t.Fatalf("expected an unknown status to be rejected, got %v", err)
	}
	if _, err := service.RecordObserved(context.Background(), Observation{ChannelID: "c1", Status: ObservedApplied}); !errors.As(err, &invalid) {
		t.Fatalf("expected an applied report without a version to be rejected, got %v", err)
	}
	if _, err := service.RecordObserved(context.Background(), Observation{ChannelID: "c1", Status: ObservedApplied, Version: "sha256:other"}); !errors.As(err, &invalid) {
		t.Fatalf("expected an unprepared version to be rejected, got %v", err)
	}

	observed, err := service.RecordObserved(context.Background(), Observation{ChannelID: "c1", Status: ObservedApplied, Version: state.DesiredVersion()})
	if err != nil {
		t.Fatal(err)
	}
	if !observed.Converged() {
		t.Fatalf("expected the acknowledged desired version to converge: %+v", observed)
	}

	unpublished, err := service.Unpublish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if unpublished.DesiredState != DesiredUnpublished || unpublished.Converged() {
		t.Fatalf("unexpected state after unpublishing: %+v", unpublished)
	}
}

func TestCompileDraftDoesNotPublish(t *testing.T) {
	service, files, store, _ := newService(timerChannel(256))

	result, err := service.CompileDraft(context.Background(), DraftRequest{SpaceID: "s1", ChannelID: "c1", Config: timerChannel(512)})
	if err != nil {
		t.Fatal(err)
	}
	if result.HasErrors() || result.Artifacts == nil {
		t.Fatalf("unexpected diagnostics: %+v", result.Diagnostics)
	}
	if files.Puts != 0 || len(store.states) != 0 {
		t.Fatal("soft compilation uploaded artifacts or recorded state")
	}

	// The draft compiles to the version Publish produces for the same configuration.
	published, _, _, _ := newService(timerChannel(512))
	state, err := published.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if state.DesiredVersion() != result.Artifacts.EncodedPlan.Version {
		t.Fatal("soft compilation and publication disagree")
	}

	invalid, err := service.CompileDraft(context.Background(), DraftRequest{SpaceID: "s1", ChannelID: "c1", Config: timerChannel(1)})
	if err != nil || !invalid.HasErrors() {
		t.Fatalf("expected diagnostics for an invalid draft, got %+v (%v)", invalid, err)
	}
	if _, err := service.CompileDraft(context.Background(), DraftRequest{SpaceID: "other", ChannelID: "c1"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected a channel in another space to be hidden, got %v", err)
	}
}
