package app_test

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// --- Helpers ---

// runSyncCLI builds the public binary and executes `virgil sync` with an
// isolated HOME. The binary's directory is prepended to PATH so
// exec.LookPath("virgil") inside the process (used when resolving MCP
// command paths) can find it, mirroring how a real user invocation works.
func runSyncCLI(t *testing.T, homeDir string) (stdout, stderr string, exitCode int) {
	t.Helper()

	binary := buildPublicBinary(t)
	binDir := filepath.Dir(binary)

	cmd := exec.Command(binary, "sync")
	cmd.Env = append(os.Environ(),
		"HOME="+homeDir,
		"PATH="+binDir+":"+os.Getenv("PATH"),
	)

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err := cmd.Run()
	exitCode = 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("run virgil sync: %v", err)
		}
	}

	return outBuf.String(), errBuf.String(), exitCode
}

// syncStateFile mirrors internal/state.InstallState's on-disk JSON shape.
// It is redeclared here (rather than imported) because this package builds
// and drives the public binary as a subprocess and must not import any
// internal/ package.
type syncStateFile struct {
	Version         string   `json:"version"`
	InstalledAgents []string `json:"installed_agents"`
	LastSync        string   `json:"last_sync"`
}

// seedStateFile writes a state.json at ~/.virgil/state.json with the given
// agent IDs, so `virgil sync` finds pre-existing installed agents without
// needing to run `virgil install` first.
func seedStateFile(t *testing.T, homeDir string, agentIDs []string) {
	t.Helper()

	stateDir := filepath.Join(homeDir, ".virgil")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}

	st := syncStateFile{
		Version:         "t0-test",
		InstalledAgents: agentIDs,
		LastSync:        "2020-01-01T00:00:00Z",
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		t.Fatalf("marshal seeded state: %v", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(filepath.Join(stateDir, "state.json"), data, 0o644); err != nil {
		t.Fatalf("write seeded state.json: %v", err)
	}
}

// readSyncState reads and parses ~/.virgil/state.json, failing the test if
// it is missing or malformed.
func readSyncState(t *testing.T, homeDir string) syncStateFile {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(homeDir, ".virgil", "state.json"))
	if err != nil {
		t.Fatalf("read state.json: %v", err)
	}

	var st syncStateFile
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatalf("parse state.json: %v", err)
	}
	return st
}

// staleSkillContent and staleSystemPromptContent stand in for content
// written by an older Virgil version, so a test can assert sync overwrites
// them with the embedded skill/prompt content the binary under test ships.
const (
	staleSkillContent        = "---\nname: virgil-workflow\ndescription: stale placeholder\n---\n\nSTALE CONTENT FROM A PRIOR VIRGIL VERSION\n"
	staleSystemPromptContent = "STALE SYSTEM PROMPT PLACEHOLDER\n"
)

// knownMCPSettingsJSON is byte-identical seed content for Claude's
// settings.json, used to prove `virgil sync` never touches MCP
// configuration (only `virgil install` does).
const knownMCPSettingsJSON = `{
  "mcpServers": {
    "virgil": {
      "command": "/some/fixed/path/virgil",
      "args": [
        "serve"
      ]
    }
  },
  "someUnrelatedSetting": true
}
`

// seedClaudeInstall creates a minimal pre-existing Claude Code installation
// under homeDir: ~/.claude/settings.json with a known MCP config (to verify
// sync leaves it untouched), plus stale skill/system-prompt content (to
// verify sync refreshes it).
func seedClaudeInstall(t *testing.T, homeDir, binaryPath string) {
	t.Helper()

	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("create ~/.claude: %v", err)
	}

	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), []byte(knownMCPSettingsJSON), 0o644); err != nil {
		t.Fatalf("seed settings.json: %v", err)
	}

	skillDir := filepath.Join(claudeDir, "skills", "virgil-workflow")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("create stale skill dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(staleSkillContent), 0o644); err != nil {
		t.Fatalf("seed stale skill: %v", err)
	}

	commandsDir := filepath.Join(claudeDir, "commands")
	if err := os.MkdirAll(commandsDir, 0o755); err != nil {
		t.Fatalf("create commands dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(commandsDir, "virgil-status.md"), []byte(staleSkillContent), 0o644); err != nil {
		t.Fatalf("seed stale command: %v", err)
	}

	if err := os.WriteFile(filepath.Join(claudeDir, "CLAUDE.md"), []byte(staleSystemPromptContent), 0o644); err != nil {
		t.Fatalf("seed stale CLAUDE.md: %v", err)
	}
}

// seedCodexInstall creates a minimal pre-existing Codex installation under
// homeDir: ~/.codex/ with stale skill and AGENTS.md content, so a sync test
// can verify both get refreshed.
func seedCodexInstall(t *testing.T, homeDir string) {
	t.Helper()

	codexDir := filepath.Join(homeDir, ".codex")
	if err := os.MkdirAll(codexDir, 0o755); err != nil {
		t.Fatalf("create ~/.codex: %v", err)
	}

	skillDir := filepath.Join(codexDir, "skills", "virgil-workflow")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("create stale codex skill dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(staleSkillContent), 0o644); err != nil {
		t.Fatalf("seed stale codex skill: %v", err)
	}

	if err := os.WriteFile(filepath.Join(codexDir, "AGENTS.md"), []byte(staleSystemPromptContent), 0o644); err != nil {
		t.Fatalf("seed stale AGENTS.md: %v", err)
	}
}

// --- Scenarios ---

// TestApp_T0SyncHappy proves that against a pre-populated Claude Code
// installation, `virgil sync` re-applies skills, commands, and the system
// prompt (overwriting stale content) and advances state.json's LastSync
// timestamp, all without requiring `virgil install` to run first in the
// same process.
func TestApp_T0SyncHappy(t *testing.T) {
	homeDir := t.TempDir()
	binary := buildPublicBinary(t)

	seedClaudeInstall(t, homeDir, binary)
	seedStateFile(t, homeDir, []string{"claude-code"})
	before := readSyncState(t, homeDir)

	stdout, stderr, exitCode := runSyncCLI(t, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil sync exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	// Skill content must have been refreshed away from the stale seed.
	skillPath := filepath.Join(homeDir, ".claude", "skills", "virgil-workflow", "SKILL.md")
	skillContent, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("read synced skill: %v", err)
	}
	if string(skillContent) == staleSkillContent {
		t.Fatalf("expected skill content to be overwritten by sync, still stale: %q", skillContent)
	}

	// All embedded skills must be present after sync, not just the one
	// seeded stale.
	for _, id := range []string{
		"virgil-workflow", "virgil-init", "virgil-new",
		"virgil-propose", "virgil-approve", "virgil-status",
	} {
		p := filepath.Join(homeDir, ".claude", "skills", id, "SKILL.md")
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected skill %q written by sync, stat failed: %v", id, err)
		}
	}

	// Commands must have been refreshed.
	cmdPath := filepath.Join(homeDir, ".claude", "commands", "virgil-status.md")
	cmdContent, err := os.ReadFile(cmdPath)
	if err != nil {
		t.Fatalf("read synced command: %v", err)
	}
	if string(cmdContent) == staleSkillContent {
		t.Fatalf("expected command content to be overwritten by sync, still stale: %q", cmdContent)
	}

	// System prompt section must have been refreshed away from the stale
	// seed and contain the current Virgil methodology markers.
	promptContent, err := os.ReadFile(filepath.Join(homeDir, ".claude", "CLAUDE.md"))
	if err != nil {
		t.Fatalf("read synced CLAUDE.md: %v", err)
	}
	promptStr := string(promptContent)
	if !strings.Contains(promptStr, "<!-- virgil:methodology -->") {
		t.Fatalf("expected CLAUDE.md to contain virgil methodology section, got: %q", promptStr)
	}
	if !strings.Contains(promptStr, "Virgil Methodology") {
		t.Fatalf("expected CLAUDE.md to contain refreshed methodology content, got: %q", promptStr)
	}

	// state.json's LastSync must have advanced past the seeded value.
	after := readSyncState(t, homeDir)
	if after.LastSync == before.LastSync {
		t.Fatalf("expected LastSync to advance from seeded %q, got unchanged", before.LastSync)
	}
	if len(after.InstalledAgents) != 1 || after.InstalledAgents[0] != "claude-code" {
		t.Fatalf("expected InstalledAgents to remain [claude-code], got %v", after.InstalledAgents)
	}
}

// TestApp_T0SyncNoState proves that running `virgil sync` with no
// pre-existing ~/.virgil/state.json produces a clean informational message
// and exits 0, rather than failing.
func TestApp_T0SyncNoState(t *testing.T) {
	homeDir := t.TempDir()

	stdout, stderr, exitCode := runSyncCLI(t, homeDir)
	if exitCode != 0 {
		t.Fatalf("expected exit 0 with no state, got %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "No installed agents found") {
		t.Fatalf("expected informational message about no installed agents, got stdout=%q stderr=%q", stdout, stderr)
	}

	// No state.json should have been created by a no-op sync.
	if _, err := os.Stat(filepath.Join(homeDir, ".virgil", "state.json")); err == nil {
		t.Fatalf("expected no state.json to be created when there was nothing to sync")
	}
}

// TestApp_T0SyncPreservesMCPConfig proves the key behavioral difference
// between `virgil sync` and `virgil install`: sync must never touch MCP
// configuration. settings.json content must be byte-identical before and
// after sync.
func TestApp_T0SyncPreservesMCPConfig(t *testing.T) {
	homeDir := t.TempDir()
	binary := buildPublicBinary(t)

	seedClaudeInstall(t, homeDir, binary)
	seedStateFile(t, homeDir, []string{"claude-code"})

	settingsPath := filepath.Join(homeDir, ".claude", "settings.json")
	before, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read seeded settings.json: %v", err)
	}

	stdout, stderr, exitCode := runSyncCLI(t, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil sync exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	after, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read settings.json after sync: %v", err)
	}

	if string(before) != string(after) {
		t.Fatalf("expected settings.json to be byte-identical after sync (MCP config must not change)\nbefore=%q\nafter=%q", before, after)
	}
}

// TestApp_T0SyncMultipleAgents proves that when state.json lists more than
// one installed agent, `virgil sync` refreshes assets for every one of
// them: Claude Code and Codex.
func TestApp_T0SyncMultipleAgents(t *testing.T) {
	homeDir := t.TempDir()
	binary := buildPublicBinary(t)

	seedClaudeInstall(t, homeDir, binary)
	seedCodexInstall(t, homeDir)
	seedStateFile(t, homeDir, []string{"claude-code", "codex"})

	stdout, stderr, exitCode := runSyncCLI(t, homeDir)
	if exitCode != 0 {
		t.Fatalf("virgil sync exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "Claude Code") {
		t.Fatalf("expected sync output to mention Claude Code, got: %q", stdout)
	}
	if !strings.Contains(stdout, "Codex") {
		t.Fatalf("expected sync output to mention Codex, got: %q", stdout)
	}

	// Claude Code assets refreshed.
	claudeSkill, err := os.ReadFile(filepath.Join(homeDir, ".claude", "skills", "virgil-workflow", "SKILL.md"))
	if err != nil {
		t.Fatalf("read claude skill after sync: %v", err)
	}
	if string(claudeSkill) == staleSkillContent {
		t.Fatalf("expected claude skill to be refreshed, still stale")
	}

	// Codex assets refreshed.
	codexSkill, err := os.ReadFile(filepath.Join(homeDir, ".codex", "skills", "virgil-workflow", "SKILL.md"))
	if err != nil {
		t.Fatalf("read codex skill after sync: %v", err)
	}
	if string(codexSkill) == staleSkillContent {
		t.Fatalf("expected codex skill to be refreshed, still stale")
	}

	codexPrompt, err := os.ReadFile(filepath.Join(homeDir, ".codex", "AGENTS.md"))
	if err != nil {
		t.Fatalf("read codex AGENTS.md after sync: %v", err)
	}
	if string(codexPrompt) == staleSystemPromptContent {
		t.Fatalf("expected codex AGENTS.md to be refreshed, still stale")
	}
	if !strings.Contains(string(codexPrompt), "Virgil Methodology") {
		t.Fatalf("expected codex AGENTS.md to contain refreshed methodology content, got: %q", codexPrompt)
	}

	// state.json still lists both agents after sync.
	after := readSyncState(t, homeDir)
	if len(after.InstalledAgents) != 2 {
		t.Fatalf("expected 2 installed agents after sync, got %v", after.InstalledAgents)
	}
}
