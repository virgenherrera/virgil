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

	action, ok := firstInvoke(fixture)
	if !ok {
		return failScenario(scenario, "fixture_failure", "ACTOR_SCRIPT_HAS_NO_INVOKE", "ActorScript has no invoke action")
	}
	targetRoot := filepath.Join(envelope.WorkspaceRoot, fixture.Definition.FixtureID, "target")
	if err := os.MkdirAll(targetRoot, 0o700); err != nil {
		return failScenario(scenario, "environment_failure", "TARGET_UNAVAILABLE", "cannot materialize isolated target")
	}
	before, err := snapshotTree(envelope.WorkspaceRoot)
	if err != nil {
		return failScenario(scenario, "environment_failure", "WORKSPACE_SNAPSHOT_FAILED", "cannot snapshot workspace baseline")
	}

	invoke := wire.InvokeEnvelope{
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
		Clock: envelope.Clock,
	}
	childResult, process, err := invokeFreshProcess(ctx, runner.registry, envelope, invoke)
	if process.ProcessID != "" {
		scenario.Processes = append(scenario.Processes, process)
	}
	if err != nil {
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "public-invoke", Status: "failed", Detail: "public invoke process did not return a valid result"})
		return failScenario(scenario, "virgil_failure", "PUBLIC_INVOKE_FAILED", "Virgil public invoke plumbing failed")
	}
	after, err := snapshotTree(envelope.WorkspaceRoot)
	if err != nil {
		return failScenario(scenario, "environment_failure", "WORKSPACE_SNAPSHOT_FAILED", "cannot snapshot workspace after invoke")
	}
	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "public-invoke", Status: "passed", Detail: "public invoke returned a schema-valid and correlated result"})

	if fixture.Definition.FixtureID == "t0-init-unmanaged-write-blocked" {
		if err := validateBlockedScenario(fixture, childResult, before, after); err != nil {
			scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "blocked-policy-oracle", Status: "failed", Detail: "blocked policy result violated its fixture oracle"})
			return failScenario(scenario, "virgil_failure", "BLOCKED_POLICY_ORACLE_FAILED", err.Error())
		}
		scenario.Checks = append(scenario.Checks,
			wire.CheckResult{CheckID: "blocked-policy-oracle", Status: "passed", Detail: "blocked result, diagnostic, denied effect, and stop action match the fixture"},
			wire.CheckResult{CheckID: "workspace-zero-diff", Status: "passed", Detail: "independent workspace snapshots are identical"},
		)
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "evidence-bundle", Status: "failed", Detail: "EvidenceBundle publication is intentionally outside this Green increment"})
		return failScenario(scenario, "virgil_failure", "EVIDENCE_BUNDLE_NOT_IMPLEMENTED", "blocked behavior is Green at the operation boundary, but the app-level scenario remains Red until complete evidence is published")
	}
	if childResult.Result.Status == "unsupported" {
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "virgil-init", Status: "failed", Detail: "virgil.init returned unsupported in Phase 1"})
		return failScenario(scenario, "virgil_failure", "VIRGIL_INIT_NOT_IMPLEMENTED", "virgil.init is not implemented")
	}

	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "evidence-bundle", Status: "failed", Detail: "Phase 1 does not yet execute or publish scenario evidence"})
	return failScenario(scenario, "virgil_failure", "T0_EXECUTION_NOT_IMPLEMENTED", "T0 execution and evidence are not implemented")
}

type snapshotEntry struct {
	Mode   os.FileMode
	Size   int64
	Digest string
	Link   string
}

func snapshotTree(root string) (map[string]snapshotEntry, error) {
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
		info, err := os.Lstat(entryPath)
		if err != nil {
			return err
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
		}
		snapshot[filepath.ToSlash(relative)] = record
		return nil
	})
	if err != nil {
		return nil, err
	}
	return snapshot, nil
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

func firstInvoke(fixture contracts.Fixture) (action struct {
	ProcessID        string
	OperationRequest json.RawMessage
}, ok bool) {
	for _, candidate := range fixture.Script.Actions {
		if candidate.Kind == "invoke" && len(candidate.OperationRequest) != 0 {
			return struct {
				ProcessID        string
				OperationRequest json.RawMessage
			}{ProcessID: candidate.ProcessID, OperationRequest: candidate.OperationRequest}, true
		}
	}
	return action, false
}

func invokeFreshProcess(ctx context.Context, registry *contracts.Registry, envelope wire.RunT0Envelope, invoke wire.InvokeEnvelope) (wire.InvokeResult, wire.ProcessObservation, error) {
	timeout, outputLimit, err := effectiveLimits(envelope.Limits)
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, err
	}
	childContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	executable, err := os.Executable()
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, fmt.Errorf("resolve current executable: %w", err)
	}
	payload, err := json.Marshal(invoke)
	if err != nil {
		return wire.InvokeResult{}, wire.ProcessObservation{}, fmt.Errorf("marshal invoke envelope: %w", err)
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
		return wire.InvokeResult{}, wire.ProcessObservation{}, fmt.Errorf("start public invoke process: %w", err)
	}
	process := wire.ProcessObservation{ProcessID: invoke.ProcessID, OSPID: command.Process.Pid, ExitCode: -1}
	waitErr := command.Wait()
	process.ExitCode = command.ProcessState.ExitCode()
	if errors.Is(childContext.Err(), context.DeadlineExceeded) {
		return wire.InvokeResult{}, process, fmt.Errorf("public invoke process timed out")
	}
	if waitErr != nil {
		return wire.InvokeResult{}, process, fmt.Errorf("public invoke process exited %d", process.ExitCode)
	}
	if stdout.Exceeded() || stderr.Exceeded() {
		return wire.InvokeResult{}, process, fmt.Errorf("public invoke process exceeded output limit")
	}
	decoded, err := wire.DecodeInvokeResult(stdout.Bytes())
	if err != nil {
		return wire.InvokeResult{}, process, err
	}
	if decoded.ProcessID != invoke.ProcessID || decoded.OSPID != process.OSPID {
		return wire.InvokeResult{}, process, fmt.Errorf("public invoke process identity mismatch")
	}
	if err := validateChildOperationResult(registry, invoke.Request, decoded.Result); err != nil {
		return wire.InvokeResult{}, process, err
	}
	return decoded, process, nil
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
