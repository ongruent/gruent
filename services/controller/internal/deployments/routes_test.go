package deployments

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
)

// storageReader reads the controller's artifact store the way a source service reads file storage.
type storageReader struct{ files *artifacts.MemoryStore }

func (r storageReader) List(_ context.Context, prefix string) ([]string, error) {
	var keys []string
	for key := range r.files.Objects {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return keys, nil
}

func (r storageReader) Get(_ context.Context, key string) ([]byte, error) {
	data, ok := r.files.Objects[key]
	if !ok {
		return nil, fmt.Errorf("%s: %w", key, routing.ErrObjectNotFound)
	}
	return data, nil
}

// Source services only see file storage: publishing adds the channel to the routing table they reconcile,
// and unpublishing removes it.
func TestPublishedChannelsAreRoutedBySourceServices(t *testing.T) {
	service, files, _, _ := newService(timerChannel(256))
	keyring, err := signing.NewKeyring(map[string]string{"test": testSigner().PublicKey()})
	if err != nil {
		t.Fatal(err)
	}
	reconciler := &routing.Reconciler{Reader: storageReader{files}, Keyring: keyring, Table: routing.NewTable()}

	state, err := service.Publish(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	changes, err := reconciler.Reconcile(context.Background())
	if err != nil || !slices.Equal(changes.Applied, []string{"c1"}) || len(changes.Failed) > 0 {
		t.Fatalf("unexpected reconciliation %+v, %v", changes, err)
	}
	if reconciler.Table.Version("c1") != state.Routing.Version {
		t.Fatalf("routed version %s, want %s", reconciler.Table.Version("c1"), state.Routing.Version)
	}
	timers := reconciler.Table.Timers()
	if len(timers) != 1 || timers[0].PlanVersion != state.Plan.Version || timers[0].Binding.Subject != routing.InvocationSubject("c1") {
		t.Fatalf("unexpected timer routes %+v", timers)
	}

	if _, err := service.Unpublish(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
	if _, ok := files.Objects[routing.EntryKey("c1")]; ok {
		t.Fatal("unpublishing kept the routing table entry")
	}
	if _, ok := files.Objects[state.Routing.StorageKey]; !ok {
		t.Fatal("unpublishing deleted the routing artifact")
	}
	changes, err = reconciler.Reconcile(context.Background())
	if err != nil || !slices.Equal(changes.Removed, []string{"c1"}) || len(reconciler.Table.Timers()) != 0 {
		t.Fatalf("unexpected reconciliation %+v, %v", changes, err)
	}
}
