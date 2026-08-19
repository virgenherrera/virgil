package app_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// This file contains T0 app-level black-box tests for the `virgil doctor`
// subcommand. Every test builds the public binary via buildPublicBinary(t)
// and drives it exclusively through its CLI surface (argv, env, stdout,
// stderr, exit code) -- exactly what a real operator does. No test in this
// file imports anything from internal/.

// writeClaudeSettings seeds homeDir/.claude.json with a minimal
// mcpServers.virgil entry pointing at command, mirroring the shape written
// by `virgil install` (see assertMCPConfigClaude in install_t0_test.go).
// This is the file Claude Code actually reads MCP server config from -- not
// ~/.claude/settings.json.
func writeClaudeSettings(t *testing.T, homeDir, command string) {
	t.Helper()

	settings := map[string]any{
		"mcpServers": map[string]any{
			"virgil": map[string]any{
				"command": command,
				"args":    []string{"serve"},
			},
		},
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		t.Fatalf("marshal .claude.json: %v", err)
	}
	if err := os.WriteFile(filepath.Join(homeDir, ".claude.json"), data, 0o644); err != nil {
		t.Fatalf("write .claude.json: %v", err)
	}
}

// writeLegacyClaudeSettings seeds homeDir/.claude/settings.json (the
// pre-fix, incorrect location `virgil install` used to write MCP config to)
// with a minimal mcpServers.virgil entry, so tests can prove `virgil doctor`
// still detects and warns about it as a fallback.
func writeLegacyClaudeSettings(t *testing.T, homeDir, command string) {
	t.Helper()

	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("mkdir ~/.claude: %v", err)
	}

	settings := map[string]any{
		"mcpServers": map[string]any{
			"virgil": map[string]any{
				"command": command,
				"args":    []string{"serve"},
			},
		},
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		t.Fatalf("marshal legacy settings.json: %v", err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), data, 0o644); err != nil {
		t.Fatalf("write legacy settings.json: %v", err)
	}
}

// runDoctorCLI runs `binary doctor` as a subprocess with HOME set to
// homeDir and binDir prepended to PATH, mirroring runCLI's environment
// setup. Unlike runCLI, it takes an already-built binary path instead of
// building one itself: doctor's path-parity check (Check 3) compares the
// running binary's own resolved path against the MCP config's resolved
// command path, so the tests need full control over which single binary
// path is used in both places -- runCLI's per-call rebuild into a fresh
// t.TempDir() would make that comparison meaningless.
func runDoctorCLI(t *testing.T, binary, homeDir string) (stdout, stderr string, exitCode int) {
	t.Helper()

	binDir := filepath.Dir(binary)
	command := exec.Command(binary, "doctor")
	command.Env = buildIsolatedEnv(homeDir, binDir)

	var outBuf, errBuf bytes.Buffer
	command.Stdout = &outBuf
	command.Stderr = &errBuf

	runErr := command.Run()
	exitCode = 0
	if runErr != nil {
		var exitErr *exec.ExitError
		if errors.As(runErr, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("run virgil doctor: %v", runErr)
		}
	}
	return outBuf.String(), errBuf.String(), exitCode
}

// TestApp_T0DoctorHappy proves that when ~/.claude.json points
// mcpServers.virgil.command at the exact binary running `doctor`, all four
// checks pass and the process exits 0.
func TestApp_T0DoctorHappy(t *testing.T) {
	binary := buildPublicBinary(t)
	homeDir := t.TempDir()
	writeClaudeSettings(t, homeDir, binary)

	stdout, stderr, exitCode := runDoctorCLI(t, binary, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil doctor exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	for _, want := range []string{
		"✓ Binary:",
		"✓ MCP config:",
		"✓ Path parity:",
		"✓ Handshake:",
		"All checks passed.",
	} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("stdout missing %q: %q (stderr=%q)", want, stdout, stderr)
		}
	}

	// The doctor binary and the `virgil serve` subprocess it spawns for the
	// handshake check are the exact same binary here, so their reported
	// versions always match -- the version-mismatch warning must not fire.
	if strings.Contains(stdout, "MCP server version") {
		t.Fatalf("stdout unexpectedly contains version-mismatch warning: %q", stdout)
	}
}

// TestApp_T0DoctorNoMCPConfig proves that a missing ~/.claude.json (and no
// legacy ~/.claude/settings.json either) downgrades Check 2 (MCP config) and
// Check 3 (path parity, skipped) to warnings rather than failures, and the
// process still exits 0.
func TestApp_T0DoctorNoMCPConfig(t *testing.T) {
	binary := buildPublicBinary(t)
	homeDir := t.TempDir()

	stdout, stderr, exitCode := runDoctorCLI(t, binary, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil doctor exited %d, want 0; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	for _, want := range []string{
		"✓ Binary:",
		"⚠ MCP config:",
		"⚠ Path parity: skipped",
		"✓ Handshake:",
	} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("stdout missing %q: %q (stderr=%q)", want, stdout, stderr)
		}
	}
}

// TestApp_T0DoctorPathMismatch proves that when ~/.claude.json points
// mcpServers.virgil.command at a different binary than the one running
// `doctor`, Check 3 (path parity) fails and the process exits 1.
func TestApp_T0DoctorPathMismatch(t *testing.T) {
	binary := buildPublicBinary(t)
	homeDir := t.TempDir()
	writeClaudeSettings(t, homeDir, "/some/other/path/virgil")

	stdout, stderr, exitCode := runDoctorCLI(t, binary, homeDir)
	if exitCode != 1 {
		t.Fatalf("virgil doctor exited %d, want 1; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	if !strings.Contains(stdout, "✗ Path parity:") {
		t.Fatalf("stdout missing path parity failure: %q", stdout)
	}
	if !strings.Contains(stdout, "failed") {
		t.Fatalf("stdout missing \"failed\" summary: %q", stdout)
	}
}

// TestApp_T0DoctorLegacyConfigWarning proves that when ~/.claude.json has no
// virgil entry but the legacy ~/.claude/settings.json (written by pre-fix
// versions of `virgil install`, which Claude Code never actually reads MCP
// config from) does, Check 2 downgrades to a warning that tells the operator
// to re-run `virgil install` to migrate, Check 3 still runs against the
// legacy command, and the process exits 0 when it points at the real
// binary.
func TestApp_T0DoctorLegacyConfigWarning(t *testing.T) {
	binary := buildPublicBinary(t)
	homeDir := t.TempDir()
	writeLegacyClaudeSettings(t, homeDir, binary)

	stdout, stderr, exitCode := runDoctorCLI(t, binary, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil doctor exited %d, want 0; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	for _, want := range []string{
		"✓ Binary:",
		"⚠ MCP config: virgil found in legacy ~/.claude/settings.json — run 'virgil install' to migrate to ~/.claude.json",
		"✓ Path parity:",
		"✓ Handshake:",
		"All checks passed (with warnings).",
	} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("stdout missing %q: %q (stderr=%q)", want, stdout, stderr)
		}
	}
}
