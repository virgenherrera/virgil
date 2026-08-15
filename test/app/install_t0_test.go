package app_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// embeddedSkillIDs lists every skill Virgil embeds under internal/skills.
// virgil-workflow is a contextual skill only -- it is installed as a skill
// but never exposed as a slash command (see commandIDs below).
var embeddedSkillIDs = []string{
	"virgil-approve",
	"virgil-init",
	"virgil-new",
	"virgil-propose",
	"virgil-status",
	"virgil-workflow",
}

// commandIDs lists the embedded skills that double as slash commands,
// mirroring cmd/virgil/install.go's commandIDs. virgil-workflow is
// intentionally excluded.
var commandIDs = []string{
	"virgil-init",
	"virgil-new",
	"virgil-propose",
	"virgil-approve",
	"virgil-status",
}

// codexMCPCommandPattern extracts the "command" value from a rendered TOML
// mcp_servers table block.
var codexMCPCommandPattern = regexp.MustCompile(`command\s*=\s*"([^"]+)"`)

// runCLI builds the public binary and executes `virgil {args...}` as a fresh
// subprocess with HOME set to homeDir and the binary's directory prepended
// to PATH, so any exec.LookPath("virgil") performed inside the subprocess
// resolves to the binary's own absolute path.
func runCLI(t *testing.T, homeDir string, args ...string) (stdout, stderr string, exitCode int) {
	t.Helper()

	binary := buildPublicBinary(t)
	binDir := filepath.Dir(binary)

	command := exec.Command(binary, args...)
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
			t.Fatalf("run virgil %v: %v", args, runErr)
		}
	}
	return outBuf.String(), errBuf.String(), exitCode
}

// buildIsolatedEnv builds a subprocess environment from appEnvironment()
// (deterministic LANG/LC_ALL/TZ) plus an isolated HOME and a PATH that
// exposes the freshly built binary's directory so PATH-based lookups inside
// the subprocess resolve to it.
func buildIsolatedEnv(homeDir, binDir string) []string {
	env := append([]string{}, appEnvironment()...)
	env = append(env, "HOME="+homeDir)
	env = append(env, "PATH="+binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return env
}

// assertMCPConfigClaude verifies ~/.claude/settings.json contains
// mcpServers.virgil with an absolute "command" path and "serve" as its
// first argument.
func assertMCPConfigClaude(t *testing.T, homeDir string) {
	t.Helper()

	settingsPath := filepath.Join(homeDir, ".claude", "settings.json")
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read %s: %v", settingsPath, err)
	}

	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("parse %s: %v; content=%q", settingsPath, err, string(data))
	}

	mcpServers, ok := settings["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("%s missing object mcpServers: %v", settingsPath, settings)
	}

	virgilConfig, ok := mcpServers["virgil"].(map[string]any)
	if !ok {
		t.Fatalf("%s missing mcpServers.virgil: %v", settingsPath, mcpServers)
	}

	command, _ := virgilConfig["command"].(string)
	if command == "" || !filepath.IsAbs(command) {
		t.Fatalf("%s mcpServers.virgil.command not an absolute path: %q", settingsPath, command)
	}

	args, ok := virgilConfig["args"].([]any)
	if !ok || len(args) == 0 || args[0] != "serve" {
		t.Fatalf("%s mcpServers.virgil.args unexpected: %v", settingsPath, virgilConfig["args"])
	}
}

// assertMCPConfigCodex verifies ~/.codex/config.toml contains a
// [mcp_servers.virgil] table with an absolute "command" path.
func assertMCPConfigCodex(t *testing.T, homeDir string) {
	t.Helper()

	configPath := filepath.Join(homeDir, ".codex", "config.toml")
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read %s: %v", configPath, err)
	}
	content := string(data)

	block, ok := extractTOMLTable(content, "[mcp_servers.virgil]")
	if !ok {
		t.Fatalf("%s missing [mcp_servers.virgil] table:\n%s", configPath, content)
	}

	match := codexMCPCommandPattern.FindStringSubmatch(block)
	if match == nil {
		t.Fatalf("%s [mcp_servers.virgil] missing command line:\n%s", configPath, block)
	}
	if !filepath.IsAbs(match[1]) {
		t.Fatalf("%s [mcp_servers.virgil].command not an absolute path: %q", configPath, match[1])
	}
}

// extractTOMLTable returns the raw line content of the named top-level TOML
// table (identified by its "[table.name]" header), up to but excluding the
// next line that opens another table. Reports false if header is absent.
func extractTOMLTable(content, header string) (string, bool) {
	lines := strings.Split(content, "\n")
	start := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == header {
			start = i + 1
			break
		}
	}
	if start == -1 {
		return "", false
	}

	end := len(lines)
	for i := start; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if strings.HasPrefix(trimmed, "[") {
			end = i
			break
		}
	}
	return strings.Join(lines[start:end], "\n"), true
}

// assertSkillsInstalled verifies skillsDir has a non-empty SKILL.md for
// every embedded skill.
func assertSkillsInstalled(t *testing.T, skillsDir string) {
	t.Helper()

	for _, id := range embeddedSkillIDs {
		path := filepath.Join(skillsDir, id, "SKILL.md")
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("skill %q not installed at %s: %v", id, path, err)
		}
		if info.Size() == 0 {
			t.Fatalf("skill %q at %s is empty", id, path)
		}
	}
}

// assertCommandsInstalled verifies commandsDir has every command from
// commandIDs, and that virgil-workflow (excluded from commandIDs) was not
// installed as a flat command file. Command layout differs by adapter:
// Claude writes {commandsDir}/{id}.md, Codex writes
// {commandsDir}/{id}/SKILL.md (commands == skills for Codex). Both layouts
// are accepted so this helper works for either agent.
func assertCommandsInstalled(t *testing.T, commandsDir string) {
	t.Helper()

	for _, id := range commandIDs {
		flatPath := filepath.Join(commandsDir, id+".md")
		nestedPath := filepath.Join(commandsDir, id, "SKILL.md")

		if info, err := os.Stat(flatPath); err == nil {
			if info.Size() == 0 {
				t.Fatalf("command %q at %s is empty", id, flatPath)
			}
			continue
		}
		if info, err := os.Stat(nestedPath); err == nil {
			if info.Size() == 0 {
				t.Fatalf("command %q at %s is empty", id, nestedPath)
			}
			continue
		}
		t.Fatalf("command %q not found as %s or %s", id, flatPath, nestedPath)
	}

	if _, err := os.Stat(filepath.Join(commandsDir, "virgil-workflow.md")); err == nil {
		t.Fatalf("virgil-workflow must not be installed as a flat command file in %s", commandsDir)
	}
}

// assertSystemPromptClaude verifies ~/.claude/CLAUDE.md contains exactly one
// virgil:methodology section with the injected content.
func assertSystemPromptClaude(t *testing.T, homeDir string) {
	t.Helper()

	path := filepath.Join(homeDir, ".claude", "CLAUDE.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	content := string(data)

	const marker = "<!-- virgil:methodology -->"
	if occurrences := strings.Count(content, marker); occurrences != 1 {
		t.Fatalf("%s expected exactly one %q marker, found %d:\n%s", path, marker, occurrences, content)
	}
	if !strings.Contains(content, "Virgil Methodology") {
		t.Fatalf("%s missing injected Virgil methodology content:\n%s", path, content)
	}
}

// assertSystemPromptCodex verifies ~/.codex/AGENTS.md contains the injected
// Virgil methodology content.
func assertSystemPromptCodex(t *testing.T, homeDir string) {
	t.Helper()

	path := filepath.Join(homeDir, ".codex", "AGENTS.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if !strings.Contains(string(data), "Virgil Methodology") {
		t.Fatalf("%s missing injected Virgil methodology content:\n%s", path, string(data))
	}
}

// installStateFile mirrors the on-disk shape of ~/.virgil/state.json. It is
// declared locally rather than imported from internal/state so this file
// stays a black-box consumer of the persisted JSON contract.
type installStateFile struct {
	Version         string   `json:"version"`
	InstalledAgents []string `json:"installed_agents"`
	LastSync        string   `json:"last_sync"`
}

// assertStateFile verifies ~/.virgil/state.json exists, has a non-empty
// version and last_sync, and lists exactly expectedAgents (order-independent,
// no duplicates).
func assertStateFile(t *testing.T, homeDir string, expectedAgents []string) {
	t.Helper()

	path := filepath.Join(homeDir, ".virgil", "state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	var st installStateFile
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatalf("parse %s: %v; content=%q", path, err, string(data))
	}

	if st.Version == "" {
		t.Fatalf("%s missing version: %+v", path, st)
	}
	if st.LastSync == "" {
		t.Fatalf("%s missing last_sync: %+v", path, st)
	}

	gotAgents := append([]string{}, st.InstalledAgents...)
	sort.Strings(gotAgents)
	wantAgents := append([]string{}, expectedAgents...)
	sort.Strings(wantAgents)

	if len(gotAgents) != len(wantAgents) {
		t.Fatalf("%s installed_agents = %v, want %v", path, st.InstalledAgents, expectedAgents)
	}
	for i := range gotAgents {
		if gotAgents[i] != wantAgents[i] {
			t.Fatalf("%s installed_agents = %v, want %v", path, st.InstalledAgents, expectedAgents)
		}
	}
}

// TestApp_T0InstallClaudeHappy proves a full `virgil install` run against an
// isolated HOME with only ~/.claude present wires MCP config, skills,
// commands, and the system prompt for Claude Code, and persists state.
func TestApp_T0InstallClaudeHappy(t *testing.T) {
	homeDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(homeDir, ".claude"), 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "Installing Virgil for Claude Code") {
		t.Fatalf("stdout missing Claude Code install banner: %q", stdout)
	}
	if !strings.Contains(stdout, "Virgil installed successfully") {
		t.Fatalf("stdout missing success message: %q", stdout)
	}

	assertMCPConfigClaude(t, homeDir)
	assertSkillsInstalled(t, filepath.Join(homeDir, ".claude", "skills"))
	assertCommandsInstalled(t, filepath.Join(homeDir, ".claude", "commands"))
	assertSystemPromptClaude(t, homeDir)
	assertStateFile(t, homeDir, []string{"claude-code"})
}

// TestApp_T0InstallCodexHappy proves a full `virgil install` run against an
// isolated HOME with only ~/.codex present wires the TOML MCP config,
// skills, commands, and system prompt for Codex, and persists state.
func TestApp_T0InstallCodexHappy(t *testing.T) {
	homeDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(homeDir, ".codex"), 0o755); err != nil {
		t.Fatalf("seed ~/.codex: %v", err)
	}

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "Installing Virgil for Codex") {
		t.Fatalf("stdout missing Codex install banner: %q", stdout)
	}
	if !strings.Contains(stdout, "Virgil installed successfully") {
		t.Fatalf("stdout missing success message: %q", stdout)
	}

	assertMCPConfigCodex(t, homeDir)
	assertSkillsInstalled(t, filepath.Join(homeDir, ".codex", "skills"))
	assertCommandsInstalled(t, filepath.Join(homeDir, ".codex", "skills"))
	assertSystemPromptCodex(t, homeDir)
	assertStateFile(t, homeDir, []string{"codex"})
}

// TestApp_T0InstallBothAgents proves that when both ~/.claude and ~/.codex
// are present, `virgil install` installs into both and records both agent
// IDs in state.
func TestApp_T0InstallBothAgents(t *testing.T) {
	homeDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(homeDir, ".claude"), 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(homeDir, ".codex"), 0o755); err != nil {
		t.Fatalf("seed ~/.codex: %v", err)
	}

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "Installing Virgil for Claude Code") {
		t.Fatalf("stdout missing Claude Code install banner: %q", stdout)
	}
	if !strings.Contains(stdout, "Installing Virgil for Codex") {
		t.Fatalf("stdout missing Codex install banner: %q", stdout)
	}

	assertMCPConfigClaude(t, homeDir)
	assertSkillsInstalled(t, filepath.Join(homeDir, ".claude", "skills"))
	assertCommandsInstalled(t, filepath.Join(homeDir, ".claude", "commands"))
	assertSystemPromptClaude(t, homeDir)

	assertMCPConfigCodex(t, homeDir)
	assertSkillsInstalled(t, filepath.Join(homeDir, ".codex", "skills"))
	assertCommandsInstalled(t, filepath.Join(homeDir, ".codex", "skills"))
	assertSystemPromptCodex(t, homeDir)

	assertStateFile(t, homeDir, []string{"claude-code", "codex"})
}

// TestApp_T0InstallNoAgents proves that when neither ~/.claude nor ~/.codex
// exists, `virgil install` exits cleanly with an informational message and
// writes no state file.
func TestApp_T0InstallNoAgents(t *testing.T) {
	homeDir := t.TempDir()

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	if !strings.Contains(stdout, "No supported AI agents detected.") {
		t.Fatalf("stdout missing no-agents message: %q", stdout)
	}

	statePath := filepath.Join(homeDir, ".virgil", "state.json")
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Fatalf("expected no state file at %s, stat returned: %v", statePath, err)
	}
}

// TestApp_T0InstallIdempotent proves that running `virgil install` twice
// against the same HOME produces the same result: no duplicate agent IDs in
// state, and no duplicate system-prompt sections.
func TestApp_T0InstallIdempotent(t *testing.T) {
	homeDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(homeDir, ".claude"), 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	firstStdout, firstStderr, firstExit := runCLI(t, homeDir, "install")
	if firstExit != 0 {
		t.Fatalf("first virgil install exited %d; stdout=%q stderr=%q", firstExit, firstStdout, firstStderr)
	}

	secondStdout, secondStderr, secondExit := runCLI(t, homeDir, "install")
	if secondExit != 0 {
		t.Fatalf("second virgil install exited %d; stdout=%q stderr=%q", secondExit, secondStdout, secondStderr)
	}
	if !strings.Contains(secondStdout, "Virgil installed successfully") {
		t.Fatalf("second run stdout missing success message: %q", secondStdout)
	}

	assertMCPConfigClaude(t, homeDir)
	assertSkillsInstalled(t, filepath.Join(homeDir, ".claude", "skills"))
	assertCommandsInstalled(t, filepath.Join(homeDir, ".claude", "commands"))
	assertSystemPromptClaude(t, homeDir)
	assertStateFile(t, homeDir, []string{"claude-code"})
}

// TestApp_T0InstallPreservesExistingConfig proves that a pre-existing
// ~/.claude/settings.json with unrelated top-level keys and other MCP
// servers is preserved -- virgil's entry is merged in without clobbering the
// rest of the file.
func TestApp_T0InstallPreservesExistingConfig(t *testing.T) {
	homeDir := t.TempDir()
	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	existing := map[string]any{
		"someOtherTopLevelKey": "keep-me",
		"mcpServers": map[string]any{
			"some-other-server": map[string]any{
				"command": "/usr/local/bin/other-server",
				"args":    []any{"run"},
			},
		},
	}
	existingData, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		t.Fatalf("marshal seed settings: %v", err)
	}
	settingsPath := filepath.Join(claudeDir, "settings.json")
	if err := os.WriteFile(settingsPath, existingData, 0o644); err != nil {
		t.Fatalf("write seed settings: %v", err)
	}

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read %s: %v", settingsPath, err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("parse %s: %v; content=%q", settingsPath, err, string(data))
	}

	if settings["someOtherTopLevelKey"] != "keep-me" {
		t.Fatalf("%s lost unrelated top-level key: %v", settingsPath, settings)
	}

	mcpServers, ok := settings["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("%s missing object mcpServers: %v", settingsPath, settings)
	}

	otherServer, ok := mcpServers["some-other-server"].(map[string]any)
	if !ok {
		t.Fatalf("%s lost pre-existing mcpServers.some-other-server: %v", settingsPath, mcpServers)
	}
	if otherServer["command"] != "/usr/local/bin/other-server" {
		t.Fatalf("%s mcpServers.some-other-server.command was clobbered: %v", settingsPath, otherServer)
	}

	assertMCPConfigClaude(t, homeDir)
}
