package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// errDoctorChecksFailed signals that one or more doctor checks reported a
// failure ("✗"). The RunE contract only needs a non-nil error to make
// main() exit 1 -- the human-readable summary line is already written to
// stdout before this is returned, and SilenceErrors on rootCmd keeps
// cobra from printing a duplicate "Error: ..." line.
var errDoctorChecksFailed = errors.New("doctor checks failed")

// doctorRPCResponse is a minimal local JSON-RPC 2.0 response shape used
// only by the doctor handshake self-test. It intentionally duplicates the
// shape used by test/app/serve_t0_test.go instead of importing
// internal/mcp, keeping `virgil doctor` a true black-box client of its own
// `virgil serve` subprocess.
type doctorRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *doctorRPCError `json:"error,omitempty"`
}

type doctorRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// doctorToolsListResult mirrors the subset of mcp.toolsListResult needed to
// count the tools reported by tools/list.
type doctorToolsListResult struct {
	Tools []struct {
		Name string `json:"name"`
	} `json:"tools"`
}

// doctorInitializeResult mirrors the subset of internal/mcp.initializeResult
// needed to extract the server's reported version (serverInfo.version) for
// the version-mismatch check below. It intentionally duplicates the shape
// instead of importing internal/mcp, matching doctorRPCResponse's rationale.
type doctorInitializeResult struct {
	ServerInfo struct {
		Version string `json:"version"`
	} `json:"serverInfo"`
}

// doctorMCPSettings mirrors the subset of ~/.claude.json this command reads:
// mcpServers.virgil.{command,args}.
type doctorMCPSettings struct {
	MCPServers map[string]struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	} `json:"mcpServers"`
}

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Diagnose the Virgil MCP server installation",
	Long: `Doctor runs four self-diagnosis checks against the running
virgil binary and its MCP client configuration:

  1. Binary       -- resolves the running binary's own path.
  2. MCP config   -- reads mcpServers.virgil from ~/.claude.json.
  3. Path parity  -- confirms the MCP config points at this same binary.
  4. Handshake    -- spawns "virgil serve" and drives a real MCP handshake.`,
	RunE: runDoctor,
}

func runDoctor(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()
	fmt.Fprintf(out, "virgil doctor v%s\n\n", Version)

	failed := 0
	warned := 0

	execPath, resolvedExecPath := doctorCheckBinary(out, &failed)
	mcpCommand, mcpConfigured := doctorCheckMCPConfig(out, &failed, &warned)
	doctorCheckPathParity(out, &warned, &failed, execPath, resolvedExecPath, mcpCommand, mcpConfigured)
	doctorCheckHandshake(out, &failed, &warned, execPath)

	fmt.Fprintln(out)
	switch {
	case failed > 0:
		fmt.Fprintf(out, "%d check(s) failed.\n", failed)
		return errDoctorChecksFailed
	case warned > 0:
		fmt.Fprintln(out, "All checks passed (with warnings).")
	default:
		fmt.Fprintln(out, "All checks passed.")
	}
	return nil
}

// doctorCheckBinary resolves the running binary's own path via
// os.Executable, then resolves symlinks so Check 3 can compare it against
// the MCP config's command path on equal footing. It returns the raw
// executable path (used to spawn the Check 4 subprocess) and the
// symlink-resolved path (used for the Check 3 comparison); both are empty
// when os.Executable fails.
func doctorCheckBinary(out io.Writer, failed *int) (execPath, resolvedExecPath string) {
	execPath, err := os.Executable()
	if err != nil {
		fmt.Fprintf(out, "✗ Binary: resolve running binary: %v\n", err)
		*failed++
		return "", ""
	}

	resolvedExecPath = execPath
	if resolved, err := filepath.EvalSymlinks(execPath); err == nil {
		resolvedExecPath = resolved
	}

	fmt.Fprintf(out, "✓ Binary: %s (v%s)\n", execPath, Version)
	return execPath, resolvedExecPath
}

// doctorCheckMCPConfig reads ~/.claude.json and extracts mcpServers.virgil --
// this is the file Claude Code actually reads MCP server config from
// (verified via `claude mcp add --scope user` / `claude mcp list`), not
// ~/.claude/settings.json. A missing settings file is a warning, not a
// failure -- Virgil may simply not be registered with Claude yet. When
// ~/.claude.json has no virgil entry, it falls back to checking the legacy
// ~/.claude/settings.json location (written by pre-fix versions of `virgil
// install`) and warns the user to re-run `virgil install` to migrate. It
// returns the raw (unresolved) command path from the config and whether a
// virgil entry was found at all (in either location), both consumed by
// Check 3.
func doctorCheckMCPConfig(out io.Writer, failed, warned *int) (mcpCommand string, mcpConfigured bool) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintf(out, "✗ MCP config: resolve home directory: %v\n", err)
		*failed++
		return "", false
	}

	settingsPath := filepath.Join(homeDir, ".claude.json")
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			if command, ok := doctorCheckLegacyMCPConfig(out, warned, homeDir); ok {
				return command, true
			}
			fmt.Fprintln(out, "⚠ MCP config: ~/.claude.json not found")
			*warned++
			return "", false
		}
		fmt.Fprintf(out, "✗ MCP config: read ~/.claude.json: %v\n", err)
		*failed++
		return "", false
	}

	var settings doctorMCPSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		fmt.Fprintf(out, "✗ MCP config: parse ~/.claude.json: %v\n", err)
		*failed++
		return "", false
	}

	virgilConfig, ok := settings.MCPServers["virgil"]
	if !ok || virgilConfig.Command == "" {
		if command, ok := doctorCheckLegacyMCPConfig(out, warned, homeDir); ok {
			return command, true
		}
		fmt.Fprintln(out, "✗ MCP config: virgil not found in mcpServers")
		*failed++
		return "", false
	}

	commandLine := virgilConfig.Command
	if len(virgilConfig.Args) > 0 {
		commandLine += " " + strings.Join(virgilConfig.Args, " ")
	}
	fmt.Fprintf(out, "✓ MCP config: ~/.claude.json → %s\n", commandLine)
	return virgilConfig.Command, true
}

// doctorCheckLegacyMCPConfig checks the legacy ~/.claude/settings.json
// location for a virgil MCP entry, used as a fallback when ~/.claude.json
// (the file Claude Code actually reads) has none. This location was where
// `virgil install` mistakenly wrote MCP config before the fix -- Claude Code
// never read mcpServers from there, so servers registered under it silently
// never connected. Returns the command and true when a virgil entry is
// found there, printing a migration warning in that case.
func doctorCheckLegacyMCPConfig(out io.Writer, warned *int, homeDir string) (mcpCommand string, found bool) {
	legacyPath := filepath.Join(homeDir, ".claude", "settings.json")
	data, err := os.ReadFile(legacyPath)
	if err != nil {
		return "", false
	}

	var settings doctorMCPSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return "", false
	}

	virgilConfig, ok := settings.MCPServers["virgil"]
	if !ok || virgilConfig.Command == "" {
		return "", false
	}

	fmt.Fprintln(out, "⚠ MCP config: virgil found in legacy ~/.claude/settings.json — run 'virgil install' to migrate to ~/.claude.json")
	*warned++
	return virgilConfig.Command, true
}

// doctorCheckPathParity compares the symlink-resolved running binary path
// (from Check 1) against the symlink-resolved MCP config command path
// (from Check 2), so that e.g. a Homebrew symlink and its Cellar target are
// correctly treated as the same binary. It is skipped when Check 2 found no
// MCP config at all.
func doctorCheckPathParity(out io.Writer, warned, failed *int, execPath, resolvedExecPath, mcpCommand string, mcpConfigured bool) {
	if !mcpConfigured {
		fmt.Fprintln(out, "⚠ Path parity: skipped (no MCP config)")
		*warned++
		return
	}

	resolvedMCPPath := mcpCommand
	if resolved, err := filepath.EvalSymlinks(mcpCommand); err == nil {
		resolvedMCPPath = resolved
	}

	if resolvedExecPath != "" && resolvedMCPPath == resolvedExecPath {
		fmt.Fprintln(out, "✓ Path parity: MCP config matches running binary")
		return
	}

	fmt.Fprintf(out, "✗ Path parity: MCP config points to %s but running from %s\n", mcpCommand, execPath)
	*failed++
}

// doctorCheckHandshake spawns the running binary as `virgil serve` and
// drives a real MCP handshake over its stdin/stdout, exactly as a real MCP
// client would. It never imports internal/mcp -- decoding uses the local
// doctorRPCResponse/doctorToolsListResult shapes declared above.
func doctorCheckHandshake(out io.Writer, failed, warned *int, execPath string) {
	if execPath == "" {
		fmt.Fprintln(out, "✗ Handshake: no binary path available")
		*failed++
		return
	}

	toolCount, serverVersion, err := doctorRunHandshake(execPath)
	if err != nil {
		fmt.Fprintf(out, "✗ Handshake: %v\n", err)
		*failed++
		return
	}

	fmt.Fprintf(out, "✓ Handshake: initialize OK, tools/list OK (%d tools)\n", toolCount)
	doctorCheckVersionMatch(out, warned, serverVersion)
}

// doctorCheckVersionMatch compares the MCP server's reported version
// (serverInfo.version from the initialize response) against this doctor
// binary's own Version. A mismatch means the AI assistant is still talking
// to a stale `virgil serve` process (e.g. after an upgrade, before the
// assistant is restarted) -- this is informational, not a handshake
// failure, so it is reported as a warning rather than incrementing failed.
// The comparison is skipped when either side is empty or "dev", since dev
// builds (Version's default, unset via -ldflags) carry no meaningful
// version to compare.
func doctorCheckVersionMatch(out io.Writer, warned *int, serverVersion string) {
	if serverVersion == "" || serverVersion == "dev" || Version == "" || Version == "dev" {
		return
	}
	if serverVersion == Version {
		return
	}

	fmt.Fprintf(out, "⚠ MCP server version (v%s) differs from doctor version (v%s). Restart your AI assistant to use the latest version.\n", serverVersion, Version)
	*warned++
}

// doctorRunHandshake spawns `execPath serve` as a subprocess bounded by a
// 5-second timeout, sends the standard MCP initialize request, the
// notifications/initialized notification (with an explicit "id":null, which
// exercises the JSONRPCRequest.IsNotification null-id path), and a
// tools/list request, then decodes the two expected responses and returns
// how many tools were reported and the server's reported version
// (serverInfo.version from the initialize response, used by the
// doctorCheckVersionMatch warning).
func doctorRunHandshake(execPath string) (toolCount int, serverVersion string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, execPath, "serve")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return 0, "", fmt.Errorf("open stdin pipe: %w", err)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return 0, "", fmt.Errorf("start serve subprocess: %w", err)
	}

	requestLines := []string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"virgil-doctor","version":"1.0.0"}}}`,
		`{"jsonrpc":"2.0","id":null,"method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
	}
	for _, line := range requestLines {
		if _, err := io.WriteString(stdin, line+"\n"); err != nil {
			_ = stdin.Close()
			_ = cmd.Wait()
			return 0, "", fmt.Errorf("write request: %w", err)
		}
	}
	if err := stdin.Close(); err != nil {
		_ = cmd.Wait()
		return 0, "", fmt.Errorf("close stdin: %w", err)
	}

	waitErr := cmd.Wait()
	if ctx.Err() == context.DeadlineExceeded {
		return 0, "", fmt.Errorf("timed out waiting for serve subprocess")
	}
	if waitErr != nil {
		return 0, "", fmt.Errorf("serve subprocess exited with error: %w (stderr=%q)", waitErr, stderr.String())
	}

	responses, err := doctorParseResponses(stdout.Bytes())
	if err != nil {
		return 0, "", err
	}
	if len(responses) != 2 {
		return 0, "", fmt.Errorf("expected 2 responses (initialize, tools/list), got %d (stderr=%q)", len(responses), stderr.String())
	}
	if responses[0].Error != nil {
		return 0, "", fmt.Errorf("initialize returned error: %s", responses[0].Error.Message)
	}
	if responses[1].Error != nil {
		return 0, "", fmt.Errorf("tools/list returned error: %s", responses[1].Error.Message)
	}

	var initResult doctorInitializeResult
	if err := json.Unmarshal(responses[0].Result, &initResult); err != nil {
		return 0, "", fmt.Errorf("decode initialize result: %w", err)
	}

	var toolsResult doctorToolsListResult
	if err := json.Unmarshal(responses[1].Result, &toolsResult); err != nil {
		return 0, "", fmt.Errorf("decode tools/list result: %w", err)
	}
	return len(toolsResult.Tools), initResult.ServerInfo.Version, nil
}

// doctorParseResponses scans stdout line by line, decoding each non-blank
// line as a JSON-RPC response.
func doctorParseResponses(stdout []byte) ([]doctorRPCResponse, error) {
	scanner := bufio.NewScanner(bytes.NewReader(stdout))
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)

	var responses []doctorRPCResponse
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var resp doctorRPCResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			return nil, fmt.Errorf("decode response %q: %w", string(line), err)
		}
		responses = append(responses, resp)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read stdout: %w", err)
	}
	return responses, nil
}
