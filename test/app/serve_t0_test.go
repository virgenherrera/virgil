package app_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

// This file contains T0 app-level black-box tests for the `virgil serve`
// MCP server. Every test builds the public binary via buildPublicBinary(t),
// runs it as a subprocess with `serve`, and drives it exclusively through
// JSON-RPC 2.0 messages piped over stdin/stdout -- exactly what a real MCP
// client does. No test in this file imports anything from internal/.

// rpcRequest is the wire shape this test file sends on stdin. ID uses `any`
// so that omitempty naturally produces a notification (no "id" key at all)
// when ID is left as the nil interface value.
type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// rpcResponse is the wire shape this test file expects back on stdout.
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// appToolsListResult mirrors mcp.toolsListResult for decoding tools/list.
type appToolsListResult struct {
	Tools []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		InputSchema json.RawMessage `json:"inputSchema"`
	} `json:"tools"`
}

// appToolCallResult mirrors mcp.toolCallResult for decoding tools/call.
type appToolCallResult struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	IsError bool `json:"isError"`
}

// appInitializeResult mirrors mcp.initializeResult for decoding initialize.
type appInitializeResult struct {
	ProtocolVersion string `json:"protocolVersion"`
	ServerInfo      struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"serverInfo"`
}

// appSimpleResult mirrors mcp.SimpleResult -- the JSON payload carried as
// text inside a successful or business-level-failed tools/call result.
type appSimpleResult struct {
	Status      string   `json:"status"`
	Operation   string   `json:"operation"`
	DerivedStep string   `json:"derived_step,omitempty"`
	Message     string   `json:"message"`
	Artifacts   []string `json:"artifacts,omitempty"`
	NextStep    string   `json:"next_step,omitempty"`
	Error       string   `json:"error,omitempty"`
}

// appProjectState mirrors mcp.ProjectState for decoding virgil_status.
type appProjectState struct {
	Initialized      bool   `json:"Initialized"`
	ProjectID        string `json:"ProjectID"`
	TargetRoot       string `json:"TargetRoot"`
	RequirementCount int    `json:"RequirementCount"`
	DesignCount      int    `json:"DesignCount"`
	TaskCounts       struct {
		Backlog  int `json:"Backlog"`
		Refined  int `json:"Refined"`
		Active   int `json:"Active"`
		Done     int `json:"Done"`
		Released int `json:"Released"`
	} `json:"TaskCounts"`
}

// serveSession is a live `virgil serve` subprocess wired up for JSON-RPC
// line-based communication over stdin/stdout.
type serveSession struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	scanner  *bufio.Scanner
	stderr   *bytes.Buffer
	cancel   context.CancelFunc
	waitOnce sync.Once
	waitErr  error
}

// wait calls cmd.Wait() exactly once and caches the result, so both a test
// that needs the exit outcome directly (e.g. after deliberately breaking
// the protocol) and the automatic t.Cleanup teardown can safely call it --
// exec.Cmd.Wait() panics/errors if invoked more than once.
func (s *serveSession) wait() error {
	s.waitOnce.Do(func() {
		s.waitErr = s.cmd.Wait()
	})
	return s.waitErr
}

// startServeSession launches `virgil serve` with dir doubling as both the
// project root (cwd) and HOME. This is sufficient for every scenario that
// only needs virgil.init's $schema pointer to resolve to *some* isolated
// path; scenarios that need a HOME independent of the project root (e.g. one
// shared with a prior `virgil install` run) should call
// startServeSessionWithHome directly instead. The subprocess is torn down
// automatically via t.Cleanup.
func startServeSession(t *testing.T, dir string) *serveSession {
	t.Helper()
	return startServeSessionWithHome(t, dir, dir)
}

// startServeSessionWithHome builds the public binary and launches `virgil
// serve` as a subprocess rooted at dir (cwd), with HOME set independently to
// homeDir and an otherwise clean environment.
//
// When the outer `go test` process runs with GOCOVERDIR set, the binary is
// instead built with Go's binary coverage instrumentation
// (`go build -cover -coverpkg=.../internal/mcp/...`) and the same
// GOCOVERDIR is forwarded into the subprocess environment. This is the
// standard mechanism for measuring coverage of code that only executes
// inside a spawned subprocess (see https://go.dev/blog/integration-test-coverage):
// a plain `go test -coverpkg=./internal/mcp/...` cannot see this package at
// all, since this T0 black-box test file never imports it directly.
func startServeSessionWithHome(t *testing.T, dir, homeDir string) *serveSession {
	t.Helper()
	binary := buildServeBinary(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	cmd := exec.CommandContext(ctx, binary, "serve")
	cmd.Dir = dir
	env := appEnvironment(homeDir)
	if coverDir := os.Getenv("GOCOVERDIR"); coverDir != "" {
		env = append(env, "GOCOVERDIR="+coverDir)
	}
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		t.Fatalf("open stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		t.Fatalf("open stdout pipe: %v", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatalf("start serve subprocess: %v", err)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)

	session := &serveSession{
		cmd:     cmd,
		stdin:   stdin,
		scanner: scanner,
		stderr:  &stderr,
		cancel:  cancel,
	}

	t.Cleanup(func() {
		_ = session.stdin.Close()
		_ = session.wait()
		cancel()
	})

	return session
}

// buildServeBinary returns a plain, uninstrumented public binary via the
// shared buildPublicBinary helper, unless GOCOVERDIR is set in the test
// process's own environment, in which case it returns a coverage-
// instrumented binary scoped to internal/mcp.
func buildServeBinary(t *testing.T) string {
	t.Helper()
	if os.Getenv("GOCOVERDIR") != "" {
		return buildCoveredPublicBinary(t)
	}
	return buildPublicBinary(t)
}

// buildCoveredPublicBinary compiles ./cmd/virgil with Go's native binary
// coverage instrumentation (`go build -cover`) across the whole build,
// which includes internal/mcp. Restricting instrumentation with -coverpkg
// to only internal/mcp was tried and silently produced an empty
// GOCOVERDIR (no covcounters/covmeta files at all) on this toolchain, so
// this instruments every package instead; the resulting profile is
// filtered down to internal/mcp when read back (see the coverage quality
// gate). The resulting binary writes coverage counter data to $GOCOVERDIR
// on exit; see buildServeBinary and startServeSession for how that
// directory is propagated into the subprocess.
func buildCoveredPublicBinary(t *testing.T) string {
	t.Helper()
	repositoryRoot := filepath.Clean(filepath.Join(sourceDirectory(t), "..", ".."))
	binaryName := "virgil-cover"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binary := filepath.Join(t.TempDir(), binaryName)
	command := exec.Command("go", "build", "-cover", "-o", binary, "./cmd/virgil")
	command.Dir = repositoryRoot
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("compile coverage-instrumented public binary: %v; output=%q", err, string(output))
	}
	return binary
}

// send marshals v to a single JSON line and writes it to the subprocess
// stdin, newline-terminated as the server's bufio.Scanner-based read loop
// requires.
func (s *serveSession) send(t *testing.T, v any) {
	t.Helper()
	payload, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	payload = append(payload, '\n')
	if _, err := s.stdin.Write(payload); err != nil {
		t.Fatalf("write request: %v; stderr=%q", err, s.stderr.String())
	}
}

// sendLine writes a raw, newline-terminated line to the subprocess stdin
// verbatim -- used for malformed JSON and other non-marshalable payloads.
func (s *serveSession) sendLine(t *testing.T, line string) {
	t.Helper()
	if _, err := io.WriteString(s.stdin, line+"\n"); err != nil {
		t.Fatalf("write raw line: %v; stderr=%q", err, s.stderr.String())
	}
}

// readResponse reads and decodes the next JSON-RPC response line from
// stdout.
func (s *serveSession) readResponse(t *testing.T) rpcResponse {
	t.Helper()
	if !s.scanner.Scan() {
		t.Fatalf("read response: %v; stderr=%q", s.scanner.Err(), s.stderr.String())
	}
	line := s.scanner.Bytes()
	var resp rpcResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		t.Fatalf("decode response %q: %v; stderr=%q", string(line), err, s.stderr.String())
	}
	return resp
}

// call sends a JSON-RPC request with the given id and returns the matching
// response, failing the test if the response id does not echo the request.
func (s *serveSession) call(t *testing.T, id int, method string, params any) rpcResponse {
	t.Helper()
	s.send(t, rpcRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	resp := s.readResponse(t)
	wantID := fmt.Sprintf("%d", id)
	if string(resp.ID) != wantID {
		t.Fatalf("response id = %s, want %s; stderr=%q", resp.ID, wantID, s.stderr.String())
	}
	return resp
}

// notify sends a JSON-RPC notification (no id field) and does not attempt
// to read a response, since notifications receive none.
func (s *serveSession) notify(t *testing.T, method string, params any) {
	t.Helper()
	s.send(t, rpcRequest{JSONRPC: "2.0", Method: method, Params: params})
}

// initialize performs the standard MCP handshake request (id 1) and returns
// the decoded response, failing the test on any error.
func (s *serveSession) initialize(t *testing.T) rpcResponse {
	t.Helper()
	resp := s.call(t, 1, "initialize", map[string]any{"protocolVersion": "2024-11-05"})
	if resp.Error != nil {
		t.Fatalf("initialize returned error: %+v", resp.Error)
	}
	var result appInitializeResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("decode initialize result: %v", err)
	}
	if result.ProtocolVersion != "2024-11-05" || result.ServerInfo.Name != "virgil" {
		t.Fatalf("unexpected initialize result: %+v", result)
	}
	return resp
}

// initProject issues a virgil_init tools/call with the given request id and
// fails the test unless it succeeds. It is used as setup for scenarios that
// need an already-initialized project.
func (s *serveSession) initProject(t *testing.T, id int, projectID string) {
	t.Helper()
	resp := s.call(t, id, "tools/call", map[string]any{
		"name": "virgil_init",
		"arguments": map[string]any{
			"project_id": projectID,
		},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_init setup call failed: %s", result.Content[0].Text)
	}
}

func decodeToolCallResult(t *testing.T, resp rpcResponse) appToolCallResult {
	t.Helper()
	if resp.Error != nil {
		t.Fatalf("tools/call returned top-level JSON-RPC error: %+v", resp.Error)
	}
	var result appToolCallResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("decode tools/call result: %v", err)
	}
	if len(result.Content) == 0 {
		t.Fatal("tools/call result has no content")
	}
	return result
}

// TestApp_T0ServeHandshakeHappy drives a full MCP handshake: initialize,
// notifications/initialized, tools/list, and a tools/call against
// virgil_status. It covers Run, dispatch, handleInitialize,
// handleToolsList, handleToolsCall, callStatus, refreshState,
// jsonTextResult, and writeResponse.
func TestApp_T0ServeHandshakeHappy(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.notify(t, "notifications/initialized", nil)

	listResp := session.call(t, 2, "tools/list", nil)
	if listResp.Error != nil {
		t.Fatalf("tools/list returned error: %+v", listResp.Error)
	}
	var list appToolsListResult
	if err := json.Unmarshal(listResp.Result, &list); err != nil {
		t.Fatalf("decode tools/list result: %v", err)
	}
	if len(list.Tools) != 4 {
		t.Fatalf("tools/list returned %d tools, want 4: %+v", len(list.Tools), list.Tools)
	}
	wantNames := map[string]bool{
		"virgil_init":       false,
		"virgil_write":      false,
		"virgil_transition": false,
		"virgil_status":     false,
	}
	for _, tool := range list.Tools {
		if _, ok := wantNames[tool.Name]; !ok {
			t.Fatalf("tools/list returned unexpected tool %q", tool.Name)
		}
		wantNames[tool.Name] = true
	}
	for name, seen := range wantNames {
		if !seen {
			t.Fatalf("tools/list did not include %q", name)
		}
	}

	statusResp := session.call(t, 3, "tools/call", map[string]any{
		"name":      "virgil_status",
		"arguments": map[string]any{},
	})
	result := decodeToolCallResult(t, statusResp)
	if result.IsError {
		t.Fatalf("virgil_status returned isError=true: %+v", result)
	}
	var state map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &state); err != nil {
		t.Fatalf("decode virgil_status content: %v", err)
	}
}

// TestApp_T0ServeNotificationNullID sends notifications/initialized with an
// explicit "id":null, which json.Unmarshal decodes as the literal []byte
// ("null"), and asserts the server correctly recognizes it as a
// notification instead of aborting or misrouting a subsequent request.
// This is the regression test for the IsNotification() bug fix.
func TestApp_T0ServeNotificationNullID(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.sendLine(t, `{"jsonrpc":"2.0","id":null,"method":"notifications/initialized"}`)

	listResp := session.call(t, 2, "tools/list", nil)
	if listResp.Error != nil {
		t.Fatalf("tools/list after null-id notification returned error: %+v; stderr=%q", listResp.Error, session.stderr.String())
	}
	var list appToolsListResult
	if err := json.Unmarshal(listResp.Result, &list); err != nil {
		t.Fatalf("decode tools/list result: %v", err)
	}
	if len(list.Tools) != 4 {
		t.Fatalf("tools/list returned %d tools, want 4", len(list.Tools))
	}
}

// TestApp_T0ServeNotificationNoID sends notifications/initialized with no
// "id" field at all (the ordinary notification shape) and asserts a
// subsequent request still succeeds. This guards the original
// IsNotification() path against regression.
func TestApp_T0ServeNotificationNoID(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.notify(t, "notifications/initialized", nil)

	listResp := session.call(t, 2, "tools/list", nil)
	if listResp.Error != nil {
		t.Fatalf("tools/list after no-id notification returned error: %+v", listResp.Error)
	}
	var list appToolsListResult
	if err := json.Unmarshal(listResp.Result, &list); err != nil {
		t.Fatalf("decode tools/list result: %v", err)
	}
	if len(list.Tools) != 4 {
		t.Fatalf("tools/list returned %d tools, want 4", len(list.Tools))
	}
}

// TestApp_T0ServeUnknownMethod sends a request for a method the server does
// not implement and asserts the dispatch() default case returns a
// -32601 Method not found error.
func TestApp_T0ServeUnknownMethod(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 10, "unknown/method", nil)
	if resp.Error == nil {
		t.Fatal("expected error response for unknown method, got none")
	}
	if resp.Error.Code != -32601 {
		t.Fatalf("unknown method error code = %d, want -32601: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeUnknownTool sends tools/call with a tool name the server
// does not recognize and asserts handleToolsCall()'s default case returns
// a -32602 Invalid params error.
func TestApp_T0ServeUnknownTool(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 4, "tools/call", map[string]any{
		"name":      "nonexistent_tool",
		"arguments": map[string]any{},
	})
	if resp.Error == nil {
		t.Fatal("expected error response for unknown tool, got none")
	}
	if resp.Error.Code != -32602 {
		t.Fatalf("unknown tool error code = %d, want -32602: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeParseError sends a line that is not valid JSON at all and
// asserts Run()'s json.Unmarshal error branch responds with -32700 Parse
// error and keeps the server alive.
func TestApp_T0ServeParseError(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.sendLine(t, `{this is not valid json`)

	resp := session.readResponse(t)
	if resp.Error == nil {
		t.Fatal("expected error response for malformed JSON, got none")
	}
	if resp.Error.Code != -32700 {
		t.Fatalf("parse error code = %d, want -32700: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeInvalidToolParams sends tools/call for virgil_init with an
// "arguments" value that is valid JSON but cannot unmarshal into the tool's
// expected object shape (a JSON string instead of an object), asserting
// handleToolsCall()'s tool-specific params unmarshal error path returns
// -32602 Invalid params.
func TestApp_T0ServeInvalidToolParams(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 5, "tools/call", map[string]any{
		"name":      "virgil_init",
		"arguments": "not-an-object",
	})
	if resp.Error == nil {
		t.Fatal("expected error response for invalid tool params, got none")
	}
	if resp.Error.Code != -32602 {
		t.Fatalf("invalid tool params error code = %d, want -32602: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeToolCallInit runs virgil_init against an isolated,
// uninitialized temp directory (set as the subprocess cwd, which serve.go
// resolves via os.Getwd() into targetRoot) and asserts the tool succeeds
// and virgil.json is created at that root. This exercises callInit,
// invokeAndRespond, SimplifyResult, and the full Builder/runtime flow.
func TestApp_T0ServeToolCallInit(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 6, "tools/call", map[string]any{
		"name": "virgil_init",
		"arguments": map[string]any{
			"project_id": "test-project",
		},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_init returned isError=true: %s", result.Content[0].Text)
	}

	configPath := filepath.Join(dir, "virgil.json")
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("virgil.json was not created at %s: %v", configPath, err)
	}
}

// TestApp_T0ServeToolCallWriteUninitialized calls virgil_write with
// otherwise-valid params against an uninitialized project directory and
// asserts the response carries isError:true rather than a top-level
// JSON-RPC error. This exercises callWrite's uninitialized-project guard
// and toolError.
func TestApp_T0ServeToolCallWriteUninitialized(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 7, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "idea",
			"content":  "# Some Idea\n\nDescribes an idea.",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for virgil_write on uninitialized project, got: %+v", result)
	}
	if !strings.Contains(result.Content[0].Text, "not initialized") {
		t.Fatalf("expected 'not initialized' in error content, got: %s", result.Content[0].Text)
	}
}

// TestApp_T0ServeToolCallTransitionUninitialized calls virgil_transition
// against an uninitialized project directory and asserts the response
// carries isError:true. This exercises callTransition's uninitialized-
// project guard.
func TestApp_T0ServeToolCallTransitionUninitialized(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 8, "tools/call", map[string]any{
		"name": "virgil_transition",
		"arguments": map[string]any{
			"task_slug":  "some-task",
			"new_status": "refined",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for virgil_transition on uninitialized project, got: %+v", result)
	}
	if !strings.Contains(result.Content[0].Text, "not initialized") {
		t.Fatalf("expected 'not initialized' in error content, got: %s", result.Content[0].Text)
	}
}

// TestApp_T0ServeEmptyLine sends a blank line between two well-formed
// requests and asserts the subsequent request still succeeds, exercising
// Run()'s empty-line guard.
func TestApp_T0ServeEmptyLine(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.sendLine(t, "")

	listResp := session.call(t, 2, "tools/list", nil)
	if listResp.Error != nil {
		t.Fatalf("tools/list after empty line returned error: %+v", listResp.Error)
	}
	var list appToolsListResult
	if err := json.Unmarshal(listResp.Result, &list); err != nil {
		t.Fatalf("decode tools/list result: %v", err)
	}
	if len(list.Tools) != 4 {
		t.Fatalf("tools/list returned %d tools, want 4", len(list.Tools))
	}
}

// The scenarios below extend beyond the original 11 to push coverage of
// internal/mcp to the required threshold: they exercise the successful and
// business-level-failure (blocked/error) branches of callWrite,
// callTransition, SimplifyResult, formatSuccessMessage,
// extractDiagnosticConditions, refreshState, LoadState, countDocFiles, and
// countTasksByStatus that the original 11 scenarios do not reach.

// TestApp_T0ServeToolCallWriteSuccess writes an idea document against an
// initialized project and asserts a success result with at least one
// artifact. This exercises callWrite's success path, formatSuccessMessage's
// "virgil.write" case, and SimplifyResult's effects/artifacts collection.
func TestApp_T0ServeToolCallWriteSuccess(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "write-success")

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "idea",
			"content":  "# Idea\n\nAn idea document.",
		},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_write idea returned isError=true: %s", result.Content[0].Text)
	}
	var simple appSimpleResult
	if err := json.Unmarshal([]byte(result.Content[0].Text), &simple); err != nil {
		t.Fatalf("decode virgil_write result: %v", err)
	}
	if simple.Status != "success" || simple.Operation != "virgil.write" {
		t.Fatalf("unexpected virgil_write result: %+v", simple)
	}
	if len(simple.Artifacts) == 0 {
		t.Fatalf("expected at least one artifact from a successful write: %+v", simple)
	}
}

// TestApp_T0ServeStatusReflectsWrites writes a requirement, a design
// document, and five task documents (one at each lifecycle status) against
// an initialized project, then asserts virgil_status reports the resulting
// counts. This exercises LoadState, countDocFiles' entries-found branch,
// and every case of countTasksByStatus' status switch, including a
// successful extractDocFrontmatter parse.
func TestApp_T0ServeStatusReflectsWrites(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "status-reflects-writes")

	nextID := 3
	writeDoc := func(args map[string]any) {
		t.Helper()
		resp := session.call(t, nextID, "tools/call", map[string]any{
			"name":      "virgil_write",
			"arguments": args,
		})
		nextID++
		result := decodeToolCallResult(t, resp)
		if result.IsError {
			t.Fatalf("virgil_write setup call failed: %s", result.Content[0].Text)
		}
	}

	writeDoc(map[string]any{
		"doc_kind": "requirement",
		"slug":     "req-a",
		"category": "functional",
		"content":  "# Requirement A",
	})
	writeDoc(map[string]any{
		"doc_kind": "design",
		"slug":     "design-a",
		"category": "arch",
		"content":  "# Design A",
	})
	for slug, status := range map[string]string{
		"task-backlog":  "backlog",
		"task-refined":  "refined",
		"task-active":   "active",
		"task-done":     "done",
		"task-released": "released",
	} {
		writeDoc(map[string]any{
			"doc_kind": "task",
			"slug":     slug,
			"content":  "# " + slug,
			"status":   status,
		})
	}

	statusResp := session.call(t, nextID, "tools/call", map[string]any{
		"name":      "virgil_status",
		"arguments": map[string]any{},
	})
	result := decodeToolCallResult(t, statusResp)
	if result.IsError {
		t.Fatalf("virgil_status returned isError=true: %s", result.Content[0].Text)
	}
	var state appProjectState
	if err := json.Unmarshal([]byte(result.Content[0].Text), &state); err != nil {
		t.Fatalf("decode virgil_status content: %v", err)
	}
	if !state.Initialized {
		t.Fatal("expected project to be initialized")
	}
	if state.RequirementCount != 1 {
		t.Fatalf("RequirementCount = %d, want 1: %+v", state.RequirementCount, state)
	}
	if state.DesignCount != 1 {
		t.Fatalf("DesignCount = %d, want 1: %+v", state.DesignCount, state)
	}
	wantCounts := [5]int{1, 1, 1, 1, 1}
	gotCounts := [5]int{state.TaskCounts.Backlog, state.TaskCounts.Refined, state.TaskCounts.Active, state.TaskCounts.Done, state.TaskCounts.Released}
	if gotCounts != wantCounts {
		t.Fatalf("task counts = %+v, want one task at each of the 5 statuses: %+v", gotCounts, state.TaskCounts)
	}
}

// TestApp_T0ServeToolCallTransitionSuccess writes a backlog task and
// transitions it to refined, asserting a success result and that
// virgil_status reflects the new status. This exercises callTransition's
// success path and formatSuccessMessage's "virgil.transition" case.
func TestApp_T0ServeToolCallTransitionSuccess(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "transition-success")

	writeResp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "task",
			"slug":     "task-a",
			"content":  "# Task A",
			"status":   "backlog",
		},
	})
	writeResult := decodeToolCallResult(t, writeResp)
	if writeResult.IsError {
		t.Fatalf("virgil_write task setup failed: %s", writeResult.Content[0].Text)
	}

	transitionResp := session.call(t, 4, "tools/call", map[string]any{
		"name": "virgil_transition",
		"arguments": map[string]any{
			"task_slug":  "task-a",
			"new_status": "refined",
		},
	})
	result := decodeToolCallResult(t, transitionResp)
	if result.IsError {
		t.Fatalf("virgil_transition returned isError=true: %s", result.Content[0].Text)
	}
	var simple appSimpleResult
	if err := json.Unmarshal([]byte(result.Content[0].Text), &simple); err != nil {
		t.Fatalf("decode virgil_transition result: %v", err)
	}
	if simple.Status != "success" || simple.Operation != "virgil.transition" {
		t.Fatalf("unexpected virgil_transition result: %+v", simple)
	}

	statusResp := session.call(t, 5, "tools/call", map[string]any{
		"name":      "virgil_status",
		"arguments": map[string]any{},
	})
	statusResult := decodeToolCallResult(t, statusResp)
	var state appProjectState
	if err := json.Unmarshal([]byte(statusResult.Content[0].Text), &state); err != nil {
		t.Fatalf("decode virgil_status content: %v", err)
	}
	if state.TaskCounts.Refined != 1 {
		t.Fatalf("expected 1 refined task after transition, got %+v", state.TaskCounts)
	}
}

// TestApp_T0ServeToolCallWriteRejectedInvalidDocKind writes with a
// doc_kind outside the schema's enum. The Virgil wire contract validates
// the operation request's JSON Schema before it ever reaches the repo-docs
// adapter, so runtime.Invoke returns a genuine Go error rather than a
// business-status wire.InvokeResult. This exercises invokeAndRespond's
// `if err != nil` branch -- the runtime-level failure path into toolError
// -- which is otherwise unreached by any Builder-level guard or repo-docs
// business diagnostic.
func TestApp_T0ServeToolCallWriteRejectedInvalidDocKind(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "write-rejected")

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "not-a-real-doc-kind",
			"content":  "# Content",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for invalid doc_kind, got: %+v", result)
	}
	var simple appSimpleResult
	if err := json.Unmarshal([]byte(result.Content[0].Text), &simple); err != nil {
		t.Fatalf("decode virgil_write result: %v", err)
	}
	if simple.Status != "error" {
		t.Fatalf("expected error status for schema-rejected doc_kind, got: %+v", simple)
	}
	if simple.Error == "" {
		t.Fatalf("expected a non-empty error for schema-rejected doc_kind: %+v", simple)
	}
}

// TestApp_T0ServeToolCallTransitionBlockedUnknownTask transitions a task
// slug that does not exist, asserting a business-level "blocked" result.
// This exercises callTransition's runtime dispatch when the Builder-level
// guards pass but the repo-docs adapter itself rejects the request.
func TestApp_T0ServeToolCallTransitionBlockedUnknownTask(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "transition-blocked")

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_transition",
		"arguments": map[string]any{
			"task_slug":  "does-not-exist",
			"new_status": "refined",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for unknown task_slug, got: %+v", result)
	}
	var simple appSimpleResult
	if err := json.Unmarshal([]byte(result.Content[0].Text), &simple); err != nil {
		t.Fatalf("decode virgil_transition result: %v", err)
	}
	if simple.Status != "blocked" {
		t.Fatalf("expected blocked status for unknown task_slug, got: %+v", simple)
	}
}

// TestApp_T0ServeToolCallWriteErrorCorruptLedger initializes a project,
// then corrupts virgil.json directly on disk (simulating an external actor
// damaging the durable ledger between MCP calls) and issues a subsequent
// virgil_write. This exercises SimplifyResult's "error" case and
// refreshState's LoadState-failure branch, both otherwise unreachable
// through well-formed JSON-RPC traffic alone.
func TestApp_T0ServeToolCallWriteErrorCorruptLedger(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "corrupt-ledger")

	configPath := filepath.Join(dir, "virgil.json")
	if err := os.WriteFile(configPath, []byte("{not valid json"), 0o600); err != nil {
		t.Fatalf("corrupt virgil.json: %v", err)
	}

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "idea",
			"content":  "# Idea",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true after corrupting virgil.json, got: %+v", result)
	}
	var simple appSimpleResult
	if err := json.Unmarshal([]byte(result.Content[0].Text), &simple); err != nil {
		t.Fatalf("decode virgil_write result: %v", err)
	}
	if simple.Status != "error" {
		t.Fatalf("expected error status after corrupting virgil.json, got: %+v", simple)
	}
}

// TestApp_T0ServeToolCallWriteMissingContent calls virgil_write against an
// initialized project without a content field, asserting a Builder-level
// guard failure ("doc_kind and content are required"). This exercises
// BuildWrite's own precondition branch, distinct from the uninitialized-
// project guard covered elsewhere.
func TestApp_T0ServeToolCallWriteMissingContent(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "write-missing-content")

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_write",
		"arguments": map[string]any{
			"doc_kind": "idea",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for missing content, got: %+v", result)
	}
	if !strings.Contains(result.Content[0].Text, "required") {
		t.Fatalf("expected 'required' in error content, got: %s", result.Content[0].Text)
	}
}

// TestApp_T0ServeToolCallTransitionMissingFields calls virgil_transition
// against an initialized project without a new_status field, asserting a
// Builder-level guard failure ("task_slug and new_status are required").
// This exercises BuildTransition's own precondition branch, distinct from
// the uninitialized-project guard covered elsewhere.
func TestApp_T0ServeToolCallTransitionMissingFields(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "transition-missing-fields")

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name": "virgil_transition",
		"arguments": map[string]any{
			"task_slug": "task-a",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for missing new_status, got: %+v", result)
	}
	if !strings.Contains(result.Content[0].Text, "required") {
		t.Fatalf("expected 'required' in error content, got: %s", result.Content[0].Text)
	}
}

// TestApp_T0ServeToolCallInitMissingProjectID calls virgil_init with an
// empty project_id, asserting a Builder-level guard failure
// ("project_id is required"). This exercises BuildInit's own precondition
// branch.
func TestApp_T0ServeToolCallInitMissingProjectID(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 2, "tools/call", map[string]any{
		"name": "virgil_init",
		"arguments": map[string]any{
			"project_id": "",
		},
	})
	result := decodeToolCallResult(t, resp)
	if !result.IsError {
		t.Fatalf("expected isError=true for empty project_id, got: %+v", result)
	}
	if !strings.Contains(result.Content[0].Text, "required") {
		t.Fatalf("expected 'required' in error content, got: %s", result.Content[0].Text)
	}
}

// TestApp_T0ServeOversizedLine sends a single newline-less line larger than
// the server's 1 MB max token size (see the bufio.Scanner.Buffer call in
// Run()), forcing scanner.Scan() to fail with bufio.ErrTooLong. This
// exercises Run()'s scanner.Err() branch, which the server treats as a
// fatal read error and shuts down on. A broken pipe partway through this
// best-effort write is an expected side effect of that shutdown, not a
// test bug, so write errors here are intentionally ignored.
func TestApp_T0ServeOversizedLine(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	oversized := bytes.Repeat([]byte("x"), 2<<20) // 2 MiB, no newline
	_, _ = session.stdin.Write(oversized)
	_, _ = io.WriteString(session.stdin, "\n")
	_ = session.stdin.Close()

	if err := session.wait(); err == nil {
		t.Fatal("expected the serve subprocess to exit with a non-zero status after an oversized line")
	}
}

// TestApp_T0ServeToolCallParamsNotObject sends tools/call with a top-level
// "params" value that is valid JSON but not an object (a bare string),
// asserting a -32602 Invalid params error. This exercises
// handleToolsCall()'s outer json.Unmarshal(req.Params, &params) failure,
// distinct from the per-tool "arguments" unmarshal failures covered
// elsewhere.
func TestApp_T0ServeToolCallParamsNotObject(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 2, "tools/call", "not-an-object")
	if resp.Error == nil {
		t.Fatal("expected error response for non-object tools/call params, got none")
	}
	if resp.Error.Code != -32602 {
		t.Fatalf("non-object params error code = %d, want -32602: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeToolCallWriteArgumentsNotObject sends tools/call for
// virgil_write with an "arguments" value that is valid JSON but not an
// object, asserting a -32602 Invalid params error from callWrite's own
// json.Unmarshal(args, &a) guard specifically (as opposed to virgil_init's
// equivalent guard, already covered elsewhere).
func TestApp_T0ServeToolCallWriteArgumentsNotObject(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 2, "tools/call", map[string]any{
		"name":      "virgil_write",
		"arguments": "not-an-object",
	})
	if resp.Error == nil {
		t.Fatal("expected error response for non-object virgil_write arguments, got none")
	}
	if resp.Error.Code != -32602 {
		t.Fatalf("non-object arguments error code = %d, want -32602: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeToolCallTransitionArgumentsNotObject sends tools/call for
// virgil_transition with an "arguments" value that is valid JSON but not
// an object, asserting a -32602 Invalid params error from callTransition's
// own json.Unmarshal(args, &a) guard specifically.
func TestApp_T0ServeToolCallTransitionArgumentsNotObject(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)

	resp := session.call(t, 2, "tools/call", map[string]any{
		"name":      "virgil_transition",
		"arguments": "not-an-object",
	})
	if resp.Error == nil {
		t.Fatal("expected error response for non-object virgil_transition arguments, got none")
	}
	if resp.Error.Code != -32602 {
		t.Fatalf("non-object arguments error code = %d, want -32602: %+v", resp.Error.Code, resp.Error)
	}
}

// TestApp_T0ServeStatusPermissionDeniedLedger initializes a project, then
// revokes read permission on virgil.json directly on disk and calls
// virgil_status again. This exercises LoadState's generic os.ReadFile
// error branch (a read failure that is not fs.ErrNotExist), which
// refreshState swallows into a warning log rather than surfacing as a tool
// error -- callStatus therefore still succeeds, returning the last
// successfully loaded (now stale) state.
func TestApp_T0ServeStatusPermissionDeniedLedger(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits do not restrict reads on windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("cannot exercise a permission-denied read while running as root")
	}

	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "permission-denied-ledger")

	configPath := filepath.Join(dir, "virgil.json")
	if err := os.Chmod(configPath, 0o000); err != nil {
		t.Fatalf("revoke read permission on virgil.json: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(configPath, 0o600) })

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name":      "virgil_status",
		"arguments": map[string]any{},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_status returned isError=true after a permission-denied ledger read: %s", result.Content[0].Text)
	}
	var state appProjectState
	if err := json.Unmarshal([]byte(result.Content[0].Text), &state); err != nil {
		t.Fatalf("decode virgil_status content: %v", err)
	}
	if !state.Initialized {
		t.Fatalf("expected stale-but-initialized state after a permission-denied reload: %+v", state)
	}
}

// TestApp_T0ServeStatusToleratesMalformedTaskFiles seeds docs/tasks/ with a
// stray directory, a non-.md file, a dangling symlink, and three
// malformed .md files (missing the frontmatter open marker, missing the
// close marker, and containing invalid JSON between valid markers), then
// asserts virgil_status still succeeds and silently excludes every one of
// them from the task counts. This exercises countTasksByStatus' filtering
// and read-error continue branches and every error branch of
// extractDocFrontmatter.
func TestApp_T0ServeStatusToleratesMalformedTaskFiles(t *testing.T) {
	dir := t.TempDir()
	session := startServeSession(t, dir)

	session.initialize(t)
	session.initProject(t, 2, "malformed-tasks")

	tasksDir := filepath.Join(dir, "docs", "tasks")
	if err := os.MkdirAll(tasksDir, 0o755); err != nil {
		t.Fatalf("create tasks dir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tasksDir, "a-directory"), 0o755); err != nil {
		t.Fatalf("create stray directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tasksDir, "notes.txt"), []byte("not a task doc"), 0o600); err != nil {
		t.Fatalf("create non-md file: %v", err)
	}
	if err := os.Symlink(filepath.Join(tasksDir, "does-not-exist.md"), filepath.Join(tasksDir, "ghost.md")); err != nil {
		t.Fatalf("create dangling symlink: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tasksDir, "no-markers.md"), []byte("plain text, no frontmatter"), 0o600); err != nil {
		t.Fatalf("create no-markers task file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tasksDir, "open-no-close.md"), []byte("---json\n{\"doc_kind\":\"task\"}\n"), 0o600); err != nil {
		t.Fatalf("create open-no-close task file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tasksDir, "bad-json.md"), []byte("---json\nnot valid json\n---\n\n"), 0o600); err != nil {
		t.Fatalf("create bad-json task file: %v", err)
	}

	resp := session.call(t, 3, "tools/call", map[string]any{
		"name":      "virgil_status",
		"arguments": map[string]any{},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_status returned isError=true with malformed task files present: %s", result.Content[0].Text)
	}
	var state appProjectState
	if err := json.Unmarshal([]byte(result.Content[0].Text), &state); err != nil {
		t.Fatalf("decode virgil_status content: %v", err)
	}
	wantCounts := [5]int{0, 0, 0, 0, 0}
	gotCounts := [5]int{state.TaskCounts.Backlog, state.TaskCounts.Refined, state.TaskCounts.Active, state.TaskCounts.Done, state.TaskCounts.Released}
	if gotCounts != wantCounts {
		t.Fatalf("expected malformed task files to be silently skipped, got counts %+v", state.TaskCounts)
	}
}
