package agents

// DiscoverInstalled walks every adapter registered in r and returns those
// whose Detect reports the agent as present for homeDir. Detection logic
// itself (project-level vs. user-level, which files to check, ...) lives
// entirely inside each adapter's Detect implementation.
func (r *Registry) DiscoverInstalled(homeDir string) []Adapter {
	var found []Adapter
	for _, adapter := range r.adapters {
		if adapter.Detect(homeDir) {
			found = append(found, adapter)
		}
	}
	return found
}
