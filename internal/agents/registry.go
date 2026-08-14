package agents

import (
	"errors"
	"fmt"
)

// ErrDuplicateAdapter is returned by Register when an adapter for the same
// AgentID has already been registered.
var ErrDuplicateAdapter = errors.New("adapter already registered")

// Registry holds the set of known Adapters, keyed by AgentID. It is the
// single place callers go to look up or enumerate agent integrations.
type Registry struct {
	adapters map[AgentID]Adapter
}

// NewRegistry builds a Registry from zero or more adapters. Registration
// happens through Register, so a duplicate AgentID fails construction.
func NewRegistry(adapters ...Adapter) (*Registry, error) {
	r := &Registry{
		adapters: make(map[AgentID]Adapter),
	}
	for _, adapter := range adapters {
		if err := r.Register(adapter); err != nil {
			return nil, err
		}
	}
	return r, nil
}

// Register adds an adapter to the registry. It returns ErrDuplicateAdapter
// if an adapter for the same AgentID is already registered, guarding
// against accidental double-registration at construction time.
func (r *Registry) Register(adapter Adapter) error {
	if adapter == nil {
		return errors.New("adapter is nil")
	}

	id := adapter.Agent()
	if _, exists := r.adapters[id]; exists {
		return fmt.Errorf("%w: %s", ErrDuplicateAdapter, id)
	}

	r.adapters[id] = adapter
	return nil
}

// Get returns the adapter registered for id, if any.
func (r *Registry) Get(id AgentID) (Adapter, bool) {
	adapter, ok := r.adapters[id]
	return adapter, ok
}

// List returns every registered adapter, in no particular order.
func (r *Registry) List() []Adapter {
	list := make([]Adapter, 0, len(r.adapters))
	for _, adapter := range r.adapters {
		list = append(list, adapter)
	}
	return list
}
