package artifacts

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// PutRouteEntry points a channel's entry in the routing table (routing.EntryKey) to its routing artifact,
// replacing the previous entry, and signs the entry's content. Source services pick the change up on
// their next reconciliation. A reader that sees the entry and its signature from different writes fails
// verification and keeps its previous routes until the next reconciliation.
func PutRouteEntry(ctx context.Context, store Store, signer *signing.Signer, metadata plan.Metadata, routingRef plan.ArtifactRef) error {
	if routingRef.Kind != plan.ArtifactRouting {
		return fmt.Errorf("route entry must reference a routing artifact, got %s", routingRef.Kind)
	}
	data, err := plan.Encode(routing.Entry{
		APIVersion: routing.APIVersion,
		Kind:       routing.KindRouteEntry,
		Metadata:   metadata,
		Routing:    routingRef,
	})
	if err != nil {
		return fmt.Errorf("encode route entry: %w", err)
	}
	envelope, err := json.Marshal(signer.Sign(plan.ArtifactRouteEntry, data.Version))
	if err != nil {
		return err
	}
	key := routing.EntryKey(metadata.ChannelID)
	if err := store.Put(ctx, key, data.Data, "application/json"); err != nil {
		return fmt.Errorf("write route entry %s: %w", key, err)
	}
	if err := store.Put(ctx, SignatureKey(key), envelope, "application/json"); err != nil {
		return fmt.Errorf("write route entry signature %s: %w", key, err)
	}
	return nil
}

// DeleteRouteEntry removes a channel from the routing table. Its artifacts are kept.
func DeleteRouteEntry(ctx context.Context, store Store, channelID string) error {
	key := routing.EntryKey(channelID)
	if err := store.Delete(ctx, key); err != nil {
		return fmt.Errorf("delete route entry %s: %w", key, err)
	}
	if err := store.Delete(ctx, SignatureKey(key)); err != nil {
		return fmt.Errorf("delete route entry signature %s: %w", key, err)
	}
	return nil
}
