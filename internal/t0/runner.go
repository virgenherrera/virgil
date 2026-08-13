package t0

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"time"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

const (
	defaultProcessTimeout = 5 * time.Second
	defaultMaxOutputBytes = int64(1 << 20)
	maximumProcessTimeout = 30 * time.Second
	maximumOutputBytes    = int64(8 << 20)
)

type Runner struct {
	registry *contracts.Registry
}

func NewRunner(registry *contracts.Registry) *Runner {
	return &Runner{registry: registry}
}

func (runner *Runner) Run(ctx context.Context, envelope wire.RunT0Envelope) wire.RunT0Result {
	result := wire.RunT0Result{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "run_t0_result",
		Outcome:         "failed",
		Scenarios:       []wire.ScenarioResult{},
	}
	if _, _, err := effectiveLimits(envelope.Limits); err != nil {
		return failRequested(result, envelope.FixtureIDs, "environment_failure", "RUN_LIMITS_INVALID", err.Error())
	}

	fixtures, err := runner.registry.LoadAllT0Fixtures()
	if err != nil {
		return failRequested(result, envelope.FixtureIDs, "fixture_failure", "FIXTURE_CONTRACT_INVALID", "canonical T0 fixture validation failed")
	}
	selected, failure := selectFixtures(envelope.FixtureIDs, fixtures)
	if failure != nil {
		result.Scenarios = append(result.Scenarios, *failure)
		return result
	}
	if err := validateRoots(envelope.WorkspaceRoot, envelope.EvidenceRoot); err != nil {
		return failRequested(result, selected, "environment_failure", "ISOLATION_ROOT_INVALID", err.Error())
	}
	if err := requireExistingDirectory(envelope.WorkspaceRoot); err != nil {
		return failRequested(result, selected, "environment_failure", "WORKSPACE_UNAVAILABLE", "isolated workspace must already exist")
	}
	if err := requireExistingDirectory(envelope.EvidenceRoot); err != nil {
		return failRequested(result, selected, "environment_failure", "EVIDENCE_ROOT_UNAVAILABLE", "isolated evidence root must already exist")
	}

	for _, fixtureID := range selected {
		result.Scenarios = append(result.Scenarios, runner.runFixture(ctx, envelope, fixtures[fixtureID]))
	}
	result.Outcome = "passed"
	for _, scenario := range result.Scenarios {
		if scenario.Outcome != "passed" {
			result.Outcome = "failed"
			break
		}
	}
	return result
}

func requireExistingDirectory(root string) error {
	info, err := os.Lstat(root)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("root is not a real directory")
	}
	return nil
}

func (runner *Runner) runFixture(ctx context.Context, envelope wire.RunT0Envelope, fixture contracts.Fixture) wire.ScenarioResult {
	scenario := wire.ScenarioResult{
		FixtureID: fixture.Definition.FixtureID,
		Outcome:   "failed",
		Processes: []wire.ProcessObservation{},
		Checks: []wire.CheckResult{
			{CheckID: "fixture-contract", Status: "passed", Detail: "fixture and ActorScript satisfy bundled canonical contracts"},
		},
	}

	targetRoot := filepath.Join(envelope.WorkspaceRoot, fixture.Definition.FixtureID, "target")
	if err := os.MkdirAll(targetRoot, 0o700); err != nil {
		return failScenario(scenario, "environment_failure", "TARGET_UNAVAILABLE", "cannot materialize isolated target")
	}
	baseline, err := captureCheckpoint(targetRoot, fixture.Definition.InitialRequest.ArtifactStoreRef.Namespace)
	if err != nil {
		return failScenario(scenario, "environment_failure", "WORKSPACE_SNAPSHOT_FAILED", "cannot snapshot workspace baseline")
	}

	executions := make([]operationExecution, 0, 2)
	requestsByAction := make(map[string]protocol.OperationRequest)
	decidedByProcess := make(map[string]bool)
	restartedProcess := make(map[string]bool)
	stopObserved := false

	for _, action := range fixture.Script.Actions {
		switch action.Kind {
		case "invoke", "retry":
			request, decodeErr := protocol.DecodeOperationRequest(action.OperationRequest)
			if decodeErr != nil {
				return failScenario(scenario, "fixture_failure", "ACTOR_ACTION_INVALID", "ActorScript operation request cannot be decoded")
			}
			if action.Kind == "retry" {
				original, found := requestsByAction[action.RetriesActionID]
				if !found || !restartedProcess[action.ProcessID] || original.RequestID == request.RequestID || original.IdempotencyKey != request.IdempotencyKey {
					return failScenario(scenario, "fixture_failure", "RETRY_SEQUENCE_INVALID", "retry did not follow an observed fresh-process restart of its referenced invoke")
				}
			}

			invoke := actorInvokeEnvelope(fixture, targetRoot, envelope.Clock, action)
			childResult, process, capture, invokeErr := invokeFreshProcess(ctx, runner.registry, envelope, invoke)
			if process.ProcessID != "" {
				scenario.Processes = append(scenario.Processes, process)
			}
			if invokeErr != nil {
				scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "actor-action-" + action.ActionID, Status: "failed", Detail: "public invoke process did not return a valid result"})
				return failScenario(scenario, "virgil_failure", "PUBLIC_INVOKE_FAILED", "Virgil public invoke plumbing failed")
			}
			checkpoint, snapshotErr := captureCheckpoint(targetRoot, request.ArtifactStoreRef.Namespace)
			if snapshotErr != nil {
				return failScenario(scenario, "environment_failure", "WORKSPACE_SNAPSHOT_FAILED", "cannot snapshot target and store after invoke")
			}
			stepID, found := operationDecisionStep(fixture, request.RequestID, action.ProcessID)
			if !found {
				return failScenario(scenario, "fixture_failure", "OPERATION_STEP_MISSING", "ActorScript result has no correlated operation_decided fixture step")
			}
			executions = append(executions, operationExecution{
				Action:     action,
				Request:    request,
				Child:      childResult,
				Process:    process,
				Capture:    capture,
				StepID:     stepID,
				Checkpoint: checkpoint,
			})
			requestsByAction[action.ActionID] = request
			decidedByProcess[action.ProcessID] = true
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "actor-action-" + action.ActionID, Status: "passed", Detail: "public invoke returned a schema-valid correlated result in a fresh process"})

		case "restart_process":
			if len(executions) == 0 || action.ProcessID == executions[len(executions)-1].Action.ProcessID || decidedByProcess[action.ProcessID] {
				return failScenario(scenario, "fixture_failure", "RESTART_SEQUENCE_INVALID", "restart_process did not select a fresh logical process after an operation result")
			}
			restartedProcess[action.ProcessID] = true
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "actor-action-" + action.ActionID, Status: "passed", Detail: "runner discarded the prior process boundary before the next public invoke"})

		case "stop":
			if !decidedByProcess[action.ProcessID] || action.AfterTraceKind != "operation_decided" {
				return failScenario(scenario, "fixture_failure", "STOP_NOT_OBSERVED", "stop did not follow an operation decision for its process")
			}
			stopObserved = true
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "actor-action-" + action.ActionID, Status: "passed", Detail: "ActorScript stop was observed after the terminal operation result"})

		default:
			return failScenario(scenario, "fixture_failure", "ACTOR_ACTION_UNSUPPORTED", "ActorScript contains an unsupported action kind")
		}
	}
	if !stopObserved {
		return failScenario(scenario, "fixture_failure", "STOP_NOT_OBSERVED", "ActorScript completed without an observed stop")
	}
	if err := validateCheckpointCaptures(fixture, baseline, executions); err != nil {
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "checkpoint-oracle", Status: "failed", Detail: "independent target/store checkpoint did not match the fixture"})
		return failScenario(scenario, "virgil_failure", "CHECKPOINT_ORACLE_FAILED", err.Error())
	}
	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "checkpoint-oracle", Status: "passed", Detail: "independent target and store snapshots match every fixture checkpoint"})

	switch fixture.Definition.FixtureID {
	case "t0-init-unmanaged-write-blocked":
		if len(executions) != 1 || executions[0].Action.Kind != "invoke" {
			return failScenario(scenario, "fixture_failure", "BLOCKED_SCRIPT_INVALID", "blocked fixture did not execute exactly one invoke")
		}
		if err := validateBlockedScenario(fixture, executions[0].Child, baseline.Target, executions[0].Checkpoint.Target); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "blocked-policy-oracle", Status: "failed", Detail: "blocked policy result violated its fixture oracle"})
			return failScenario(scenario, "virgil_failure", "BLOCKED_POLICY_ORACLE_FAILED", err.Error())
		}
		if err := validateEmptyTarget(targetRoot); err != nil {
			return failScenario(scenario, "virgil_failure", "BLOCKED_POLICY_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks,
			wire.CheckResult{CheckID: "blocked-policy-oracle", Status: "passed", Detail: "blocked result, diagnostic, denied effect, and stop action match the fixture"},
			wire.CheckResult{CheckID: "workspace-zero-diff", Status: "passed", Detail: "independent workspace snapshots are identical"},
		)
	case "t0-init-repo-docs-happy":
		if err := validateHappyScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-init-oracle", Status: "failed", Detail: "happy init violated the durable operation oracle"})
			return failScenario(scenario, "virgil_failure", "INIT_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-init-oracle", Status: "passed", Detail: "init published exactly virgil.json"})

	case "t0-init-idempotent-retry":
		if err := validateRetryScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "fresh-process-replay-oracle", Status: "failed", Detail: "fresh-process retry violated the durable replay oracle"})
			return failScenario(scenario, "virgil_failure", "RETRY_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "fresh-process-replay-oracle", Status: "passed", Detail: "process B replayed process A from durable state with zero writes"})

	case "t0-new-repo-docs-happy":
		if err := validateNewHappyScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-new-oracle", Status: "failed", Detail: "init+new happy path violated the durable operation oracle"})
			return failScenario(scenario, "virgil_failure", "NEW_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-new-oracle", Status: "passed", Detail: "init published virgil.json and new rewrote it in place with active_change"})

	case "t0-new-change-id-collision":
		if err := validateNewCollisionScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "change-id-collision-oracle", Status: "failed", Detail: "change-id collision did not produce the expected blocked result"})
			return failScenario(scenario, "virgil_failure", "COLLISION_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "change-id-collision-oracle", Status: "passed", Detail: "first new succeeded, duplicate change_id with different idempotency correctly returned blocked"})

	case "t0-continue-content-proposal-happy":
		if err := validateContinueHappyScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-continue-oracle", Status: "failed", Detail: "content proposal and approval happy path violated the durable operation oracle"})
			return failScenario(scenario, "virgil_failure", "CONTINUE_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-continue-oracle", Status: "passed", Detail: "content proposal drafted docs/00-idea.md and approval advanced the derived step"})

	case "t0-continue-request-changes":
		if err := validateRequestChangesScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-request-changes-oracle", Status: "failed", Detail: "content proposal and request_changes path violated the durable operation oracle"})
			return failScenario(scenario, "virgil_failure", "REQUEST_CHANGES_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "repo-docs-request-changes-oracle", Status: "passed", Detail: "content proposal drafted docs/00-idea.md and a request_changes approval withdrew it without advancing the derived step"})

	case "t0-continue-idempotent-retry":
		if err := validateContinueIdempotentRetryScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-idempotent-retry-oracle", Status: "failed", Detail: "repeated content_proposal violated the durable replay oracle"})
			return failScenario(scenario, "virgil_failure", "CONTINUE_RETRY_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-idempotent-retry-oracle", Status: "passed", Detail: "the second content_proposal replayed the first draft with zero writes"})

	case "t0-continue-out-of-scope-write-blocked":
		if err := validateContinueOutOfScopeWriteBlockedScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-out-of-scope-oracle", Status: "failed", Detail: "content_proposal escaping the managed root did not produce the expected blocked result"})
			return failScenario(scenario, "virgil_failure", "CONTINUE_OUT_OF_SCOPE_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-out-of-scope-oracle", Status: "passed", Detail: "content_proposal targeting a path outside the managed root was blocked without drafting a file or producing any write"})

	case "t0-continue-handoff-complete":
		if err := validateHandoffCompleteScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-handoff-complete-oracle", Status: "failed", Detail: "the full idea-through-handoff approval pipeline violated the durable operation oracle"})
			return failScenario(scenario, "virgil_failure", "CONTINUE_HANDOFF_COMPLETE_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-handoff-complete-oracle", Status: "passed", Detail: "all five artifact files were drafted, approved in order, advancing derived_step to complete"})

	case "t0-continue-recovery-fresh-process":
		if err := validateRecoveryFreshProcessScenario(runner.registry, targetRoot, executions); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-recovery-fresh-process-oracle", Status: "failed", Detail: "a fresh process failed to recover derived state and continue the change durably"})
			return failScenario(scenario, "virgil_failure", "CONTINUE_RECOVERY_FRESH_PROCESS_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "continue-recovery-fresh-process-oracle", Status: "passed", Detail: "a brand-new operating-system process with no in-memory state derived the approved idea step from durable storage and proposed the spec file with the correct upstream_ref"})

	default:
		return failScenario(scenario, "fixture_failure", "FIXTURE_ORACLE_MISSING", "runner has no operational oracle for fixture")
	}

	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "no_unexpected_nodes", Status: "passed", Detail: "independent filesystem walk found no unexplained node"})
	reference, err := runner.publishScenarioEvidence(envelope, fixture, targetRoot, baseline, executions, scenario.Checks)
	if err != nil {
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "evidence-bundle", Status: "failed", Detail: "typed EvidenceBundle publication failed closed"})
		return failScenario(scenario, "virgil_failure", "EVIDENCE_BUNDLE_INVALID", err.Error())
	}
	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "evidence-bundle", Status: "passed", Detail: "typed evidence was validated and atomically published manifest-last"})
	scenario.Outcome = "passed"
	scenario.Failure = nil
	scenario.Evidence = &reference
	return scenario
}

type operationExecution struct {
	Action     protocol.ActorAction
	Request    protocol.OperationRequest
	Child      wire.InvokeResult
	Process    wire.ProcessObservation
	Capture    processCapture
	StepID     string
	Checkpoint checkpointCapture
}

// checkpointCapture is an independent, point-in-time observation of the
// target root (unscoped) and the store (scoped to the artifact store
// namespace, "docs"). repo-docs' own virgil.json lives outside that
// namespace, so store-scoped diffs never include it; target-scoped diffs do.
type checkpointCapture struct {
	Target map[string]snapshotEntry
	Store  map[string]snapshotEntry
}

func actorInvokeEnvelope(fixture contracts.Fixture, targetRoot string, clock wire.Clock, action protocol.ActorAction) wire.InvokeEnvelope {
	return wire.InvokeEnvelope{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "invoke",
		ProcessID:       action.ProcessID,
		Request:         action.OperationRequest,
		Bindings: wire.Bindings{
			Target: wire.TargetBinding{
				URI:  fixture.Definition.InitialRequest.ProjectRef.Target.URI,
				Root: targetRoot,
			},
			Resources: []wire.ResourceBinding{
				{
					URI:     virgil.FixtureDogmaV1URI,
					Digest:  virgil.FixtureDogmaV1Digest,
					Content: virgil.FixtureDogmaV1,
				},
			},
		},
		Clock: clock,
	}
}

func captureCheckpoint(targetRoot, namespace string) (checkpointCapture, error) {
	target, err := snapshotTree(targetRoot)
	if err != nil {
		return checkpointCapture{}, err
	}
	// repo-docs is rooted in the target repository, but its observation is an
	// independent walk scoped to the explicit store namespace. Paths remain
	// target-relative so target/store fixture diffs use the same resource names.
	store, err := snapshotTreeScope(targetRoot, namespace)
	if err != nil {
		return checkpointCapture{}, err
	}
	return checkpointCapture{Target: target, Store: store}, nil
}

func operationDecisionStep(fixture contracts.Fixture, requestID, processID string) (string, bool) {
	for _, step := range fixture.Definition.ExpectedInteraction.RequiredSteps {
		if step.Kind == "operation_decided" && step.RequestID == requestID && step.ProcessID == processID {
			return step.StepID, true
		}
	}
	return "", false
}

type snapshotEntry struct {
	Mode   os.FileMode
	Size   int64
	Digest string
	Link   string
}

func snapshotTree(root string) (map[string]snapshotEntry, error) {
	return snapshotTreeScope(root, "")
}

func snapshotTreeScope(root, scope string) (map[string]snapshotEntry, error) {
	snapshot := make(map[string]snapshotEntry)
	err := filepath.WalkDir(root, func(entryPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entryPath == root {
			return nil
		}
		relative, err := filepath.Rel(root, entryPath)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		info, err := os.Lstat(entryPath)
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if scope != "" && relative != scope && !strings.HasPrefix(relative, scope+"/") {
			return nil
		}
		record := snapshotEntry{Mode: info.Mode(), Size: info.Size()}
		switch {
		case info.Mode().IsRegular():
			content, err := os.ReadFile(entryPath)
			if err != nil {
				return err
			}
			record.Digest = fmt.Sprintf("sha256:%x", sha256.Sum256(content))
		case info.Mode()&os.ModeSymlink != 0:
			record.Link, err = os.Readlink(entryPath)
			if err != nil {
				return err
			}
			linkBytes := []byte(record.Link)
			record.Size = int64(len(linkBytes))
			record.Digest = fmt.Sprintf("sha256:%x", sha256.Sum256(linkBytes))
		}
		snapshot[relative] = record
		return nil
	})
	if err != nil {
		return nil, err
	}
	return snapshot, nil
}

func validateCheckpointCaptures(fixture contracts.Fixture, baseline checkpointCapture, executions []operationExecution) error {
	if len(fixture.Definition.ExpectedCheckpoints) != len(executions) {
		return fmt.Errorf("captured %d operation checkpoints, fixture requires %d", len(executions), len(fixture.Definition.ExpectedCheckpoints))
	}
	byStep := make(map[string]operationExecution, len(executions))
	for _, execution := range executions {
		byStep[execution.StepID] = execution
	}
	references := map[string]checkpointCapture{"fixture_baseline": baseline}
	for _, expectation := range fixture.Definition.ExpectedCheckpoints {
		execution, found := byStep[expectation.AfterStep]
		if !found {
			return fmt.Errorf("checkpoint %q has no captured operation step %q", expectation.CheckpointID, expectation.AfterStep)
		}
		reference, found := references[expectation.RelativeTo]
		if !found {
			return fmt.Errorf("checkpoint %q has no captured reference %q", expectation.CheckpointID, expectation.RelativeTo)
		}
		if err := validateSnapshotDiff(expectation.TargetDiff, reference.Target, execution.Checkpoint.Target); err != nil {
			return fmt.Errorf("checkpoint %q target diff: %w", expectation.CheckpointID, err)
		}
		if err := validateSnapshotDiff(expectation.StoreDiff, reference.Store, execution.Checkpoint.Store); err != nil {
			return fmt.Errorf("checkpoint %q store diff: %w", expectation.CheckpointID, err)
		}
		if len(expectation.ExpectedArtifacts) == 0 && len(execution.Child.Result.Artifacts) != 0 {
			return fmt.Errorf("checkpoint %q referenced unexpected artifacts", expectation.CheckpointID)
		}
		references[expectation.CheckpointID] = execution.Checkpoint
	}
	return nil
}

func validateSnapshotDiff(raw json.RawMessage, before, after map[string]snapshotEntry) error {
	var expectation struct {
		Mode            string `json:"mode"`
		ExpectedChanges []struct {
			Path       string `json:"path"`
			ChangeType string `json:"change_type"`
		} `json:"expected_changes"`
	}
	if err := json.Unmarshal(raw, &expectation); err != nil {
		return err
	}
	if expectation.Mode == "empty" {
		if !reflect.DeepEqual(before, after) {
			return fmt.Errorf("snapshot changed despite empty diff")
		}
		return nil
	}
	if expectation.Mode != "exact" {
		return fmt.Errorf("unsupported diff mode %q", expectation.Mode)
	}
	expected := make(map[string]string, len(expectation.ExpectedChanges))
	for _, change := range expectation.ExpectedChanges {
		expected[change.Path] = change.ChangeType
	}
	actual := changedNonDirectoryEntries(before, after)
	if !reflect.DeepEqual(actual, expected) {
		return fmt.Errorf("actual changes %v, want %v", actual, expected)
	}
	return nil
}

func changedNonDirectoryEntries(before, after map[string]snapshotEntry) map[string]string {
	changes := make(map[string]string)
	for entryPath, previous := range before {
		current, found := after[entryPath]
		if !found {
			if !previous.Mode.IsDir() {
				changes[entryPath] = "deleted"
			}
			continue
		}
		if !reflect.DeepEqual(previous, current) && (!previous.Mode.IsDir() || !current.Mode.IsDir()) {
			changes[entryPath] = "modified"
		}
	}
	for entryPath, current := range after {
		if _, found := before[entryPath]; !found && !current.Mode.IsDir() {
			changes[entryPath] = "added"
		}
	}
	return changes
}

// ---------------------------------------------------------------------------
// Result-shape oracles shared across scenarios
// ---------------------------------------------------------------------------

func validateFreshInitResult(request protocol.OperationRequest, result protocol.OperationResult, snapshot map[string]snapshotEntry, targetRoot string) error {
	if result.Status != "success" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil || result.DerivedStep != "idea" || result.Next.Operation != "virgil.new" {
		return fmt.Errorf("virgil.init did not return the required fresh success result")
	}
	if len(result.Diagnostics) != 0 || len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 1 {
		return fmt.Errorf("fresh init result does not expose exactly one write and zero events")
	}
	resolvedTarget, err := filepath.EvalSymlinks(targetRoot)
	if err != nil {
		return fmt.Errorf("resolve explicit target binding: %w", err)
	}
	expectedContext := protocol.ContextFromRequest(request)
	expectedContext.ProjectRef.Target.CanonicalPath = resolvedTarget
	if !reflect.DeepEqual(*result.ResolvedContext, expectedContext) {
		return fmt.Errorf("resolved_context does not preserve request refs with the real target binding path")
	}
	effect := result.Effects[0]
	if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" || effect.RequestID != request.RequestID ||
		effect.CausationID != request.RequestID || effect.Capability != "artifact_store.write" || effect.Observed == nil || effect.StateBefore != nil ||
		effect.StateAfter == nil || !reflect.DeepEqual(*effect.StateAfter, effect.Resource) || effect.Resource.URI != protocol.VirgilConfigFile {
		return fmt.Errorf("fresh init returned a non-authorized or incomplete write effect")
	}
	entry, found := snapshot[protocol.VirgilConfigFile]
	if !found || !entry.Mode.IsRegular() || entry.Digest != effect.Resource.Digest {
		return fmt.Errorf("write effect does not match the observed virgil.json file")
	}
	return nil
}

func validateFreshNewResult(request protocol.OperationRequest, result protocol.OperationResult, targetRoot string) error {
	if result.Status != "success" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil || result.DerivedStep != "idea" || result.Next.Operation != "virgil.continue" {
		return fmt.Errorf("virgil.new did not return the required fresh success result")
	}
	if len(result.Diagnostics) != 0 || len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 1 {
		return fmt.Errorf("fresh new result does not expose exactly one write and zero events")
	}
	resolvedTarget, err := filepath.EvalSymlinks(targetRoot)
	if err != nil {
		return fmt.Errorf("resolve explicit target binding: %w", err)
	}
	if result.ResolvedContext.RunRef == nil {
		return fmt.Errorf("virgil.new resolved_context must include a RunRef")
	}
	expectedContext := protocol.ContextFromRequest(request)
	expectedContext.ProjectRef.Target.CanonicalPath = resolvedTarget
	expectedContext.RunRef = result.ResolvedContext.RunRef
	if !reflect.DeepEqual(*result.ResolvedContext, expectedContext) {
		return fmt.Errorf("resolved_context does not preserve request refs with the real target binding path and RunRef")
	}
	effect := result.Effects[0]
	if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" || effect.Resource.URI != protocol.VirgilConfigFile {
		return fmt.Errorf("fresh new did not report the required virgil.json rewrite effect")
	}
	return nil
}

// validatePublishedTree confirms the target root contains exactly
// virgil.json — the only durable object virgil.init or virgil.new (without
// an active change yet drafted) ever publishes.
func validatePublishedTree(targetRoot string, snapshot map[string]snapshotEntry) error {
	if len(snapshot) != 1 {
		return fmt.Errorf("published target contains %d file/symlink entries, want exactly 1 (virgil.json)", len(snapshot))
	}
	entry, found := snapshot[protocol.VirgilConfigFile]
	if !found || !entry.Mode.IsRegular() {
		return fmt.Errorf("published target file virgil.json is missing or has the wrong kind")
	}
	return validateExactTree(targetRoot, map[string]string{protocol.VirgilConfigFile: "file"})
}

func validatePublishedAuthority(registry *contracts.Registry, targetRoot string, request protocol.OperationRequest, result protocol.OperationResult) error {
	configPath := filepath.Join(targetRoot, protocol.VirgilConfigFile)
	configBytes, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read virgil.json: %w", err)
	}
	if err := registry.Validate(contracts.SchemaVirgilConfig, configBytes); err != nil {
		return fmt.Errorf("virgil.json schema: %w", err)
	}
	var config struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(configBytes, &config); err != nil {
		return fmt.Errorf("decode virgil.json: %w", err)
	}
	if config.ProjectID != request.ProjectRef.ProjectID {
		return fmt.Errorf("virgil.json project_id does not match the request")
	}
	if len(result.Events) != 0 {
		return fmt.Errorf("OperationResult must not report durable events: git is the ledger")
	}
	return nil
}

func validatePublishedChangeAuthority(registry *contracts.Registry, targetRoot string, request protocol.OperationRequest, result protocol.OperationResult) error {
	var input struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(request.Input, &input); err != nil || input.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}
	configBytes, err := os.ReadFile(filepath.Join(targetRoot, protocol.VirgilConfigFile))
	if err != nil {
		return fmt.Errorf("read virgil.json: %w", err)
	}
	if err := registry.Validate(contracts.SchemaVirgilConfig, configBytes); err != nil {
		return fmt.Errorf("virgil.json schema: %w", err)
	}
	var config struct {
		ActiveChange *struct {
			ChangeID string `json:"change_id"`
		} `json:"active_change"`
	}
	if err := json.Unmarshal(configBytes, &config); err != nil {
		return fmt.Errorf("decode virgil.json: %w", err)
	}
	if config.ActiveChange == nil || config.ActiveChange.ChangeID != input.ChangeID {
		return fmt.Errorf("virgil.json active_change does not match the new request")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Fixture-specific oracles
// ---------------------------------------------------------------------------

func validateHappyScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 1 || executions[0].Action.Kind != "invoke" {
		return fmt.Errorf("happy fixture executed %d operations, want one invoke", len(executions))
	}
	execution := executions[0]
	if err := validateFreshInitResult(execution.Request, execution.Child.Result, execution.Checkpoint.Target, targetRoot); err != nil {
		return err
	}
	if err := validatePublishedTree(targetRoot, execution.Checkpoint.Target); err != nil {
		return err
	}
	return validatePublishedAuthority(registry, targetRoot, execution.Request, execution.Child.Result)
}

func validateRetryScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 2 || executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "retry" {
		return fmt.Errorf("retry fixture did not execute invoke A followed by retry B")
	}
	first, replay := executions[0], executions[1]
	if first.Action.ProcessID == replay.Action.ProcessID || first.Process.OSPID <= 0 || replay.Process.OSPID <= 0 || first.Process.OSPID == replay.Process.OSPID {
		return fmt.Errorf("retry did not cross distinct logical and operating-system processes")
	}
	if err := validateFreshInitResult(first.Request, first.Child.Result, first.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("process A: %w", err)
	}
	if err := validatePublishedTree(targetRoot, first.Checkpoint.Target); err != nil {
		return fmt.Errorf("process A: %w", err)
	}
	if err := validatePublishedAuthority(registry, targetRoot, first.Request, first.Child.Result); err != nil {
		return fmt.Errorf("process A: %w", err)
	}
	result := replay.Child.Result
	if result.Status != "success" || result.ReplayedFromRequest != first.Request.RequestID || result.RequestID != replay.Request.RequestID ||
		result.Next.Operation != "virgil.new" || len(result.Diagnostics) != 0 || len(result.Effects) != 0 {
		return fmt.Errorf("process B did not return a successful zero-write replay of process A")
	}
	if result.ResolvedContext == nil || result.DerivedStep != "idea" || len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 {
		return fmt.Errorf("process B replay result is incomplete")
	}
	if !reflect.DeepEqual(first.Child.Result.ResolvedContext, result.ResolvedContext) ||
		!reflect.DeepEqual(first.Child.Result.Next, result.Next) {
		return fmt.Errorf("process B did not recover the durable semantic result from process A")
	}
	if !reflect.DeepEqual(first.Checkpoint.Target, replay.Checkpoint.Target) || !reflect.DeepEqual(first.Checkpoint.Store, replay.Checkpoint.Store) {
		return fmt.Errorf("process B changed target or store during replay")
	}
	return nil
}

func validateNewHappyScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 2 || executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" {
		return fmt.Errorf("new-happy fixture did not execute two invoke operations")
	}
	initExec, newExec := executions[0], executions[1]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validatePublishedTree(targetRoot, initExec.Checkpoint.Target); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validatePublishedAuthority(registry, targetRoot, initExec.Request, initExec.Child.Result); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}

	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}
	if err := validatePublishedChangeAuthority(registry, targetRoot, newExec.Request, newExec.Child.Result); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var input struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &input); err != nil || input.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	// virgil.new only rewrites virgil.json in place: no artifact file exists yet.
	return validateExactTree(targetRoot, map[string]string{protocol.VirgilConfigFile: "file"})
}

func validateNewCollisionScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 3 || executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" || executions[2].Action.Kind != "invoke" {
		return fmt.Errorf("collision fixture did not execute three invoke operations")
	}
	initExec, firstNew, collisionNew := executions[0], executions[1], executions[2]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validatePublishedTree(targetRoot, initExec.Checkpoint.Target); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}

	if err := validateFreshNewResult(firstNew.Request, firstNew.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("first new: %w", err)
	}
	if err := validatePublishedChangeAuthority(registry, targetRoot, firstNew.Request, firstNew.Child.Result); err != nil {
		return fmt.Errorf("first new: %w", err)
	}

	collisionResult := collisionNew.Child.Result
	if collisionResult.Status != "blocked" || len(collisionResult.Diagnostics) != 1 {
		return fmt.Errorf("collision did not return blocked with exactly one diagnostic")
	}
	diag := collisionResult.Diagnostics[0]
	if diag.Code != "PRECONDITION_FAILED" {
		return fmt.Errorf("collision diagnostic code is %q, want PRECONDITION_FAILED", diag.Code)
	}
	if len(collisionResult.Effects) != 0 {
		return fmt.Errorf("collision produced %d effects, want zero", len(collisionResult.Effects))
	}
	if collisionResult.Next.Operation != "none" {
		return fmt.Errorf("collision next.operation is %q, want none", collisionResult.Next.Operation)
	}

	if !reflect.DeepEqual(firstNew.Checkpoint.Target, collisionNew.Checkpoint.Target) {
		return fmt.Errorf("collision changed the target filesystem")
	}
	if !reflect.DeepEqual(firstNew.Checkpoint.Store, collisionNew.Checkpoint.Store) {
		return fmt.Errorf("collision changed the store")
	}

	var input struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(firstNew.Request.Input, &input); err != nil || input.ChangeID == "" {
		return fmt.Errorf("first new request input does not contain a valid change_id")
	}

	return validateExactTree(targetRoot, map[string]string{protocol.VirgilConfigFile: "file"})
}

// validateContinueOutOfScopeWriteBlockedScenario proves that a
// content_proposal whose content.uri attempts to escape the managed target
// root (a path traversal like "../outside-target.md") is rejected before any
// artifact file is drafted or any durable write occurs.
func validateContinueOutOfScopeWriteBlockedScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 3 ||
		executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" || executions[2].Action.Kind != "invoke" {
		return fmt.Errorf("out-of-scope-write-blocked fixture did not execute three invoke operations")
	}
	initExec, newExec, continueExec := executions[0], executions[1], executions[2]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validatePublishedAuthority(registry, targetRoot, initExec.Request, initExec.Child.Result); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}

	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}
	if err := validatePublishedChangeAuthority(registry, targetRoot, newExec.Request, newExec.Child.Result); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	result := continueExec.Child.Result
	if result.Status != "blocked" || result.ResolvedContext != nil || result.Next.Operation != "none" {
		return fmt.Errorf("out-of-scope content_proposal did not return the required terminal blocked result")
	}
	if result.ReplayedFromRequest != "" {
		return fmt.Errorf("out-of-scope content_proposal must not report a replay")
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "STORE_POLICY_VIOLATION" || result.Diagnostics[0].Severity != "error" {
		return fmt.Errorf("out-of-scope content_proposal does not carry exactly one STORE_POLICY_VIOLATION diagnostic")
	}
	if len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 {
		return fmt.Errorf("blocked content_proposal references published objects")
	}
	if len(result.Effects) != 0 {
		return fmt.Errorf("blocked content_proposal produced %d effects, want zero", len(result.Effects))
	}

	if !reflect.DeepEqual(newExec.Checkpoint.Target, continueExec.Checkpoint.Target) {
		return fmt.Errorf("out-of-scope content_proposal changed the target filesystem")
	}
	if !reflect.DeepEqual(newExec.Checkpoint.Store, continueExec.Checkpoint.Store) {
		return fmt.Errorf("out-of-scope content_proposal changed the store")
	}

	if _, err := os.Lstat(filepath.Join(targetRoot, "docs")); !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("out-of-scope content_proposal must not create docs/")
	}

	return validateExactTree(targetRoot, map[string]string{protocol.VirgilConfigFile: "file"})
}

func validateContentProposalResult(request protocol.OperationRequest, result protocol.OperationResult) error {
	return validateContentProposalResultForStep(request, result, "idea")
}

func validateApprovalResult(request protocol.OperationRequest, result protocol.OperationResult) error {
	return validateApprovalResultForStep(request, result, "idea", "spec", "virgil.continue")
}

func validateContinueHappyScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 4 ||
		executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" ||
		executions[2].Action.Kind != "invoke" || executions[3].Action.Kind != "invoke" {
		return fmt.Errorf("continue-happy fixture did not execute four invoke operations")
	}
	initExec, newExec, proposalExec, approvalExec := executions[0], executions[1], executions[2], executions[3]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validatePublishedAuthority(registry, targetRoot, initExec.Request, initExec.Child.Result); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}

	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	if err := validateContentProposalResult(proposalExec.Request, proposalExec.Child.Result); err != nil {
		return fmt.Errorf("content_proposal phase: %w", err)
	}
	if err := validateApprovalResult(approvalExec.Request, approvalExec.Child.Result); err != nil {
		return fmt.Errorf("approval phase: %w", err)
	}

	if err := validateArtifactFile(registry, targetRoot, "idea", "rev-000001", statusApproved, true); err != nil {
		return err
	}

	var proposeInput struct {
		Entry struct {
			Content struct {
				URI string `json:"uri"`
			} `json:"content"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(proposalExec.Request.Input, &proposeInput); err != nil || proposeInput.Entry.Content.URI == "" {
		return fmt.Errorf("content_proposal request input does not contain a valid content uri")
	}

	return validateWholeTree(targetRoot, []artifactExpectation{{Kind: "idea", Status: statusApproved}}, []string{proposeInput.Entry.Content.URI})
}

func validateRequestChangesScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 4 ||
		executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" ||
		executions[2].Action.Kind != "invoke" || executions[3].Action.Kind != "invoke" {
		return fmt.Errorf("request-changes fixture did not execute four invoke operations")
	}
	initExec, newExec, proposalExec, requestChangesExec := executions[0], executions[1], executions[2], executions[3]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	if err := validateContentProposalResult(proposalExec.Request, proposalExec.Child.Result); err != nil {
		return fmt.Errorf("content_proposal phase: %w", err)
	}
	if err := validateRequestChangesResult(requestChangesExec.Request, requestChangesExec.Child.Result); err != nil {
		return fmt.Errorf("request_changes phase: %w", err)
	}

	if err := validateArtifactFile(registry, targetRoot, "idea", "rev-000001", statusWithdrawn, false); err != nil {
		return err
	}

	var proposeInput struct {
		Entry struct {
			Content struct {
				URI string `json:"uri"`
			} `json:"content"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(proposalExec.Request.Input, &proposeInput); err != nil || proposeInput.Entry.Content.URI == "" {
		return fmt.Errorf("content_proposal request input does not contain a valid content uri")
	}

	return validateWholeTree(targetRoot, []artifactExpectation{{Kind: "idea", Status: statusWithdrawn}}, []string{proposeInput.Entry.Content.URI})
}

func validateRequestChangesResult(request protocol.OperationRequest, result protocol.OperationResult) error {
	if result.Status != "needs_input" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil ||
		result.DerivedStep != "idea" || result.Next.Operation != "virgil.continue" {
		return fmt.Errorf("request_changes did not return the required needs_input result at the same derived step")
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "revision" || result.Artifacts[0].ObjectID != "rev-000001" {
		return fmt.Errorf("request_changes result does not reference the withdrawn revision")
	}
	if len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 1 {
		return fmt.Errorf("request_changes result does not expose exactly one write and zero events")
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "REVISION_WITHDRAWN" || result.Diagnostics[0].Severity != "info" {
		return fmt.Errorf("request_changes result does not carry the revision-withdrawn diagnostic")
	}
	effect := result.Effects[0]
	if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" ||
		effect.RequestID != request.RequestID || effect.CausationID != request.RequestID {
		return fmt.Errorf("request_changes effect is not an authorized write correlated to the request")
	}
	return nil
}

// validateContinueIdempotentRetryScenario proves that sending the same
// content_proposal twice — same idempotency_key, same content digest,
// distinct request_id — is a durable no-op the second time.
func validateContinueIdempotentRetryScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 4 ||
		executions[0].Action.Kind != "invoke" || executions[1].Action.Kind != "invoke" ||
		executions[2].Action.Kind != "invoke" || executions[3].Action.Kind != "invoke" {
		return fmt.Errorf("continue-idempotent-retry fixture did not execute four invoke operations")
	}
	initExec, newExec, firstExec, retryExec := executions[0], executions[1], executions[2], executions[3]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	if err := validateContentProposalResult(firstExec.Request, firstExec.Child.Result); err != nil {
		return fmt.Errorf("first content_proposal phase: %w", err)
	}

	if firstExec.Request.IdempotencyKey != retryExec.Request.IdempotencyKey || firstExec.Request.RequestID == retryExec.Request.RequestID {
		return fmt.Errorf("retry content_proposal did not reuse the idempotency_key with a distinct request_id")
	}
	if err := validateContentProposalReplayResult(retryExec.Request, retryExec.Child.Result, firstExec.Request.RequestID); err != nil {
		return fmt.Errorf("retry content_proposal phase: %w", err)
	}
	if !reflect.DeepEqual(firstExec.Checkpoint.Target, retryExec.Checkpoint.Target) || !reflect.DeepEqual(firstExec.Checkpoint.Store, retryExec.Checkpoint.Store) {
		return fmt.Errorf("retry content_proposal changed target or store despite being a durable replay")
	}
	if !reflect.DeepEqual(firstExec.Child.Result.Artifacts, retryExec.Child.Result.Artifacts) {
		return fmt.Errorf("retry content_proposal did not reference the same durable revision as the first proposal")
	}

	if err := validateArtifactFile(registry, targetRoot, "idea", "rev-000001", statusAwaitingApproval, false); err != nil {
		return err
	}

	var proposeInput struct {
		Entry struct {
			Content struct {
				URI string `json:"uri"`
			} `json:"content"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(firstExec.Request.Input, &proposeInput); err != nil || proposeInput.Entry.Content.URI == "" {
		return fmt.Errorf("content_proposal request input does not contain a valid content uri")
	}

	return validateWholeTree(targetRoot, []artifactExpectation{{Kind: "idea", Status: statusAwaitingApproval}}, []string{proposeInput.Entry.Content.URI})
}

func validateContentProposalReplayResult(request protocol.OperationRequest, result protocol.OperationResult, originalRequestID string) error {
	if result.Status != "needs_input" || result.ReplayedFromRequest != originalRequestID || result.ResolvedContext == nil ||
		result.DerivedStep != "idea" || result.Next.Operation != "virgil.continue" {
		return fmt.Errorf("retried content_proposal did not return the required needs_input replay result")
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "revision" || result.Artifacts[0].ObjectID != "rev-000001" {
		return fmt.Errorf("retried content_proposal result does not reference the existing revision")
	}
	if len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 0 {
		return fmt.Errorf("retried content_proposal result must not report new writes")
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "APPROVAL_REQUIRED" || result.Diagnostics[0].Severity != "info" {
		return fmt.Errorf("retried content_proposal result does not carry the approval-required diagnostic")
	}
	if request.RequestID == originalRequestID {
		return fmt.Errorf("retry request_id must differ from the original request_id")
	}
	return nil
}

// artifactExpectation names one docs/{NN}-{kind}.md file expected to exist in
// the final tree, along with its frontmatter status.
type artifactExpectation struct {
	Kind   string
	Status string
}

// validateWholeTree walks the entire target repository and confirms it
// contains exactly virgil.json, the expected docs/{NN}-{kind}.md files, and
// the fixture's pre-seeded content_proposal source files living outside the
// managed namespace.
func validateWholeTree(targetRoot string, artifacts []artifactExpectation, seedPaths []string) error {
	expected := map[string]string{protocol.VirgilConfigFile: "file"}
	if len(artifacts) > 0 {
		expected["docs"] = "dir"
	}
	for _, artifact := range artifacts {
		expected[path.Join("docs", protocol.ArtifactFileName(artifact.Kind))] = "file"
	}
	for _, seedPath := range seedPaths {
		for directory := path.Dir(seedPath); directory != "." && directory != "/"; directory = path.Dir(directory) {
			expected[directory] = "dir"
		}
		expected[seedPath] = "file"
	}
	return validateExactTree(targetRoot, expected)
}

func validateExactTree(targetRoot string, expected map[string]string) error {
	seen := make(map[string]bool, len(expected))
	err := filepath.WalkDir(targetRoot, func(entryPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entryPath == targetRoot {
			return nil
		}
		relative, err := filepath.Rel(targetRoot, entryPath)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		kind, found := expected[relative]
		if !found {
			return fmt.Errorf("unexpected target node %q", relative)
		}
		info, err := os.Lstat(entryPath)
		if err != nil || info.Mode()&os.ModeSymlink != 0 || (kind == "dir" && !info.IsDir()) || (kind == "file" && !info.Mode().IsRegular()) {
			return fmt.Errorf("target node %q has an unexpected kind", relative)
		}
		seen[relative] = true
		return nil
	})
	if err != nil {
		return err
	}
	if len(seen) != len(expected) {
		return fmt.Errorf("target node set is incomplete")
	}
	return nil
}

// validateArtifactFile reads docs/{NN}-{kind}.md, validates its frontmatter
// against the bundled schema, and asserts revision, status, content digest
// and (when requireApproval is true) approved_by/approved_at.
func validateArtifactFile(registry *contracts.Registry, targetRoot, kind, wantRevision, wantStatus string, requireApproval bool) error {
	relative := path.Join("docs", protocol.ArtifactFileName(kind))
	raw, err := os.ReadFile(filepath.Join(targetRoot, filepath.FromSlash(relative)))
	if err != nil {
		return fmt.Errorf("read %s artifact file: %w", kind, err)
	}
	frontmatter, content, err := splitFrontmatterForOracle(raw)
	if err != nil {
		return fmt.Errorf("%s artifact file: %w", kind, err)
	}
	if err := registry.Validate(contracts.SchemaArtifactFrontmatter, frontmatter); err != nil {
		return fmt.Errorf("%s artifact frontmatter schema: %w", kind, err)
	}
	var probe artifactFrontmatterProbe
	if err := json.Unmarshal(frontmatter, &probe); err != nil {
		return fmt.Errorf("decode %s artifact frontmatter: %w", kind, err)
	}
	if probe.ArtifactKind != kind || probe.Revision != wantRevision || probe.Status != wantStatus {
		return fmt.Errorf("%s artifact frontmatter is %+v, want kind=%s revision=%s status=%s", kind, probe, kind, wantRevision, wantStatus)
	}
	if wantDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(content)); probe.ContentDigest != wantDigest {
		return fmt.Errorf("%s artifact content does not match its frontmatter digest", kind)
	}
	if requireApproval && (probe.ApprovedBy == nil || probe.ApprovedBy.ActorID == "" || probe.ApprovedAt == "") {
		return fmt.Errorf("%s artifact is not durably approved", kind)
	}
	return nil
}

type artifactFrontmatterProbe struct {
	ArtifactKind  string `json:"artifact_kind"`
	Status        string `json:"status"`
	Revision      string `json:"revision"`
	ContentDigest string `json:"content_digest"`
	UpstreamRefs  []struct {
		RevisionID   string `json:"revision_id"`
		ArtifactKind string `json:"artifact_kind"`
	} `json:"upstream_refs"`
	ApprovedBy *struct {
		ActorID string `json:"actor_id"`
	} `json:"approved_by"`
	ApprovedAt string `json:"approved_at"`
}

const (
	frontmatterOpen        = "---json\n"
	frontmatterClose       = "\n---\n\n"
	statusAwaitingApproval = "awaiting_approval"
	statusApproved         = "approved"
	statusWithdrawn        = "withdrawn"
)

// splitFrontmatterForOracle is the independent, oracle-side counterpart of
// repodocs.parseArtifactFrontmatter: it re-derives the same split from raw
// bytes without importing the internal repodocs package, so the T0 oracle
// observes the artifact file exactly as any other reader would.
func splitFrontmatterForOracle(raw []byte) ([]byte, []byte, error) {
	if !bytes.HasPrefix(raw, []byte(frontmatterOpen)) {
		return nil, nil, fmt.Errorf("artifact file does not start with %q", frontmatterOpen)
	}
	rest := raw[len(frontmatterOpen):]
	closeIndex := bytes.Index(rest, []byte(frontmatterClose))
	if closeIndex < 0 {
		return nil, nil, fmt.Errorf("artifact file has no closing frontmatter marker")
	}
	return rest[:closeIndex], rest[closeIndex+len(frontmatterClose):], nil
}

// handoffCompleteArtifactKinds is the ordered artifact_kind progression the
// t0-continue-handoff-complete fixture drives end to end: idea -> spec ->
// design -> tasks -> handoff -> complete.
var handoffCompleteArtifactKinds = []string{"idea", "spec", "design", "tasks", "handoff"}

// validateHandoffCompleteScenario proves the full T0 handoff-complete
// pipeline: init, new, then five (content_proposal, approval) pairs — one
// per artifact_kind in handoffCompleteArtifactKinds — each advancing
// derived_step to the next kind in order, until the final handoff approval
// reaches derived_step == "complete" with a terminal Next.Operation == "none".
func validateHandoffCompleteScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	const wantExecutions = 2 + 2*5
	if len(executions) != wantExecutions {
		return fmt.Errorf("handoff-complete fixture executed %d operations, want %d", len(executions), wantExecutions)
	}
	for _, execution := range executions {
		if execution.Action.Kind != "invoke" {
			return fmt.Errorf("handoff-complete fixture contains a non-invoke execution")
		}
	}
	initExec, newExec := executions[0], executions[1]

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	seedPaths := make([]string, 0, len(handoffCompleteArtifactKinds))
	artifacts := make([]artifactExpectation, 0, len(handoffCompleteArtifactKinds))
	for index, kind := range handoffCompleteArtifactKinds {
		proposeExec := executions[2+2*index]
		approveExec := executions[2+2*index+1]

		if err := validateContentProposalResultForStep(proposeExec.Request, proposeExec.Child.Result, kind); err != nil {
			return fmt.Errorf("%s content_proposal phase: %w", kind, err)
		}

		nextDerivedStep := "complete"
		nextOperation := "none"
		if index+1 < len(handoffCompleteArtifactKinds) {
			nextDerivedStep = handoffCompleteArtifactKinds[index+1]
			nextOperation = "virgil.continue"
		}
		if err := validateApprovalResultForStep(approveExec.Request, approveExec.Child.Result, kind, nextDerivedStep, nextOperation); err != nil {
			return fmt.Errorf("%s approval phase: %w", kind, err)
		}

		var proposeInput struct {
			Entry struct {
				Content struct {
					URI string `json:"uri"`
				} `json:"content"`
			} `json:"entry"`
		}
		if err := json.Unmarshal(proposeExec.Request.Input, &proposeInput); err != nil || proposeInput.Entry.Content.URI == "" {
			return fmt.Errorf("%s content_proposal request input does not contain a valid content uri", kind)
		}
		seedPaths = append(seedPaths, proposeInput.Entry.Content.URI)

		if err := validateArtifactFile(registry, targetRoot, kind, "rev-000001", statusApproved, true); err != nil {
			return err
		}
		if err := validateUpstreamRef(registry, targetRoot, kind, index); err != nil {
			return err
		}
		artifacts = append(artifacts, artifactExpectation{Kind: kind, Status: statusApproved})
	}

	return validateWholeTree(targetRoot, artifacts, seedPaths)
}

func validateUpstreamRef(registry *contracts.Registry, targetRoot, kind string, index int) error {
	relative := path.Join("docs", protocol.ArtifactFileName(kind))
	raw, err := os.ReadFile(filepath.Join(targetRoot, filepath.FromSlash(relative)))
	if err != nil {
		return err
	}
	frontmatter, _, err := splitFrontmatterForOracle(raw)
	if err != nil {
		return err
	}
	var probe artifactFrontmatterProbe
	if err := json.Unmarshal(frontmatter, &probe); err != nil {
		return err
	}
	if index == 0 {
		if len(probe.UpstreamRefs) != 0 {
			return fmt.Errorf("idea artifact must not carry an upstream_refs entry, got %d", len(probe.UpstreamRefs))
		}
		return nil
	}
	previousKind := handoffCompleteArtifactKinds[index-1]
	if len(probe.UpstreamRefs) != 1 || probe.UpstreamRefs[0].ArtifactKind != previousKind || probe.UpstreamRefs[0].RevisionID != "rev-000001" {
		return fmt.Errorf("%s artifact upstream_refs does not point at the approved %s artifact", kind, previousKind)
	}
	return nil
}

// validateContentProposalResultForStep validates the OperationResult of a
// content_proposal targeting artifactKind.
func validateContentProposalResultForStep(request protocol.OperationRequest, result protocol.OperationResult, artifactKind string) error {
	if result.Status != "needs_input" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil ||
		result.DerivedStep != artifactKind || result.Next.Operation != "virgil.continue" {
		return fmt.Errorf("content_proposal did not return the required needs_input result at derived_step %q", artifactKind)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "revision" || result.Artifacts[0].ObjectID != "rev-000001" {
		return fmt.Errorf("content_proposal result does not reference the drafted revision")
	}
	if len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 1 {
		return fmt.Errorf("content_proposal result does not expose exactly one write and zero events")
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "APPROVAL_REQUIRED" || result.Diagnostics[0].Severity != "info" {
		return fmt.Errorf("content_proposal result does not carry the approval-required diagnostic")
	}
	for _, effect := range result.Effects {
		if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" ||
			effect.RequestID != request.RequestID || effect.CausationID != request.RequestID {
			return fmt.Errorf("content_proposal effect is not an authorized write correlated to the request")
		}
	}
	return nil
}

// validateApprovalResultForStep validates the OperationResult of an approval
// entry for artifactKind, asserting derived_step advances to
// nextDerivedStep ("complete" with Next.Operation == "none" for handoff).
func validateApprovalResultForStep(request protocol.OperationRequest, result protocol.OperationResult, artifactKind, nextDerivedStep, nextOperation string) error {
	if result.Status != "success" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil ||
		result.DerivedStep != nextDerivedStep || result.Next.Operation != nextOperation {
		return fmt.Errorf("approval for %s did not return the required success result advancing derived_step to %q", artifactKind, nextDerivedStep)
	}
	if len(result.Artifacts) != 1 || result.Artifacts[0].Kind != "revision" || result.Artifacts[0].ObjectID != "rev-000001" {
		return fmt.Errorf("approval for %s result does not reference the approved revision", artifactKind)
	}
	if len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 1 || len(result.Diagnostics) != 0 {
		return fmt.Errorf("approval for %s result does not expose exactly one write and zero events", artifactKind)
	}
	effect := result.Effects[0]
	if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" ||
		effect.RequestID != request.RequestID || effect.CausationID != request.RequestID {
		return fmt.Errorf("approval for %s effect is not an authorized write correlated to the request", artifactKind)
	}
	return nil
}

// validateRecoveryFreshProcessScenario proves that a brand-new operating
// system process, launched with no in-memory state from any earlier
// invocation, can correctly recover a change's derived state purely from
// durable storage and continue the pipeline. Process A drives init, new, and
// the idea content_proposal/approval pair to completion (advancing
// derived_step to "spec") and then stops. process-b then issues only the
// spec content_proposal. Because repo-docs' derived_step and upstream_refs
// are always recomputed as queries over durable artifact files, the only way
// process B can correctly target "spec" and link its upstream_refs to the
// approved idea file is by reading durable state from disk.
func validateRecoveryFreshProcessScenario(registry *contracts.Registry, targetRoot string, executions []operationExecution) error {
	if len(executions) != 5 {
		return fmt.Errorf("recovery-fresh-process fixture executed %d operations, want 5", len(executions))
	}
	for _, execution := range executions {
		if execution.Action.Kind != "invoke" {
			return fmt.Errorf("recovery-fresh-process fixture contains a non-invoke execution")
		}
	}
	initExec, newExec, ideaProposeExec, ideaApproveExec, specProposeExec := executions[0], executions[1], executions[2], executions[3], executions[4]

	if initExec.Action.ProcessID != "process-a" || newExec.Action.ProcessID != "process-a" ||
		ideaProposeExec.Action.ProcessID != "process-a" || ideaApproveExec.Action.ProcessID != "process-a" {
		return fmt.Errorf("init, new, and the idea content_proposal/approval pair did not all execute in process-a")
	}
	if specProposeExec.Action.ProcessID != "process-b" {
		return fmt.Errorf("the spec content_proposal did not execute in a distinct logical process-b")
	}
	if ideaApproveExec.Process.OSPID <= 0 || specProposeExec.Process.OSPID <= 0 || ideaApproveExec.Process.OSPID == specProposeExec.Process.OSPID {
		return fmt.Errorf("recovery did not cross distinct operating-system processes")
	}

	if err := validateFreshInitResult(initExec.Request, initExec.Child.Result, initExec.Checkpoint.Target, targetRoot); err != nil {
		return fmt.Errorf("init phase: %w", err)
	}
	if err := validateFreshNewResult(newExec.Request, newExec.Child.Result, targetRoot); err != nil {
		return fmt.Errorf("new phase: %w", err)
	}

	var newInput struct {
		ChangeID string `json:"change_id"`
	}
	if err := json.Unmarshal(newExec.Request.Input, &newInput); err != nil || newInput.ChangeID == "" {
		return fmt.Errorf("new request input does not contain a valid change_id")
	}

	if err := validateContentProposalResultForStep(ideaProposeExec.Request, ideaProposeExec.Child.Result, "idea"); err != nil {
		return fmt.Errorf("idea content_proposal phase: %w", err)
	}
	if err := validateApprovalResultForStep(ideaApproveExec.Request, ideaApproveExec.Child.Result, "idea", "spec", "virgil.continue"); err != nil {
		return fmt.Errorf("idea approval phase: %w", err)
	}

	// The critical recovery assertion: process B — a fresh OS process that
	// never observed process A's in-memory results — must still resolve
	// derived_step to "spec" (not "idea") purely from durable state.
	if err := validateContentProposalResultForStep(specProposeExec.Request, specProposeExec.Child.Result, "spec"); err != nil {
		return fmt.Errorf("spec content_proposal phase (process B, fresh process): %w", err)
	}

	if err := validateArtifactFile(registry, targetRoot, "idea", "rev-000001", statusApproved, true); err != nil {
		return err
	}
	if err := validateUpstreamRef(registry, targetRoot, "idea", 0); err != nil {
		return err
	}
	if err := validateArtifactFile(registry, targetRoot, "spec", "rev-000001", statusAwaitingApproval, false); err != nil {
		return err
	}
	if err := validateUpstreamRef(registry, targetRoot, "spec", 1); err != nil {
		return err
	}

	var ideaInput, specInput struct {
		Entry struct {
			Content struct {
				URI string `json:"uri"`
			} `json:"content"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(ideaProposeExec.Request.Input, &ideaInput); err != nil || ideaInput.Entry.Content.URI == "" {
		return fmt.Errorf("idea content_proposal request input does not contain a valid content uri")
	}
	if err := json.Unmarshal(specProposeExec.Request.Input, &specInput); err != nil || specInput.Entry.Content.URI == "" {
		return fmt.Errorf("spec content_proposal request input does not contain a valid content uri")
	}

	artifacts := []artifactExpectation{
		{Kind: "idea", Status: statusApproved},
		{Kind: "spec", Status: statusAwaitingApproval},
	}
	return validateWholeTree(targetRoot, artifacts, []string{ideaInput.Entry.Content.URI, specInput.Entry.Content.URI})
}

// ---------------------------------------------------------------------------
// Blocked-policy and generic child-process oracles (layout independent)
// ---------------------------------------------------------------------------

func validateEmptyTarget(targetRoot string) error {
	return filepath.WalkDir(targetRoot, func(entryPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entryPath != targetRoot {
			return fmt.Errorf("blocked operation created unexpected target node %q", entryPath)
		}
		return nil
	})
}

func pathJoin(elements ...string) string {
	return strings.Join(elements, "/")
}

func validateBlockedScenario(fixture contracts.Fixture, child wire.InvokeResult, before, after map[string]snapshotEntry) error {
	result := child.Result
	request := fixture.Definition.InitialRequest
	if result.Status != "blocked" || result.ResolvedContext != nil || result.Next.Operation != "none" {
		return fmt.Errorf("OperationResult is not the required terminal blocked result")
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].Code != "STORE_POLICY_VIOLATION" || result.Diagnostics[0].Severity != "error" {
		return fmt.Errorf("OperationResult does not contain exactly one STORE_POLICY_VIOLATION diagnostic")
	}
	if len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 {
		return fmt.Errorf("blocked OperationResult references published objects")
	}
	if len(result.Effects) != 1 {
		return fmt.Errorf("blocked OperationResult contains %d effects, want exactly one", len(result.Effects))
	}
	effect := result.Effects[0]
	if effect.ProtocolVersion != request.ProtocolVersion ||
		effect.RequestID != request.RequestID || effect.CausationID != request.RequestID ||
		effect.Kind != "write" || effect.PolicyDecision != "denied" || effect.Occurred || effect.Observed != nil ||
		effect.Resource.URI != request.ArtifactStoreRef.Namespace ||
		!reflect.DeepEqual(effect.Adapter, request.ArtifactStoreRef.Adapter) ||
		effect.Capability != "artifact_store.write" || len(effect.Evidence) != 0 ||
		effect.StateBefore != nil || effect.StateAfter != nil {
		return fmt.Errorf("denied EffectRecord does not describe the observed write attempt")
	}
	if effect.Requested["namespace"] != request.ArtifactStoreRef.Namespace || effect.Requested["operation"] != request.Operation {
		return fmt.Errorf("denied EffectRecord requested payload is not correlated")
	}
	if len(child.Observations) != 1 || child.Observations[0].Kind != "policy_decision" {
		return fmt.Errorf("worker did not report the policy decision observation")
	}
	if !reflect.DeepEqual(before, after) {
		return fmt.Errorf("target changed despite denied write")
	}
	if err := validateBlockedFixtureExpectations(fixture, result, effect); err != nil {
		return err
	}
	return nil
}

func validateBlockedFixtureExpectations(fixture contracts.Fixture, result protocol.OperationResult, effect protocol.EffectRecord) error {
	var operationStep *protocol.InteractionStep
	var effectStep *protocol.InteractionStep
	for index := range fixture.Definition.ExpectedInteraction.RequiredSteps {
		step := &fixture.Definition.ExpectedInteraction.RequiredSteps[index]
		switch step.Kind {
		case "operation_decided":
			operationStep = step
		case "effect_observed":
			effectStep = step
		}
	}
	if operationStep == nil || operationStep.OperationStatus != result.Status ||
		operationStep.DiagnosticCode != result.Diagnostics[0].Code ||
		operationStep.RequestID != result.RequestID || operationStep.NextOperation != result.Next.Operation {
		return fmt.Errorf("OperationResult does not match expected interaction")
	}
	if effectStep == nil || effectStep.EffectKind != effect.Kind || effectStep.PolicyDecision != effect.PolicyDecision ||
		effectStep.Occurred == nil || *effectStep.Occurred != effect.Occurred ||
		!matchFixtureResourcePattern(effectStep.ResourcePattern, effect.Resource.URI) {
		return fmt.Errorf("denied effect does not match expected interaction")
	}
	if len(fixture.Definition.ExpectedEffects) != 1 ||
		fixture.Definition.ExpectedEffects[0].MinCount != 1 || fixture.Definition.ExpectedEffects[0].MaxCount != 1 {
		return fmt.Errorf("fixture does not require exactly one denied effect")
	}
	if err := validateDeniedEffectExpectation(fixture.Definition.ExpectedEffects[0], effect); err != nil {
		return err
	}
	if !fixtureRequiresEmptyDiffs(fixture.Definition) {
		return fmt.Errorf("blocked fixture does not require empty target/store diffs")
	}
	actions := fixture.Script.Actions
	if len(actions) != 2 || actions[0].Kind != "invoke" || actions[1].Kind != "stop" ||
		actions[1].ProcessID != actions[0].ProcessID || actions[1].AfterTraceKind != "operation_decided" {
		return fmt.Errorf("ActorScript stop contract was not completed")
	}
	return nil
}

func validateDeniedEffectExpectation(expectation protocol.ObjectExpectation, effect protocol.EffectRecord) error {
	if expectation.Kind != effect.Kind {
		return fmt.Errorf("expected effect kind does not match denied effect")
	}
	actual := map[string]any{
		"/request_id":      effect.RequestID,
		"/policy_decision": effect.PolicyDecision,
		"/occurred":        effect.Occurred,
		"/observed":        effect.Observed,
	}
	for pointer, expected := range expectation.FieldEquals {
		value, supported := actual[pointer]
		if !supported || !reflect.DeepEqual(value, expected) {
			return fmt.Errorf("denied effect does not satisfy fixture field oracle %q", pointer)
		}
	}
	return nil
}

func fixtureRequiresEmptyDiffs(fixture protocol.ScenarioFixture) bool {
	if !diffExpectationIsEmpty(fixture.ExpectedTargetDiff) || len(fixture.ExpectedCheckpoints) != 1 {
		return false
	}
	checkpoint := fixture.ExpectedCheckpoints[0]
	return diffExpectationIsEmpty(checkpoint.TargetDiff) && diffExpectationIsEmpty(checkpoint.StoreDiff) &&
		len(checkpoint.ExpectedEvents) == 0 && len(checkpoint.ExpectedArtifacts) == 0
}

func diffExpectationIsEmpty(raw json.RawMessage) bool {
	var expectation struct {
		Mode            string            `json:"mode"`
		AllowedPaths    []string          `json:"allowed_paths"`
		ExpectedChanges []json.RawMessage `json:"expected_changes"`
	}
	if err := json.Unmarshal(raw, &expectation); err != nil {
		return false
	}
	return expectation.Mode == "empty" && len(expectation.AllowedPaths) == 0 && len(expectation.ExpectedChanges) == 0
}

func matchFixtureResourcePattern(pattern, resource string) bool {
	if strings.HasSuffix(pattern, "/**") {
		return resource == strings.TrimSuffix(pattern, "/**") || strings.HasPrefix(resource, strings.TrimSuffix(pattern, "**"))
	}
	return pattern == resource
}

func invokeFreshProcess(ctx context.Context, registry *contracts.Registry, envelope wire.RunT0Envelope, invoke wire.InvokeEnvelope) (wire.InvokeResult, wire.ProcessObservation, processCapture, error) {
	timeout, outputLimit, err := effectiveLimits(envelope.Limits)
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, processCapture{}, err
	}
	childContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	executable, err := os.Executable()
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, processCapture{}, fmt.Errorf("resolve current executable: %w", err)
	}
	payload, err := json.Marshal(invoke)
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, processCapture{}, fmt.Errorf("marshal invoke envelope: %w", err)
	}

	command := exec.CommandContext(childContext, executable)
	command.Dir = envelope.WorkspaceRoot
	command.Env = minimalEnvironment()
	command.Stdin = bytes.NewReader(payload)
	stdout := newLimitedBuffer(outputLimit)
	stderr := newLimitedBuffer(outputLimit)
	command.Stdout = stdout
	command.Stderr = stderr
	if err := command.Start(); err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, processCapture{}, fmt.Errorf("start public invoke process: %w", err)
	}
	process := wire.ProcessObservation{ProcessID: invoke.ProcessID, OSPID: command.Process.Pid, ExitCode: -1}
	waitErr := command.Wait()
	process.ExitCode = command.ProcessState.ExitCode()
	capture := captureProcessStreams(stdout.Bytes(), stderr.Bytes(), stdout.Exceeded(), stderr.Exceeded())
	if errors.Is(childContext.Err(), context.DeadlineExceeded) {
		return wire.InvokeResult{}, process, capture, fmt.Errorf("public invoke process timed out")
	}
	if waitErr != nil {
		return wire.InvokeResult{}, process, capture, fmt.Errorf("public invoke process exited %d", process.ExitCode)
	}
	if stdout.Exceeded() || stderr.Exceeded() {
		return wire.InvokeResult{}, process, capture, fmt.Errorf("public invoke process exceeded output limit")
	}
	decoded, err := wire.DecodeInvokeResult(stdout.Bytes())
	if err != nil {
		return wire.InvokeResult{}, process, capture, err
	}
	if decoded.ProcessID != invoke.ProcessID || decoded.OSPID != process.OSPID {
		return wire.InvokeResult{}, process, capture, fmt.Errorf("public invoke process identity mismatch")
	}
	if err := validateChildOperationResult(registry, invoke.Request, decoded.Result); err != nil {
		return wire.InvokeResult{}, process, capture, err
	}
	return decoded, process, capture, nil
}

func validateChildOperationResult(registry *contracts.Registry, requestRaw json.RawMessage, result protocol.OperationResult) error {
	request, err := protocol.DecodeOperationRequest(requestRaw)
	if err != nil {
		return err
	}
	resultRaw, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal child OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, resultRaw); err != nil {
		return fmt.Errorf("child OperationResult contract: %w", err)
	}
	if result.ProtocolVersion != request.ProtocolVersion ||
		result.Operation != request.Operation ||
		result.RequestID != request.RequestID ||
		result.IdempotencyKey != request.IdempotencyKey {
		return fmt.Errorf("child OperationResult does not correlate with request")
	}
	if !reflect.DeepEqual(result.RequestedContext, protocol.ContextFromRequest(request)) {
		return fmt.Errorf("child OperationResult requested_context does not match request")
	}
	return nil
}

func selectFixtures(requested []string, available map[string]contracts.Fixture) ([]string, *wire.ScenarioResult) {
	if len(requested) == 0 {
		failure := failScenario(wire.ScenarioResult{FixtureID: "selection", Outcome: "failed", Processes: []wire.ProcessObservation{}, Checks: []wire.CheckResult{}}, "fixture_failure", "FIXTURE_SELECTION_EMPTY", "fixture_ids must not be empty")
		return nil, &failure
	}
	seen := make(map[string]struct{}, len(requested))
	for _, fixtureID := range requested {
		if _, duplicate := seen[fixtureID]; duplicate {
			failure := failScenario(wire.ScenarioResult{FixtureID: fixtureID, Outcome: "failed", Processes: []wire.ProcessObservation{}, Checks: []wire.CheckResult{}}, "fixture_failure", "FIXTURE_SELECTION_DUPLICATE", "fixture_id appears more than once")
			return nil, &failure
		}
		seen[fixtureID] = struct{}{}
		if _, ok := available[fixtureID]; !ok {
			failure := failScenario(wire.ScenarioResult{FixtureID: fixtureID, Outcome: "failed", Processes: []wire.ProcessObservation{}, Checks: []wire.CheckResult{}}, "fixture_failure", "FIXTURE_UNKNOWN", "fixture_id is not bundled")
			return nil, &failure
		}
	}
	return append([]string(nil), requested...), nil
}

func validateRoots(workspaceRoot, evidenceRoot string) error {
	if !filepath.IsAbs(workspaceRoot) || !filepath.IsAbs(evidenceRoot) {
		return fmt.Errorf("workspace_root and evidence_root must be absolute")
	}
	workspaceRoot = filepath.Clean(workspaceRoot)
	evidenceRoot = filepath.Clean(evidenceRoot)
	if pathsOverlap(workspaceRoot, evidenceRoot) {
		return fmt.Errorf("workspace_root and evidence_root must be disjoint")
	}
	return nil
}

func pathsOverlap(first, second string) bool {
	return pathContains(first, second) || pathContains(second, first)
}

func pathContains(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil || filepath.IsAbs(relative) {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

func effectiveLimits(limits wire.RunLimits) (time.Duration, int64, error) {
	timeout := defaultProcessTimeout
	if limits.ProcessTimeoutMilliseconds != 0 {
		timeout = time.Duration(limits.ProcessTimeoutMilliseconds) * time.Millisecond
	}
	output := defaultMaxOutputBytes
	if limits.MaxOutputBytes != 0 {
		output = limits.MaxOutputBytes
	}
	if timeout <= 0 || timeout > maximumProcessTimeout || output <= 0 || output > maximumOutputBytes {
		return 0, 0, fmt.Errorf("run limits are outside allowed bounds")
	}
	return timeout, output, nil
}

func minimalEnvironment() []string {
	environment := []string{"LANG=C", "LC_ALL=C", "TZ=UTC"}
	if runtime.GOOS == "windows" {
		if systemRoot := os.Getenv("SYSTEMROOT"); systemRoot != "" {
			environment = append(environment, "SYSTEMROOT="+systemRoot)
		}
	}
	return environment
}

type limitedBuffer struct {
	buffer   bytes.Buffer
	limit    int64
	exceeded bool
}

func newLimitedBuffer(limit int64) *limitedBuffer {
	return &limitedBuffer{limit: limit}
}

func (buffer *limitedBuffer) Write(data []byte) (int, error) {
	remaining := buffer.limit - int64(buffer.buffer.Len())
	if remaining <= 0 {
		buffer.exceeded = true
		return len(data), nil
	}
	if int64(len(data)) > remaining {
		buffer.exceeded = true
		_, _ = buffer.buffer.Write(data[:remaining])
		return len(data), nil
	}
	return buffer.buffer.Write(data)
}

func (buffer *limitedBuffer) Bytes() []byte  { return buffer.buffer.Bytes() }
func (buffer *limitedBuffer) Exceeded() bool { return buffer.exceeded }

func failRequested(result wire.RunT0Result, fixtureIDs []string, class, code, message string) wire.RunT0Result {
	if len(fixtureIDs) == 0 {
		fixtureIDs = []string{"selection"}
	}
	for _, fixtureID := range fixtureIDs {
		result.Scenarios = append(result.Scenarios, failScenario(wire.ScenarioResult{
			FixtureID: fixtureID,
			Outcome:   "failed",
			Processes: []wire.ProcessObservation{},
			Checks:    []wire.CheckResult{},
		}, class, code, message))
	}
	return result
}

func failScenario(result wire.ScenarioResult, class, code, message string) wire.ScenarioResult {
	result.Outcome = "failed"
	result.Failure = &wire.Failure{Class: class, Code: code, Message: message}
	return result
}
