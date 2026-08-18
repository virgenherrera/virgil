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

// agentsDocFile is the fixed AGENTS.md filename virgil.init publishes
// alongside virgil.json. It mirrors protocol.VirgilConfigFile, which is the
// public constant for the config file's own fixed name.
const agentsDocFile = "AGENTS.md"

// schemaConfigFile is the fixed path (relative to targetRoot) where
// virgil.init materializes the canonical virgil.json JSON Schema. It is an
// independent oracle-side counterpart of repodocs' own schemaConfigRelPath
// constant, deliberately not imported from the internal package under test.
const schemaConfigFile = "docs/.virgil-schema.json"

func validateFreshInitResult(request protocol.OperationRequest, result protocol.OperationResult, snapshot map[string]snapshotEntry, targetRoot string) error {
	if result.Status != "success" || result.ReplayedFromRequest != "" || result.ResolvedContext == nil || result.Next.Operation != "virgil.write" {
		return fmt.Errorf("virgil.init did not return the required fresh success result")
	}
	if len(result.Diagnostics) != 0 || len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 || len(result.Effects) != 3 {
		return fmt.Errorf("fresh init result does not expose exactly three writes (virgil.json, AGENTS.md, docs/.virgil-schema.json) and zero events")
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

	var configEffect, agentsEffect, schemaEffect *protocol.EffectRecord
	for index := range result.Effects {
		effect := &result.Effects[index]
		switch effect.Resource.URI {
		case protocol.VirgilConfigFile:
			configEffect = effect
		case agentsDocFile:
			agentsEffect = effect
		case schemaConfigFile:
			schemaEffect = effect
		}
	}
	if configEffect == nil || agentsEffect == nil || schemaEffect == nil {
		return fmt.Errorf("fresh init result does not report writes for virgil.json, AGENTS.md, and the materialized schema")
	}
	for _, effect := range []*protocol.EffectRecord{configEffect, agentsEffect, schemaEffect} {
		if effect.Kind != "write" || !effect.Occurred || effect.PolicyDecision != "authorized" || effect.RequestID != request.RequestID ||
			effect.CausationID != request.RequestID || effect.Capability != "artifact_store.write" || effect.Observed == nil || effect.StateBefore != nil ||
			effect.StateAfter == nil || !reflect.DeepEqual(*effect.StateAfter, effect.Resource) {
			return fmt.Errorf("fresh init returned a non-authorized or incomplete write effect for %q", effect.Resource.URI)
		}
	}

	configEntry, found := snapshot[protocol.VirgilConfigFile]
	if !found || !configEntry.Mode.IsRegular() || configEntry.Digest != configEffect.Resource.Digest {
		return fmt.Errorf("write effect does not match the observed virgil.json file")
	}
	agentsEntry, found := snapshot[agentsDocFile]
	if !found || !agentsEntry.Mode.IsRegular() || agentsEntry.Digest != agentsEffect.Resource.Digest {
		return fmt.Errorf("write effect does not match the observed AGENTS.md file")
	}
	schemaEntry, found := snapshot[schemaConfigFile]
	if !found || !schemaEntry.Mode.IsRegular() || schemaEntry.Digest != schemaEffect.Resource.Digest {
		return fmt.Errorf("write effect does not match the observed materialized schema file")
	}
	return nil
}

// validatePublishedTree confirms the target root contains exactly
// virgil.json, AGENTS.md, and the materialized schema under docs/ — the
// only durable objects virgil.init or virgil.new (without an active change
// yet drafted) ever publishes.
func validatePublishedTree(targetRoot string, snapshot map[string]snapshotEntry) error {
	if len(snapshot) != 3 {
		return fmt.Errorf("published target contains %d file/symlink entries, want exactly 3 (virgil.json, AGENTS.md, docs/.virgil-schema.json)", len(snapshot))
	}
	entry, found := snapshot[protocol.VirgilConfigFile]
	if !found || !entry.Mode.IsRegular() {
		return fmt.Errorf("published target file virgil.json is missing or has the wrong kind")
	}
	agentsEntry, found := snapshot[agentsDocFile]
	if !found || !agentsEntry.Mode.IsRegular() {
		return fmt.Errorf("published target file AGENTS.md is missing or has the wrong kind")
	}
	schemaEntry, found := snapshot[schemaConfigFile]
	if !found || !schemaEntry.Mode.IsRegular() {
		return fmt.Errorf("published target file docs/.virgil-schema.json is missing or has the wrong kind")
	}
	return validateExactTree(targetRoot, map[string]string{
		protocol.VirgilConfigFile: "file",
		agentsDocFile:             "file",
		"docs":                    "dir",
		schemaConfigFile:          "file",
	})
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
		result.Next.Operation != "virgil.write" || len(result.Diagnostics) != 0 || len(result.Effects) != 0 {
		return fmt.Errorf("process B did not return a successful zero-write replay of process A")
	}
	if result.ResolvedContext == nil || len(result.Artifacts) != 0 || len(result.Briefs) != 0 || len(result.Events) != 0 {
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

const (
	frontmatterOpen  = "<!-- virgil:meta\n"
	frontmatterClose = "\n-->\n\n"

	// frontmatterOpenLegacyJSON and frontmatterOpenLegacyYAML are prior open
	// markers used by documents written before Virgil switched to the
	// HTML-comment frontmatter fence. They are accepted on read only,
	// mirroring repodocs.parseDocFrontmatter's backward compatibility. Both
	// legacy formats share the same closing delimiter,
	// frontmatterCloseLegacy.
	frontmatterOpenLegacyJSON = "---json\n" // pre-rc.7
	frontmatterOpenLegacyYAML = "---\n"     // rc.7 (commit 9fe8805)
	frontmatterCloseLegacy    = "\n---\n\n"
)

// splitFrontmatterForOracle is the independent, oracle-side counterpart of
// repodocs.parseArtifactFrontmatter: it re-derives the same split from raw
// bytes without importing the internal repodocs package, so the T0 oracle
// observes the artifact file exactly as any other reader would.
func splitFrontmatterForOracle(raw []byte) ([]byte, []byte, error) {
	var openMarker, closeMarker string
	switch {
	case bytes.HasPrefix(raw, []byte(frontmatterOpen)):
		openMarker, closeMarker = frontmatterOpen, frontmatterClose
	case bytes.HasPrefix(raw, []byte(frontmatterOpenLegacyJSON)):
		openMarker, closeMarker = frontmatterOpenLegacyJSON, frontmatterCloseLegacy
	case bytes.HasPrefix(raw, []byte(frontmatterOpenLegacyYAML)):
		openMarker, closeMarker = frontmatterOpenLegacyYAML, frontmatterCloseLegacy
	default:
		return nil, nil, fmt.Errorf("artifact file does not start with %q", frontmatterOpen)
	}
	rest := raw[len(openMarker):]
	closeIndex := bytes.Index(rest, []byte(closeMarker))
	if closeIndex < 0 {
		return nil, nil, fmt.Errorf("artifact file has no closing frontmatter marker")
	}
	return rest[:closeIndex], rest[closeIndex+len(closeMarker):], nil
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

	command := exec.CommandContext(childContext, executable, "pipe")
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
