package t0

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	if childResult.Result.Status == "unsupported" {
		scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "virgil-init", Status: "failed", Detail: "virgil.init returned unsupported in Phase 1"})
		return failScenario(scenario, "virgil_failure", "VIRGIL_INIT_NOT_IMPLEMENTED", "virgil.init is not implemented")
	}

	scenario.Checks = append(scenario.Checks, wire.CheckResult{CheckID: "evidence-bundle", Status: "failed", Detail: "Phase 1 does not yet execute or publish scenario evidence"})
	return failScenario(scenario, "virgil_failure", "T0_EXECUTION_NOT_IMPLEMENTED", "T0 execution and evidence are not implemented")
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
