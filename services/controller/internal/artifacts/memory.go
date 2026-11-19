package artifacts

import (
	"context"
	"sync"
)

// MemoryStore keeps artifacts in memory. It is meant for tests.
type MemoryStore struct {
	mu      sync.Mutex
	Objects map[string][]byte
	// Puts counts the objects written.
	Puts int
	// Err, if set, is returned by every call.
	Err error
}

// NewMemoryStore returns an empty MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{Objects: map[string][]byte{}}
}

// Exists implements Store.
func (s *MemoryStore) Exists(_ context.Context, key string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return false, s.Err
	}
	_, ok := s.Objects[key]
	return ok, nil
}

// Put implements Store.
func (s *MemoryStore) Put(_ context.Context, key string, data []byte, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return s.Err
	}
	s.Objects[key] = append([]byte(nil), data...)
	s.Puts++
	return nil
}

// Delete implements Store.
func (s *MemoryStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return s.Err
	}
	delete(s.Objects, key)
	return nil
}
