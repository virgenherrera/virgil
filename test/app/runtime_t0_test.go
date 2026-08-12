package app_test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/gowebpki/jcs"
)

const runtimeProtocol = "virgil.dev/runtime/v1alpha1"

func TestApp_T0InitRepoDocsHappy(t *testing.T) {
	execution := runT0(t, "t0-init-repo-docs-happy")
	assertScenarioPassed(t, execution, "t0-init-repo-docs-happy")
}

func TestApp_T0InitUnmanagedWriteBlocked(t *testing.T) {
	execution := runT0(t, "t0-init-unmanaged-write-blocked")
	assertScenarioPassed(t, execution, "t0-init-unmanaged-write-blocked")
}

func TestApp_T0InitIdempotentRetryFreshProcess(t *testing.T) {
	execution := runT0(t, "t0-init-idempotent-retry")
	assertScenarioPassed(t, execution, "t0-init-idempotent-retry")
}

func TestApp_T0NewRepoDocsHappy(t *testing.T) {
	execution := runT0(t, "t0-new-repo-docs-happy")
	assertScenarioPassed(t, execution, "t0-new-repo-docs-happy")
}

func TestApp_T0NewChangeIdCollision(t *testing.T) {
	execution := runT0(t, "t0-new-change-id-collision")
	assertScenarioPassed(t, execution, "t0-new-change-id-collision")
}

func TestApp_T0ContinueContentProposalHappy(t *testing.T) {
	const fixtureID = "t0-continue-content-proposal-happy"
	execution := runT0Seeded(t, fixtureID, func(targetRoot string) error {
		seedDir := filepath.Join(targetRoot, "seed")
		if err := os.MkdirAll(seedDir, 0o700); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(seedDir, "idea-proposal.md"), []byte(continueContentProposalSeed), 0o600)
	})
	assertScenarioPassed(t, execution, fixtureID)
}

// continueContentProposalSeed is the content_proposal source file the T0
// ActorScript for t0-continue-content-proposal-happy references by relative
// path (seed/idea-proposal.md). ActorScript actions cannot themselves write
// arbitrary target files, so the harness materializes this file directly on
// disk before the isolated public binary is invoked. Its bytes are fixed so
// the digest embedded in the fixture's actor-script.json stays correlated.
const continueContentProposalSeed = "# Idea Proposal\n\nThis is the initial idea proposal for change-continue-alpha.\n"

func TestApp_T0ContinueRequestChanges(t *testing.T) {
	const fixtureID = "t0-continue-request-changes"
	execution := runT0Seeded(t, fixtureID, func(targetRoot string) error {
		seedDir := filepath.Join(targetRoot, "seed")
		if err := os.MkdirAll(seedDir, 0o700); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(seedDir, "idea-proposal.md"), []byte(continueRequestChangesSeed), 0o600)
	})
	assertScenarioPassed(t, execution, fixtureID)
}

// continueRequestChangesSeed is the content_proposal source file the T0
// ActorScript for t0-continue-request-changes references by relative path
// (seed/idea-proposal.md). See continueContentProposalSeed for why the T0
// harness must materialize it directly on disk. Its bytes are fixed so the
// digest embedded in the fixture's actor-script.json stays correlated.
const continueRequestChangesSeed = "# Idea Proposal\n\nThis is the initial idea proposal for change-request-changes.\n"

func TestApp_T0ContinueIdempotentRetry(t *testing.T) {
	const fixtureID = "t0-continue-idempotent-retry"
	execution := runT0Seeded(t, fixtureID, func(targetRoot string) error {
		seedDir := filepath.Join(targetRoot, "seed")
		if err := os.MkdirAll(seedDir, 0o700); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(seedDir, "idea-proposal.md"), []byte(continueIdempotentRetrySeed), 0o600)
	})
	assertScenarioPassed(t, execution, fixtureID)
}

// continueIdempotentRetrySeed is the content_proposal source file the T0
// ActorScript for t0-continue-idempotent-retry references by relative path
// (seed/idea-proposal.md). See continueContentProposalSeed for why the T0
// harness must materialize it directly on disk. Its bytes are fixed so the
// digest embedded in the fixture's actor-script.json stays correlated. Both
// content_proposal actions in the script reference this same file, since the
// retry must present the identical content digest as the first proposal.
const continueIdempotentRetrySeed = "# Idea Proposal\n\nThis is the initial idea proposal for change-retry-alpha.\n"

func TestApp_T0ContinueOutOfScopeWriteBlocked(t *testing.T) {
	execution := runT0(t, "t0-continue-out-of-scope-write-blocked")
	assertScenarioPassed(t, execution, "t0-continue-out-of-scope-write-blocked")
}

func TestApp_T0ContinueHandoffComplete(t *testing.T) {
	const fixtureID = "t0-continue-handoff-complete"
	execution := runT0Seeded(t, fixtureID, func(targetRoot string) error {
		seedDir := filepath.Join(targetRoot, "seed")
		if err := os.MkdirAll(seedDir, 0o700); err != nil {
			return err
		}
		seeds := map[string]string{
			"idea-proposal.md":    continueHandoffCompleteIdeaSeed,
			"spec-proposal.md":    continueHandoffCompleteSpecSeed,
			"design-proposal.md":  continueHandoffCompleteDesignSeed,
			"tasks-proposal.md":   continueHandoffCompleteTasksSeed,
			"handoff-proposal.md": continueHandoffCompleteHandoffSeed,
		}
		for name, content := range seeds {
			if err := os.WriteFile(filepath.Join(seedDir, name), []byte(content), 0o600); err != nil {
				return err
			}
		}
		return nil
	})
	assertScenarioPassed(t, execution, fixtureID)
}

// The continueHandoffComplete*Seed constants are the content_proposal source
// files the T0 ActorScript for t0-continue-handoff-complete references by
// relative path (seed/{kind}-proposal.md), one per artifact_kind in the
// idea -> spec -> design -> tasks -> handoff progression. See
// continueContentProposalSeed for why the T0 harness must materialize them
// directly on disk. Their bytes are fixed so the digests embedded in the
// fixture's actor-script.json stay correlated.
const continueHandoffCompleteIdeaSeed = "# Idea Proposal\n\nThis is the initial idea proposal for change-handoff-alpha.\n"
const continueHandoffCompleteSpecSeed = "# Spec Proposal\n\nThis is the spec proposal for change-handoff-alpha.\n"
const continueHandoffCompleteDesignSeed = "# Design Proposal\n\nThis is the design proposal for change-handoff-alpha.\n"
const continueHandoffCompleteTasksSeed = "# Tasks Proposal\n\nThis is the tasks proposal for change-handoff-alpha.\n"
const continueHandoffCompleteHandoffSeed = "# Handoff Proposal\n\nThis is the handoff proposal for change-handoff-alpha.\n"

type runResult struct {
	RuntimeProtocol string           `json:"runtime_protocol"`
	Kind            string           `json:"kind"`
	Outcome         string           `json:"outcome"`
	Scenarios       []scenarioResult `json:"scenarios"`
}

type scenarioResult struct {
	FixtureID string               `json:"fixture_id"`
	Outcome   string               `json:"outcome"`
	Processes []processObservation `json:"processes"`
	Checks    []checkResult        `json:"checks"`
	Failure   *failure             `json:"failure,omitempty"`
	Evidence  *evidenceReference   `json:"evidence,omitempty"`
}

type failure struct {
	Class   string `json:"class"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type processObservation struct {
	ProcessID string `json:"process_id"`
	OSPID     int    `json:"os_pid"`
	ExitCode  int    `json:"exit_code"`
}

type checkResult struct {
	CheckID string `json:"check_id"`
	Status  string `json:"status"`
	Detail  string `json:"detail"`
}

type evidenceReference struct {
	URI    string `json:"uri"`
	Digest string `json:"digest"`
}

type immutableResourceRef struct {
	URI      string `json:"uri"`
	Revision string `json:"revision,omitempty"`
	Digest   string `json:"digest"`
}

type evidenceManifest struct {
	SchemaVersion   string `json:"schema_version"`
	ProtocolVersion string `json:"protocol_version"`
	BundleID        string `json:"bundle_id"`
	Layer           string `json:"layer"`
	Fixture         struct {
		FixtureID       string `json:"fixture_id"`
		FixtureRevision string `json:"fixture_revision"`
		Digest          string `json:"digest"`
	} `json:"fixture"`
	Trace        immutableResourceRef `json:"trace"`
	RunnerReport immutableResourceRef `json:"runner_report"`
	Contents     []struct {
		Role      string               `json:"role"`
		SchemaID  string               `json:"schema_id"`
		MediaType string               `json:"media_type"`
		Resource  immutableResourceRef `json:"resource"`
	} `json:"contents"`
	Diffs struct {
		Target immutableResourceRef `json:"target"`
		Store  immutableResourceRef `json:"store"`
	} `json:"diffs"`
	Checks []struct {
		CheckID string `json:"check_id"`
		Status  string `json:"status"`
	} `json:"checks"`
	Outcome struct {
		Status string `json:"status"`
	} `json:"outcome"`
	PublishedAtomically bool `json:"published_atomically"`
	Integrity           struct {
		Digest           string `json:"digest"`
		Canonicalization string `json:"canonicalization"`
	} `json:"integrity"`
}

type evidenceRunnerReport struct {
	SchemaVersion string `json:"schema_version"`
	Fixture       struct {
		FixtureID string `json:"fixture_id"`
		Digest    string `json:"digest"`
	} `json:"fixture"`
	Processes []struct {
		ProcessID    string   `json:"process_id"`
		PID          int      `json:"pid"`
		FreshProcess bool     `json:"fresh_process"`
		ExitCode     int      `json:"exit_code"`
		ActionIDs    []string `json:"action_ids"`
		RequestIDs   []string `json:"request_ids"`
	} `json:"processes"`
	Checkpoints []struct {
		CheckpointID string `json:"checkpoint_id"`
		RelativeTo   string `json:"relative_to"`
		Target       struct {
			Diff immutableResourceRef `json:"diff"`
		} `json:"target"`
		Store struct {
			Diff immutableResourceRef `json:"diff"`
		} `json:"store"`
	} `json:"checkpoints"`
	Checks []struct {
		CheckID string `json:"check_id"`
		Status  string `json:"status"`
	} `json:"checks"`
	Outcome struct {
		Status string `json:"status"`
	} `json:"outcome"`
}

type evidenceTrace struct {
	SchemaVersion string `json:"schema_version"`
	Fixture       struct {
		FixtureID string `json:"fixture_id"`
		Digest    string `json:"digest"`
	} `json:"fixture"`
	Entries []struct {
		EntryID     string `json:"entry_id"`
		Sequence    int    `json:"sequence"`
		Kind        string `json:"kind"`
		ProcessID   string `json:"process_id"`
		CausationID string `json:"causation_id"`
	} `json:"entries"`
	Outcome struct {
		Status string `json:"status"`
	} `json:"outcome"`
}

type evidenceDiff struct {
	Changes []struct {
		Path string `json:"path"`
	} `json:"changes"`
}

type appRun struct {
	Result        runResult
	WorkspaceRoot string
	EvidenceRoot  string
}

func runT0(t *testing.T, fixtureID string) appRun {
	t.Helper()
	return runT0Seeded(t, fixtureID, nil)
}

// runT0Seeded runs a T0 fixture exactly like runT0, except that when seed is
// non-nil it materializes fixture-owned content directly under the isolated
// target root before the isolated public binary is invoked. This is the only
// way to give an ActorScript action (e.g. a content_proposal entry) a real
// file to read: ActorScript actions are limited to invoke/retry/
// restart_process/stop and cannot themselves write arbitrary target files.
func runT0Seeded(t *testing.T, fixtureID string, seed func(targetRoot string) error) appRun {
	t.Helper()
	binary := buildPublicBinary(t)
	isolationRoot := t.TempDir()
	workspaceRoot := filepath.Join(isolationRoot, "workspace")
	evidenceRoot := filepath.Join(isolationRoot, "evidence")
	if err := os.Mkdir(workspaceRoot, 0o700); err != nil {
		t.Fatalf("create isolated workspace: %v", err)
	}
	if err := os.Mkdir(evidenceRoot, 0o700); err != nil {
		t.Fatalf("create isolated evidence root: %v", err)
	}
	if seed != nil {
		targetRoot := filepath.Join(workspaceRoot, fixtureID, "target")
		if err := os.MkdirAll(targetRoot, 0o700); err != nil {
			t.Fatalf("materialize isolated target for seeding: %v", err)
		}
		if err := seed(targetRoot); err != nil {
			t.Fatalf("seed isolated target content: %v", err)
		}
	}
	request := map[string]any{
		"runtime_protocol": runtimeProtocol,
		"kind":             "run_t0",
		"fixture_ids":      []string{fixtureID},
		"workspace_root":   workspaceRoot,
		"evidence_root":    evidenceRoot,
		"clock": map[string]string{
			"now": "2030-01-01T00:00:00Z",
		},
	}
	payload, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal run_t0 request: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, binary)
	command.Dir = isolationRoot
	command.Env = appEnvironment()
	command.Stdin = bytes.NewReader(payload)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("invoke public binary: %v; stderr=%q", err, stderr.String())
	}
	if ctx.Err() != nil {
		t.Fatalf("invoke public binary: %v", ctx.Err())
	}

	var result runResult
	decoder := json.NewDecoder(&stdout)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("decode run_t0_result: %v; stdout=%q; stderr=%q", err, stdout.String(), stderr.String())
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		t.Fatalf("public binary emitted more than one JSON value: %v; stdout=%q", err, stdout.String())
	}
	return appRun{Result: result, WorkspaceRoot: workspaceRoot, EvidenceRoot: evidenceRoot}
}

func buildPublicBinary(t *testing.T) string {
	t.Helper()
	repositoryRoot := filepath.Clean(filepath.Join(sourceDirectory(t), "..", ".."))
	binaryName := "virgil"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binary := filepath.Join(t.TempDir(), binaryName)
	command := exec.Command("go", "build", "-o", binary, "./cmd/virgil")
	command.Dir = repositoryRoot
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("compile public binary: %v; output=%q", err, string(output))
	}
	return binary
}

func sourceDirectory(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app test source directory")
	}
	return filepath.Dir(file)
}

func assertScenarioPassed(t *testing.T, execution appRun, fixtureID string) {
	t.Helper()
	result := execution.Result
	if result.RuntimeProtocol != runtimeProtocol || result.Kind != "run_t0_result" {
		t.Fatalf("unexpected public response %q/%q", result.RuntimeProtocol, result.Kind)
	}
	if result.Outcome != "passed" {
		t.Fatalf("expected T0 outcome passed, got %q: %+v", result.Outcome, result.Scenarios)
	}
	if len(result.Scenarios) != 1 || result.Scenarios[0].FixtureID != fixtureID {
		t.Fatalf("expected only scenario %q, got %+v", fixtureID, result.Scenarios)
	}
	if result.Scenarios[0].Outcome != "passed" {
		t.Fatalf("expected scenario %q passed, got %+v", fixtureID, result.Scenarios[0])
	}
	scenario := result.Scenarios[0]
	if scenario.Failure != nil {
		t.Fatalf("passed scenario %q retained failure: %+v", fixtureID, scenario.Failure)
	}
	assertProcesses(t, fixtureID, scenario.Processes)
	assertChecks(t, scenario.Checks)
	assertEvidence(t, execution.EvidenceRoot, fixtureID, scenario.Processes, scenario.Checks, scenario.Evidence)
	assertWorkspace(t, execution.WorkspaceRoot, fixtureID)
}

func assertProcesses(t *testing.T, fixtureID string, processes []processObservation) {
	t.Helper()
	wantCount := 1
	switch fixtureID {
	case "t0-init-idempotent-retry", "t0-new-repo-docs-happy":
		wantCount = 2
	case "t0-new-change-id-collision":
		wantCount = 3
	case "t0-continue-content-proposal-happy", "t0-continue-request-changes", "t0-continue-idempotent-retry":
		wantCount = 4
	case "t0-continue-out-of-scope-write-blocked":
		wantCount = 3
	case "t0-continue-handoff-complete":
		wantCount = 12
	}
	if len(processes) != wantCount {
		t.Fatalf("scenario %q: expected %d fresh processes, got %+v", fixtureID, wantCount, processes)
	}
	// process_id names the actor's logical, continuous working session: it may
	// legitimately repeat across several fresh OS processes when the
	// ActorScript issues consecutive invoke actions with no restart_process
	// boundary in between (e.g. init immediately followed by new). Only the
	// operating-system PID is required to be unique within a scenario.
	processIDs := make(map[string]struct{}, len(processes))
	pids := make(map[int]struct{}, len(processes))
	for _, process := range processes {
		if process.ProcessID == "" || process.OSPID <= 0 || process.ExitCode != 0 {
			t.Fatalf("scenario %q: invalid process observation %+v", fixtureID, process)
		}
		if _, duplicate := pids[process.OSPID]; duplicate {
			t.Fatalf("scenario %q: PID %d was reused", fixtureID, process.OSPID)
		}
		processIDs[process.ProcessID] = struct{}{}
		pids[process.OSPID] = struct{}{}
	}
	if fixtureID == "t0-init-idempotent-retry" {
		if _, ok := processIDs["process-a"]; !ok {
			t.Fatal("retry scenario did not observe process-a")
		}
		if _, ok := processIDs["process-b"]; !ok {
			t.Fatal("retry scenario did not observe process-b")
		}
	}
}

func assertChecks(t *testing.T, checks []checkResult) {
	t.Helper()
	if len(checks) == 0 {
		t.Fatal("passed scenario has no checks")
	}
	seen := make(map[string]struct{}, len(checks))
	for _, check := range checks {
		if check.CheckID == "" || check.Status != "passed" {
			t.Fatalf("passed scenario contains invalid check %+v", check)
		}
		if _, duplicate := seen[check.CheckID]; duplicate {
			t.Fatalf("passed scenario contains duplicate check_id %q", check.CheckID)
		}
		seen[check.CheckID] = struct{}{}
	}
}

func assertEvidence(t *testing.T, evidenceRoot, fixtureID string, processes []processObservation, scenarioChecks []checkResult, evidence *evidenceReference) {
	t.Helper()
	if evidence == nil {
		t.Fatal("passed scenario has no EvidenceReference")
	}
	manifestReference := immutableResourceRef{URI: evidence.URI, Digest: evidence.Digest}
	content := readEvidenceResource(t, evidenceRoot, manifestReference)
	assertSealedIntegrity(t, "EvidenceBundle manifest", content)
	var manifest evidenceManifest
	decodeOneJSONValue(t, "EvidenceBundle manifest", content, &manifest)
	if manifest.SchemaVersion != "virgil.dev/evidence-bundle/v1alpha1" ||
		manifest.ProtocolVersion != "virgil.dev/planning-slice1/v1alpha1" || manifest.BundleID == "" || manifest.Layer != "T0" {
		t.Fatalf("unexpected EvidenceBundle identity %q/%q/%q", manifest.SchemaVersion, manifest.ProtocolVersion, manifest.Layer)
	}
	if manifest.Fixture.FixtureID != fixtureID || manifest.Fixture.FixtureRevision == "" || manifest.Fixture.Digest == "" {
		t.Fatalf("EvidenceBundle fixture mismatch: %+v", manifest.Fixture)
	}
	if manifest.Outcome.Status != "passed" || !manifest.PublishedAtomically ||
		manifest.Integrity.Digest == "" || manifest.Integrity.Canonicalization != "RFC8785" {
		t.Fatalf("EvidenceBundle cannot certify passed: outcome=%q atomic=%v integrity=%q", manifest.Outcome.Status, manifest.PublishedAtomically, manifest.Integrity.Digest)
	}
	assertManifestChecks(t, manifest, scenarioChecks)

	traceBytes := readEvidenceResource(t, evidenceRoot, manifest.Trace)
	reportBytes := readEvidenceResource(t, evidenceRoot, manifest.RunnerReport)
	targetDiffBytes := readEvidenceResource(t, evidenceRoot, manifest.Diffs.Target)
	storeDiffBytes := readEvidenceResource(t, evidenceRoot, manifest.Diffs.Store)
	assertSealedIntegrity(t, "AgentInteractionTrace", traceBytes)
	assertSealedIntegrity(t, "RunnerObservationReport", reportBytes)
	assertTrace(t, fixtureID, manifest.Fixture.Digest, processes, traceBytes)
	assertRunnerReport(t, evidenceRoot, fixtureID, manifest.Fixture.Digest, processes, reportBytes)
	assertStoreDiffSubset(t, targetDiffBytes, storeDiffBytes)

	if len(manifest.Contents) == 0 {
		t.Fatal("EvidenceBundle has no content resources")
	}
	expectedFiles := map[string]struct{}{evidenceFilePath(t, evidence.URI): {}}
	roleCounts := make(map[string]int)
	for _, item := range manifest.Contents {
		if !validContentContract(item.Role, item.SchemaID, item.MediaType) {
			t.Fatalf("EvidenceBundle content has invalid role/schema/media contract: %+v", item)
		}
		resourceBytes := readEvidenceResource(t, evidenceRoot, item.Resource)
		if item.MediaType == "application/json" && item.Role != "trace" && item.Role != "runner_report" {
			assertOneJSONValue(t, item.Role, resourceBytes)
		}
		roleCounts[item.Role]++
		expectedFiles[evidenceFilePath(t, item.Resource.URI)] = struct{}{}
	}
	assertContentCardinality(t, fixtureID, roleCounts)
	if manifest.Trace != findContentResource(t, manifest, "trace") || manifest.RunnerReport != findContentResource(t, manifest, "runner_report") ||
		manifest.Diffs.Target != findContentResourceByValue(t, manifest, "filesystem_diff", manifest.Diffs.Target) ||
		manifest.Diffs.Store != findContentResourceByValue(t, manifest, "filesystem_diff", manifest.Diffs.Store) {
		t.Fatal("EvidenceBundle top-level references are not closed over typed contents")
	}
	assertEvidenceTree(t, evidenceRoot, filepath.Dir(evidenceFilePath(t, evidence.URI)), expectedFiles)
}

func assertManifestChecks(t *testing.T, manifest evidenceManifest, scenarioChecks []checkResult) {
	t.Helper()
	if len(manifest.Checks) == 0 {
		t.Fatal("EvidenceBundle has no checks")
	}
	scenario := make(map[string]string, len(scenarioChecks))
	for _, check := range scenarioChecks {
		scenario[check.CheckID] = check.Status
	}
	for _, check := range manifest.Checks {
		if check.CheckID == "" || check.Status != "passed" || scenario[check.CheckID] != "passed" {
			t.Fatalf("EvidenceBundle contains an uncorrelated or non-passing check: %+v", check)
		}
	}
	if scenario["evidence-bundle"] != "passed" {
		t.Fatal("public scenario did not report evidence-bundle publication")
	}
}

func assertTrace(t *testing.T, fixtureID, fixtureDigest string, processes []processObservation, content []byte) {
	t.Helper()
	var trace evidenceTrace
	decodeOneJSONValue(t, "AgentInteractionTrace", content, &trace)
	if trace.SchemaVersion != "virgil.dev/agent-interaction-trace/v1alpha1" || trace.Fixture.FixtureID != fixtureID ||
		trace.Fixture.Digest != fixtureDigest || trace.Outcome.Status != "passed" || len(trace.Entries) == 0 {
		t.Fatalf("invalid AgentInteractionTrace identity/outcome: %+v", trace)
	}
	knownProcesses := make(map[string]struct{}, len(processes))
	for _, process := range processes {
		knownProcesses[process.ProcessID] = struct{}{}
	}
	entryPositions := make(map[string]int, len(trace.Entries))
	requestRoots := map[string]struct{}{
		"init-happy-001":            {},
		"init-unmanaged-001":        {},
		"init-retry-001-a":          {},
		"init-new-happy-001":        {},
		"init-collision-001":        {},
		"init-continue-happy-001":   {},
		"init-request-changes-001":  {},
		"init-continue-retry-001":   {},
		"init-blocked-001":          {},
		"init-handoff-complete-001": {},
	}
	for index, entry := range trace.Entries {
		if entry.Sequence != index || entry.EntryID == "" || entry.Kind == "" {
			t.Fatalf("trace entry %d is not sequenced or identified: %+v", index, entry)
		}
		if _, ok := knownProcesses[entry.ProcessID]; !ok {
			t.Fatalf("trace entry %q references unknown process %q", entry.EntryID, entry.ProcessID)
		}
		if _, root := requestRoots[entry.CausationID]; !root {
			if cause, ok := entryPositions[entry.CausationID]; !ok || cause >= index {
				t.Fatalf("trace entry %q has non-causal predecessor %q", entry.EntryID, entry.CausationID)
			}
		}
		entryPositions[entry.EntryID] = index
	}
}

func assertRunnerReport(t *testing.T, evidenceRoot, fixtureID, fixtureDigest string, processes []processObservation, content []byte) {
	t.Helper()
	var report evidenceRunnerReport
	decodeOneJSONValue(t, "RunnerObservationReport", content, &report)
	if report.SchemaVersion != "virgil.dev/runner-observation-report/v1alpha1" || report.Fixture.FixtureID != fixtureID ||
		report.Fixture.Digest != fixtureDigest || report.Outcome.Status != "passed" || len(report.Checkpoints) == 0 {
		t.Fatalf("invalid RunnerObservationReport identity/outcome: %+v", report)
	}
	// Correlate by OS PID, not process_id: process_id names a logical actor
	// session and may repeat across several fresh OS processes (see
	// assertProcesses), while OSPID is guaranteed unique within a scenario.
	public := make(map[int]processObservation, len(processes))
	for _, process := range processes {
		public[process.OSPID] = process
	}
	if len(report.Processes) != len(processes) {
		t.Fatalf("runner report process count %d differs from public %d", len(report.Processes), len(processes))
	}
	for _, process := range report.Processes {
		observed, ok := public[process.PID]
		if !ok || process.ProcessID != observed.ProcessID || process.ExitCode != observed.ExitCode || !process.FreshProcess ||
			len(process.ActionIDs) == 0 || len(process.RequestIDs) == 0 {
			t.Fatalf("runner report process is not the public fresh process: %+v", process)
		}
	}
	checkSeen := make(map[string]struct{}, len(report.Checks))
	for _, check := range report.Checks {
		if check.CheckID == "" || check.Status != "passed" {
			t.Fatalf("runner report contains non-passing check: %+v", check)
		}
		checkSeen[check.CheckID] = struct{}{}
	}
	if _, ok := checkSeen["no_unexpected_nodes"]; !ok {
		t.Fatal("runner report omitted no_unexpected_nodes")
	}
	for _, checkpoint := range report.Checkpoints {
		if checkpoint.CheckpointID == "" || checkpoint.RelativeTo == "" {
			t.Fatalf("runner checkpoint is incomplete: %+v", checkpoint)
		}
		readEvidenceResource(t, evidenceRoot, checkpoint.Target.Diff)
		readEvidenceResource(t, evidenceRoot, checkpoint.Store.Diff)
	}
}

func assertStoreDiffSubset(t *testing.T, targetRaw, storeRaw []byte) {
	t.Helper()
	var target evidenceDiff
	var store evidenceDiff
	decodeOneJSONValue(t, "target filesystem diff", targetRaw, &target)
	decodeOneJSONValue(t, "store filesystem diff", storeRaw, &store)
	targetPaths := make(map[string]struct{}, len(target.Changes))
	for _, change := range target.Changes {
		targetPaths[change.Path] = struct{}{}
	}
	for _, change := range store.Changes {
		if _, ok := targetPaths[change.Path]; !ok {
			t.Fatalf("store diff path %q is absent from target diff", change.Path)
		}
	}
}

func assertSealedIntegrity(t *testing.T, label string, content []byte) {
	t.Helper()
	var document map[string]any
	decodeOneJSONValue(t, label, content, &document)
	integrityValue, ok := document["integrity"]
	if !ok {
		t.Fatalf("%s has no integrity object", label)
	}
	integrityObject, ok := integrityValue.(map[string]any)
	if !ok || integrityObject["canonicalization"] != "RFC8785" {
		t.Fatalf("%s integrity is not RFC8785", label)
	}
	wantDigest, ok := integrityObject["digest"].(string)
	if !ok || wantDigest == "" {
		t.Fatalf("%s integrity has no digest", label)
	}
	delete(integrityObject, "digest")
	unsigned, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("marshal unsigned %s: %v", label, err)
	}
	canonical, err := jcs.Transform(unsigned)
	if err != nil {
		t.Fatalf("canonicalize unsigned %s: %v", label, err)
	}
	gotDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(canonical))
	if gotDigest != wantDigest {
		t.Fatalf("%s integrity mismatch: got %q want %q", label, wantDigest, gotDigest)
	}
}

func decodeOneJSONValue(t *testing.T, label string, content []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		t.Fatalf("%s contains more than one JSON value: %v", label, err)
	}
}

func assertOneJSONValue(t *testing.T, label string, content []byte) {
	t.Helper()
	var value any
	decodeOneJSONValue(t, label, content, &value)
}

func validContentContract(role, schemaID, mediaType string) bool {
	contracts := map[string][2]string{
		"trace":               {"https://schemas.virgil.dev/planning-slice1/v1alpha1/agent-interaction-trace.schema.json", "application/json"},
		"event_log":           {"https://schemas.virgil.dev/planning-slice1/v1alpha1/project-initialized-event.schema.json", "application/x-ndjson"},
		"project_state":       {"https://schemas.virgil.dev/planning-slice1/v1alpha1/project-state.schema.json", "application/json"},
		"filesystem_snapshot": {"https://schemas.virgil.dev/planning-slice1/v1alpha1/filesystem-snapshot.schema.json", "application/json"},
		"filesystem_diff":     {"https://schemas.virgil.dev/planning-slice1/v1alpha1/filesystem-diff.schema.json", "application/json"},
		"runner_report":       {"https://schemas.virgil.dev/planning-slice1/v1alpha1/runner-observation-report.schema.json", "application/json"},
	}
	want, ok := contracts[role]
	return ok && want[0] == schemaID && want[1] == mediaType
}

func assertContentCardinality(t *testing.T, fixtureID string, counts map[string]int) {
	t.Helper()
	for _, role := range []string{"trace", "event_log", "runner_report"} {
		if counts[role] != 1 {
			t.Fatalf("EvidenceBundle has %d %s resources, want one", counts[role], role)
		}
	}
	wantProjectState := 1
	if fixtureID == "t0-init-unmanaged-write-blocked" {
		wantProjectState = 0
	}
	if counts["project_state"] != wantProjectState || counts["filesystem_snapshot"] < 2 || counts["filesystem_diff"] < 2 {
		t.Fatalf("EvidenceBundle content cardinality is invalid: %+v", counts)
	}
}

func findContentResource(t *testing.T, manifest evidenceManifest, role string) immutableResourceRef {
	t.Helper()
	var found immutableResourceRef
	count := 0
	for _, item := range manifest.Contents {
		if item.Role == role {
			found, count = item.Resource, count+1
		}
	}
	if count != 1 {
		t.Fatalf("EvidenceBundle has %d content resources for role %q", count, role)
	}
	return found
}

func findContentResourceByValue(t *testing.T, manifest evidenceManifest, role string, resource immutableResourceRef) immutableResourceRef {
	t.Helper()
	count := 0
	for _, item := range manifest.Contents {
		if item.Role == role && item.Resource == resource {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("EvidenceBundle resource %+v is not exactly once under role %q", resource, role)
	}
	return resource
}

func assertEvidenceTree(t *testing.T, evidenceRoot, bundleRoot string, expectedFiles map[string]struct{}) {
	t.Helper()
	evidenceRoot = filepath.Clean(evidenceRoot)
	bundleRoot = filepath.Clean(bundleRoot)
	expectedDirectories := map[string]struct{}{
		evidenceRoot:                           {},
		bundleRoot:                             {},
		filepath.Join(bundleRoot, "snapshots"): {},
		filepath.Join(bundleRoot, "diffs"):     {},
	}
	seenFiles := make(map[string]struct{}, len(expectedFiles))
	err := filepath.WalkDir(evidenceRoot, func(entryPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		entryPath = filepath.Clean(entryPath)
		info, err := os.Lstat(entryPath)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("evidence tree contains symlink %q", entryPath)
		}
		if info.IsDir() {
			if _, ok := expectedDirectories[entryPath]; !ok {
				return fmt.Errorf("evidence tree contains unexplained directory %q", entryPath)
			}
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("evidence tree contains non-regular resource %q", entryPath)
		}
		if _, ok := expectedFiles[entryPath]; !ok {
			return fmt.Errorf("evidence tree contains unexplained file %q", entryPath)
		}
		seenFiles[entryPath] = struct{}{}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(seenFiles) != len(expectedFiles) {
		t.Fatalf("evidence tree contains %d expected files, want %d", len(seenFiles), len(expectedFiles))
	}
}

func readEvidenceResource(t *testing.T, evidenceRoot string, resource immutableResourceRef) []byte {
	t.Helper()
	if resource.URI == "" || resource.Digest == "" {
		t.Fatalf("incomplete immutable evidence resource: %+v", resource)
	}
	evidencePath := evidenceFilePath(t, resource.URI)
	originalInfo, err := os.Lstat(evidencePath)
	if err != nil || !originalInfo.Mode().IsRegular() {
		t.Fatalf("evidence %q is not a direct regular file", resource.URI)
	}
	rootResolved, err := filepath.EvalSymlinks(evidenceRoot)
	if err != nil {
		t.Fatalf("resolve evidence root: %v", err)
	}
	pathResolved, err := filepath.EvalSymlinks(evidencePath)
	if err != nil {
		t.Fatalf("resolve evidence reference %q: %v", resource.URI, err)
	}
	relative, err := filepath.Rel(rootResolved, pathResolved)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		t.Fatalf("evidence %q is not a file below evidenceRoot", resource.URI)
	}
	info, err := os.Lstat(pathResolved)
	if err != nil || !info.Mode().IsRegular() {
		t.Fatalf("evidence %q is not a regular file", resource.URI)
	}
	content, err := os.ReadFile(pathResolved)
	if err != nil {
		t.Fatalf("read evidence %q: %v", resource.URI, err)
	}
	wantDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(content))
	if resource.Digest != wantDigest {
		t.Fatalf("evidence digest mismatch: got %q want %q", resource.Digest, wantDigest)
	}
	return content
}

func evidenceFilePath(t *testing.T, reference string) string {
	t.Helper()
	parsed, err := url.Parse(reference)
	if err != nil {
		t.Fatalf("parse evidence URI %q: %v", reference, err)
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		t.Fatalf("evidence URI %q must not contain query or fragment", reference)
	}
	switch parsed.Scheme {
	case "":
		if !filepath.IsAbs(reference) {
			t.Fatalf("evidence path %q is not absolute", reference)
		}
		return filepath.Clean(reference)
	case "file":
		if parsed.Host != "" && parsed.Host != "localhost" {
			t.Fatalf("evidence file URI %q has non-local host", reference)
		}
		pathValue, err := url.PathUnescape(parsed.EscapedPath())
		if err != nil {
			t.Fatalf("decode evidence file URI %q: %v", reference, err)
		}
		if runtime.GOOS == "windows" && len(pathValue) >= 3 && pathValue[0] == '/' && pathValue[2] == ':' {
			pathValue = pathValue[1:]
		}
		return filepath.FromSlash(pathValue)
	default:
		t.Fatalf("evidence URI %q is not a local file", reference)
		return ""
	}
}

func assertWorkspace(t *testing.T, workspaceRoot, fixtureID string) {
	t.Helper()
	files := workspaceFiles(t, workspaceRoot)
	if fixtureID == "t0-init-unmanaged-write-blocked" {
		if len(files) != 0 {
			t.Fatalf("blocked scenario changed workspace: %v", files)
		}
		return
	}
	projectByFixture := map[string]string{
		"t0-init-repo-docs-happy":                "consumer-init-happy",
		"t0-init-idempotent-retry":               "consumer-retry",
		"t0-new-repo-docs-happy":                 "consumer-new-happy",
		"t0-new-change-id-collision":             "consumer-collision",
		"t0-continue-content-proposal-happy":     "consumer-continue-happy",
		"t0-continue-request-changes":            "consumer-request-changes",
		"t0-continue-idempotent-retry":           "consumer-continue-retry",
		"t0-continue-out-of-scope-write-blocked": "consumer-out-of-scope",
		"t0-continue-handoff-complete":           "consumer-handoff-complete",
	}
	projectID, ok := projectByFixture[fixtureID]
	if !ok {
		t.Fatalf("no workspace oracle for fixture %q", fixtureID)
	}
	prefix := filepath.Join(fixtureID, "target", "docs", "virgil", "projects", projectID)
	want := []string{
		filepath.Join(prefix, "events.jsonl"),
		filepath.Join(prefix, "project.json"),
	}
	changeByFixture := map[string]string{
		"t0-new-repo-docs-happy":                 "change-alpha",
		"t0-new-change-id-collision":             "change-beta",
		"t0-continue-content-proposal-happy":     "change-continue-alpha",
		"t0-continue-request-changes":            "change-request-changes",
		"t0-continue-idempotent-retry":           "change-retry-alpha",
		"t0-continue-out-of-scope-write-blocked": "change-blocked-alpha",
		"t0-continue-handoff-complete":           "change-handoff-alpha",
	}
	if changeID, hasChange := changeByFixture[fixtureID]; hasChange {
		changePrefix := filepath.Join(prefix, "changes", changeID)
		want = append(want,
			filepath.Join(changePrefix, "change.json"),
			filepath.Join(changePrefix, "events.jsonl"),
		)
	}
	if fixtureID == "t0-continue-content-proposal-happy" {
		revisionPrefix := filepath.Join(prefix, "changes", "change-continue-alpha", "artifacts", "idea", "rev-000001")
		want = append(want,
			filepath.Join(revisionPrefix, "envelope.json"),
			filepath.Join(revisionPrefix, "content.md"),
			filepath.Join(fixtureID, "target", "seed", "idea-proposal.md"),
		)
	}
	if fixtureID == "t0-continue-request-changes" {
		revisionPrefix := filepath.Join(prefix, "changes", "change-request-changes", "artifacts", "idea", "rev-000001")
		want = append(want,
			filepath.Join(revisionPrefix, "envelope.json"),
			filepath.Join(revisionPrefix, "content.md"),
			filepath.Join(fixtureID, "target", "seed", "idea-proposal.md"),
		)
	}
	if fixtureID == "t0-continue-idempotent-retry" {
		revisionPrefix := filepath.Join(prefix, "changes", "change-retry-alpha", "artifacts", "idea", "rev-000001")
		want = append(want,
			filepath.Join(revisionPrefix, "envelope.json"),
			filepath.Join(revisionPrefix, "content.md"),
			filepath.Join(fixtureID, "target", "seed", "idea-proposal.md"),
		)
	}
	if fixtureID == "t0-continue-handoff-complete" {
		for _, kind := range []string{"idea", "spec", "design", "tasks", "handoff"} {
			revisionPrefix := filepath.Join(prefix, "changes", "change-handoff-alpha", "artifacts", kind, "rev-000001")
			want = append(want,
				filepath.Join(revisionPrefix, "envelope.json"),
				filepath.Join(revisionPrefix, "content.md"),
				filepath.Join(fixtureID, "target", "seed", kind+"-proposal.md"),
			)
		}
	}
	sort.Strings(want)
	if !equalStrings(files, want) {
		t.Fatalf("scenario %q workspace files: got %v want %v", fixtureID, files, want)
	}
	if fixtureID == "t0-init-idempotent-retry" {
		assertOneEvent(t, filepath.Join(workspaceRoot, prefix, "events.jsonl"))
	}
}

func workspaceFiles(t *testing.T, root string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		files = append(files, relative)
		return nil
	})
	if err != nil {
		t.Fatalf("observe workspace: %v", err)
	}
	return files
}

func equalStrings(actual, expected []string) bool {
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index] != expected[index] {
			return false
		}
	}
	return true
}

func assertOneEvent(t *testing.T, eventsPath string) {
	t.Helper()
	file, err := os.Open(eventsPath)
	if err != nil {
		t.Fatalf("open retry event log: %v", err)
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	count := 0
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		if !json.Valid(line) {
			t.Fatalf("retry event %d is not valid JSON", count+1)
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan retry event log: %v", err)
	}
	if count != 1 {
		t.Fatalf("retry event log contains %d events, want 1", count)
	}
}

func appEnvironment() []string {
	environment := []string{"LANG=C", "LC_ALL=C", "TZ=UTC"}
	if runtime.GOOS == "windows" {
		if systemRoot := os.Getenv("SYSTEMROOT"); systemRoot != "" {
			environment = append(environment, "SYSTEMROOT="+systemRoot)
		}
	}
	return environment
}
