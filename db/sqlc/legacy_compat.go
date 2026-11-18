package db

import "context"

// AppThing is the previous name of AppConnection.
//
// Deprecated: Use AppConnection. This alias only exists so that libs/legacy, which is frozen and still
// refers to the old name, keeps compiling.
type AppThing = AppConnection

// GetThing is the previous name of GetConnection.
//
// Deprecated: Use GetConnection. This wrapper only exists so that libs/legacy, which is frozen and
// still refers to the old name, keeps compiling.
func (q *Queries) GetThing(ctx context.Context, id string) (AppConnection, error) {
	return q.GetConnection(ctx, id)
}
