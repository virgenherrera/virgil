package pipeline

import "fmt"

// Result reports the outcome of running a pipeline of Steps.
type Result struct {
	// Applied holds the names of steps whose Apply succeeded, in
	// execution order.
	Applied []string

	// Rolled holds the names of steps that were successfully rolled
	// back, in the order rollback was attempted (reverse of Applied).
	Rolled []string

	// Error is the failure that stopped the pipeline: a Prepare error or
	// an Apply error. Nil means every step applied successfully.
	Error error

	// RollbackErrors collects any errors raised while rolling back
	// applied steps after Error occurred. These never replace Error --
	// the original failure remains the reported cause.
	RollbackErrors []error
}

// Success reports whether every step applied without error.
func (r Result) Success() bool {
	return r.Error == nil
}

// Run executes steps in two phases:
//
//  1. All Prepare funcs run in order. If any fails, Run stops immediately
//     and returns -- no step has applied anything yet, so there is
//     nothing to roll back.
//  2. All Apply funcs run in order. If step N's Apply fails, steps
//     0..N-1 (which already applied) are rolled back in reverse order,
//     and Run returns with the original Apply error.
//
// Rollback errors are collected on the result but never mask Error.
func Run(steps []Step) Result {
	var result Result

	for _, step := range steps {
		if step.Prepare == nil {
			continue
		}
		if err := step.Prepare(); err != nil {
			result.Error = fmt.Errorf("prepare %q: %w", step.Name, err)
			return result
		}
	}

	for i, step := range steps {
		if step.Apply != nil {
			if err := step.Apply(); err != nil {
				result.Error = fmt.Errorf("apply %q: %w", step.Name, err)
				result.rollback(steps[:i])
				return result
			}
		}
		result.Applied = append(result.Applied, step.Name)
	}

	return result
}

// rollback undoes previously applied steps in reverse order. It is only
// called after an Apply failure, so every step in applied already
// succeeded.
func (r *Result) rollback(applied []Step) {
	for i := len(applied) - 1; i >= 0; i-- {
		step := applied[i]
		if step.Rollback == nil {
			continue
		}
		if err := step.Rollback(); err != nil {
			r.RollbackErrors = append(r.RollbackErrors, fmt.Errorf("rollback %q: %w", step.Name, err))
			continue
		}
		r.Rolled = append(r.Rolled, step.Name)
	}
}
