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
	"strings"
	"testing"
	"time"
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
	URI    string `json:"uri"`
	Digest string `json:"digest"`
}

type evidenceManifest struct {
	SchemaVersion string `json:"schema_version"`
	Layer         string `json:"layer"`
	Fixture       struct {
		FixtureID string `json:"fixture_id"`
		Digest    string `json:"digest"`
	} `json:"fixture"`
	Trace    immutableResourceRef `json:"trace"`
	Contents []struct {
		Role     string               `json:"role"`
		Resource immutableResourceRef `json:"resource"`
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
		Digest string `json:"digest"`
	} `json:"integrity"`
}

type appRun struct {
	Result        runResult
	WorkspaceRoot string
	EvidenceRoot  string
}

func runT0(t *testing.T, fixtureID string) appRun {
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
	assertEvidence(t, execution.EvidenceRoot, fixtureID, scenario.Evidence)
	assertWorkspace(t, execution.WorkspaceRoot, fixtureID)
}

func assertProcesses(t *testing.T, fixtureID string, processes []processObservation) {
	t.Helper()
	wantCount := 1
	if fixtureID == "t0-init-idempotent-retry" {
		wantCount = 2
	}
	if len(processes) != wantCount {
		t.Fatalf("scenario %q: expected %d fresh processes, got %+v", fixtureID, wantCount, processes)
	}
	processIDs := make(map[string]struct{}, len(processes))
	pids := make(map[int]struct{}, len(processes))
	for _, process := range processes {
		if process.ProcessID == "" || process.OSPID <= 0 || process.ExitCode != 0 {
			t.Fatalf("scenario %q: invalid process observation %+v", fixtureID, process)
		}
		if _, duplicate := processIDs[process.ProcessID]; duplicate {
			t.Fatalf("scenario %q: duplicate process_id %q", fixtureID, process.ProcessID)
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

func assertEvidence(t *testing.T, evidenceRoot, fixtureID string, evidence *evidenceReference) {
	t.Helper()
	if evidence == nil {
		t.Fatal("passed scenario has no EvidenceReference")
	}
	content := readEvidenceResource(t, evidenceRoot, immutableResourceRef(*evidence))
	var manifest evidenceManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		t.Fatalf("decode EvidenceBundle manifest: %v", err)
	}
	if manifest.SchemaVersion != "virgil.dev/evidence-bundle/v1alpha1" || manifest.Layer != "T0" {
		t.Fatalf("unexpected EvidenceBundle identity %q/%q", manifest.SchemaVersion, manifest.Layer)
	}
	if manifest.Fixture.FixtureID != fixtureID || manifest.Fixture.Digest == "" {
		t.Fatalf("EvidenceBundle fixture mismatch: %+v", manifest.Fixture)
	}
	if manifest.Outcome.Status != "passed" || !manifest.PublishedAtomically || manifest.Integrity.Digest == "" {
		t.Fatalf("EvidenceBundle cannot certify passed: outcome=%q atomic=%v integrity=%q", manifest.Outcome.Status, manifest.PublishedAtomically, manifest.Integrity.Digest)
	}
	if len(manifest.Checks) == 0 {
		t.Fatal("EvidenceBundle has no checks")
	}
	for _, check := range manifest.Checks {
		if check.CheckID == "" || check.Status != "passed" {
			t.Fatalf("EvidenceBundle contains non-passing check: %+v", check)
		}
	}
	readEvidenceResource(t, evidenceRoot, manifest.Trace)
	readEvidenceResource(t, evidenceRoot, manifest.Diffs.Target)
	readEvidenceResource(t, evidenceRoot, manifest.Diffs.Store)
	if len(manifest.Contents) == 0 {
		t.Fatal("EvidenceBundle has no content resources")
	}
	for _, item := range manifest.Contents {
		if item.Role == "" {
			t.Fatal("EvidenceBundle content has no role")
		}
		readEvidenceResource(t, evidenceRoot, item.Resource)
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
		"t0-init-repo-docs-happy":  "consumer-init-happy",
		"t0-init-idempotent-retry": "consumer-retry",
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
