package pipeline

import (
	"errors"
	"reflect"
	"testing"
)

// recorder tracks the order of lifecycle calls across steps built by the
// helpers below.
type recorder struct {
	order []string
}

func (r *recorder) log(entry string) {
	r.order = append(r.order, entry)
}

// step builds a Step that always succeeds and logs "prepare:<name>",
// "apply:<name>", and (if rolled back) "rollback:<name>".
func (r *recorder) step(name string) Step {
	return Step{
		Name: name,
		Prepare: func() error {
			r.log("prepare:" + name)
			return nil
		},
		Apply: func() error {
			r.log("apply:" + name)
			return nil
		},
		Rollback: func() error {
			r.log("rollback:" + name)
			return nil
		},
	}
}

func TestRunAppliesAllStepsInOrder(t *testing.T) {
	r := &recorder{}
	steps := []Step{r.step("a"), r.step("b"), r.step("c")}

	result := Run(steps)

	if !result.Success() {
		t.Fatalf("Run() error = %v, want success", result.Error)
	}
	if !reflect.DeepEqual(result.Applied, []string{"a", "b", "c"}) {
		t.Fatalf("Applied = %v, want [a b c]", result.Applied)
	}
	if len(result.Rolled) != 0 {
		t.Fatalf("Rolled = %v, want empty", result.Rolled)
	}

	wantOrder := []string{
		"prepare:a", "prepare:b", "prepare:c",
		"apply:a", "apply:b", "apply:c",
	}
	if !reflect.DeepEqual(r.order, wantOrder) {
		t.Fatalf("order = %v, want %v", r.order, wantOrder)
	}
}

func TestRunStopsOnPrepareFailureWithoutRollback(t *testing.T) {
	r := &recorder{}
	failErr := errors.New("bad precondition")

	steps := []Step{
		r.step("a"),
		{
			Name: "b",
			Prepare: func() error {
				r.log("prepare:b")
				return failErr
			},
			Apply: func() error {
				r.log("apply:b")
				return nil
			},
		},
		r.step("c"),
	}

	result := Run(steps)

	if result.Error == nil {
		t.Fatalf("Run() expected error")
	}
	if !errors.Is(result.Error, failErr) {
		t.Fatalf("Run() error = %v, want wrapping %v", result.Error, failErr)
	}
	if len(result.Applied) != 0 {
		t.Fatalf("Applied = %v, want empty (nothing should have applied)", result.Applied)
	}
	if len(result.Rolled) != 0 {
		t.Fatalf("Rolled = %v, want empty (nothing to roll back)", result.Rolled)
	}

	// Prepare stops at the first failure -- step c's Prepare must never run,
	// and no Apply must ever run.
	wantOrder := []string{"prepare:a", "prepare:b"}
	if !reflect.DeepEqual(r.order, wantOrder) {
		t.Fatalf("order = %v, want %v", r.order, wantOrder)
	}
}

func TestRunRollsBackAppliedStepsInReverseOnApplyFailure(t *testing.T) {
	r := &recorder{}
	failErr := errors.New("apply boom")

	steps := []Step{
		r.step("a"),
		r.step("b"),
		{
			Name: "c",
			Prepare: func() error {
				r.log("prepare:c")
				return nil
			},
			Apply: func() error {
				r.log("apply:c")
				return failErr
			},
			Rollback: func() error {
				r.log("rollback:c")
				return nil
			},
		},
		r.step("d"),
	}

	result := Run(steps)

	if result.Error == nil {
		t.Fatalf("Run() expected error")
	}
	if !errors.Is(result.Error, failErr) {
		t.Fatalf("Run() error = %v, want wrapping %v", result.Error, failErr)
	}
	if !reflect.DeepEqual(result.Applied, []string{"a", "b"}) {
		t.Fatalf("Applied = %v, want [a b]", result.Applied)
	}
	// Rollback runs in reverse order of application; step c's own Apply
	// failed so it was never "applied" and is not rolled back.
	if !reflect.DeepEqual(result.Rolled, []string{"b", "a"}) {
		t.Fatalf("Rolled = %v, want [b a]", result.Rolled)
	}
	if len(result.RollbackErrors) != 0 {
		t.Fatalf("RollbackErrors = %v, want empty", result.RollbackErrors)
	}

	// d must never run -- pipeline stopped at c's Apply failure.
	wantOrder := []string{
		"prepare:a", "prepare:b", "prepare:c", "prepare:d",
		"apply:a", "apply:b", "apply:c",
		"rollback:b", "rollback:a",
	}
	if !reflect.DeepEqual(r.order, wantOrder) {
		t.Fatalf("order = %v, want %v", r.order, wantOrder)
	}
}

func TestRunCollectsRollbackErrorsWithoutMaskingOriginalError(t *testing.T) {
	r := &recorder{}
	applyErr := errors.New("apply boom")
	rollbackErr := errors.New("rollback boom")

	steps := []Step{
		r.step("a"),
		{
			Name: "b",
			Prepare: func() error {
				return nil
			},
			Apply: func() error {
				r.log("apply:b")
				return nil
			},
			Rollback: func() error {
				r.log("rollback:b")
				return rollbackErr
			},
		},
		{
			Name: "c",
			Prepare: func() error {
				return nil
			},
			Apply: func() error {
				r.log("apply:c")
				return applyErr
			},
		},
	}

	result := Run(steps)

	if !errors.Is(result.Error, applyErr) {
		t.Fatalf("Error = %v, want wrapping %v", result.Error, applyErr)
	}
	if len(result.RollbackErrors) != 1 || !errors.Is(result.RollbackErrors[0], rollbackErr) {
		t.Fatalf("RollbackErrors = %v, want one error wrapping %v", result.RollbackErrors, rollbackErr)
	}
	// b's rollback failed, so it must not appear in Rolled; a's rollback
	// succeeded and must still be attempted despite b's failure.
	if !reflect.DeepEqual(result.Rolled, []string{"a"}) {
		t.Fatalf("Rolled = %v, want [a]", result.Rolled)
	}
}

func TestRunWithNilApplyAndRollbackIsANoOp(t *testing.T) {
	steps := []Step{
		{Name: "noop"},
	}

	result := Run(steps)

	if !result.Success() {
		t.Fatalf("Run() error = %v, want success", result.Error)
	}
	if !reflect.DeepEqual(result.Applied, []string{"noop"}) {
		t.Fatalf("Applied = %v, want [noop]", result.Applied)
	}
}

func TestRunEmptyPipelineSucceeds(t *testing.T) {
	result := Run(nil)

	if !result.Success() {
		t.Fatalf("Run() error = %v, want success", result.Error)
	}
	if len(result.Applied) != 0 {
		t.Fatalf("Applied = %v, want empty", result.Applied)
	}
}
