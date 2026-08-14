// Package pipeline implements a staged install pipeline with rollback
// support. Multi-file installs (MCP config, skills, system prompt) are
// composed as a sequence of Steps and executed atomically: either every
// step applies, or every step that already applied is undone.
package pipeline

// Step is a single unit of work in an install pipeline.
//
// Prepare validates preconditions without mutating any state (e.g. check
// that a target path is writable, or that required inputs exist). Apply
// performs the actual change. Rollback undoes Apply and is only invoked
// for a step whose Apply already succeeded, when a later step in the
// pipeline fails.
type Step struct {
	// Name identifies the step for reporting and rollback ordering. It
	// should be short and stable (e.g. "write-mcp-config").
	Name string

	// Prepare validates preconditions before any step's Apply runs. It
	// must not mutate state. A nil Prepare is treated as always-succeeding.
	Prepare func() error

	// Apply performs the change described by this step. A nil Apply is
	// treated as always-succeeding.
	Apply func() error

	// Rollback undoes the effect of Apply. It is only called for steps
	// whose Apply already succeeded. A nil Rollback means the step has
	// nothing to undo.
	Rollback func() error
}
