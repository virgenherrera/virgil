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
	"virgil-init",
	"virgil-status",
	"virgil-transition",
	"virgil-workflow",
	"virgil-write",
}

// commandIDs lists the embedded skills that double as slash commands,
// mirroring cmd/virgil/install.go's commandIDs. virgil-workflow is
// intentionally excluded.
var commandIDs = []string{
	"virgil-init",
	"virgil-write",
	"virgil-transition",
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

// buildIsolatedEnv builds a subprocess environment from appEnvironment(homeDir)
// (deterministic LANG/LC_ALL/TZ/HOME) plus a PATH that exposes the freshly
// built binary's directory so PATH-based lookups inside the subprocess
// resolve to it.
func buildIsolatedEnv(homeDir, binDir string) []string {
	env := append([]string{}, appEnvironment(homeDir)...)
	env = append(env, "PATH="+binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return env
}

// assertMCPConfigClaude verifies ~/.claude.json contains mcpServers.virgil
// with an absolute "command" path and "serve" as its first argument. This is
// the file Claude Code actually reads MCP server config from -- not
// ~/.claude/settings.json.
func assertMCPConfigClaude(t *testing.T, homeDir string) {
	t.Helper()

	settingsPath := filepath.Join(homeDir, ".claude.json")
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
// ~/.claude.json with unrelated top-level keys (simulating real Claude Code
// preferences/tip-history/feature-flag keys) and other MCP servers is
// preserved -- virgil's entry is merged in without clobbering the rest of
// the file.
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
	settingsPath := filepath.Join(homeDir, ".claude.json")
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

// agentManifest mirrors the per-agent manifest block that state.json is
// expected to persist under "manifest.{agentID}" once install/upgrade
// tracks which skills and commands it wrote, so a later upgrade can diff
// against it and remove artifacts that are no longer part of the release.
// Declared locally rather than imported from internal/state so this file
// stays a black-box consumer of the persisted JSON contract.
type agentManifest struct {
	Skills              []string `json:"skills"`
	Commands            []string `json:"commands"`
	SystemPromptPath    string   `json:"system_prompt_path"`
	SystemPromptSection string   `json:"system_prompt_section"`
}

// manifestStateFile extends installStateFile with the "manifest" field.
// Declared locally for the same black-box reasons as agentManifest.
type manifestStateFile struct {
	Version         string                   `json:"version"`
	InstalledAgents []string                 `json:"installed_agents"`
	LastSync        string                   `json:"last_sync"`
	Manifest        map[string]agentManifest `json:"manifest"`
}

// writeManifestStateFile seeds {homeDir}/.virgil/state.json with a manifest
// state file, so tests can simulate a previous install/upgrade run.
func writeManifestStateFile(t *testing.T, homeDir string, st manifestStateFile) {
	t.Helper()

	path := filepath.Join(homeDir, ".virgil", "state.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create %s parent: %v", filepath.Dir(path), err)
	}

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		t.Fatalf("marshal seed state: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write seed state: %v", err)
	}
}

// readManifestStateFile reads and parses {homeDir}/.virgil/state.json as a
// manifestStateFile.
func readManifestStateFile(t *testing.T, homeDir string) manifestStateFile {
	t.Helper()

	path := filepath.Join(homeDir, ".virgil", "state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	var st manifestStateFile
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatalf("parse %s: %v; content=%q", path, err, string(data))
	}
	return st
}

// seedSkillDir creates {skillsDir}/{id}/SKILL.md with placeholder content,
// so pre-existing (stale) skills can be simulated on disk before install.
func seedSkillDir(t *testing.T, skillsDir, id string) {
	t.Helper()

	dir := filepath.Join(skillsDir, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("seed skill dir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# stale skill\n"), 0o644); err != nil {
		t.Fatalf("seed skill file %s: %v", dir, err)
	}
}

// seedCommandDir creates {commandsDir}/{id}/SKILL.md with placeholder
// content, so pre-existing (stale) commands can be simulated on disk before
// install.
func seedCommandDir(t *testing.T, commandsDir, id string) {
	t.Helper()

	dir := filepath.Join(commandsDir, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("seed command dir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# stale command\n"), 0o644); err != nil {
		t.Fatalf("seed command file %s: %v", dir, err)
	}
}

// assertDirAbsent fails the test if path still exists on disk.
func assertDirAbsent(t *testing.T, path string) {
	t.Helper()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected %s to be removed, stat returned: %v", path, err)
	}
}

// TestApp_T0InstallUpgradeCleansPreviousSkills proves that upgrading over a
// previous install whose state.json manifest lists skills/commands that are
// no longer part of the current release removes the stale artifacts from
// disk, installs the current release's artifacts, and rewrites the manifest
// to reflect only what is now installed.
func TestApp_T0InstallUpgradeCleansPreviousSkills(t *testing.T) {
	homeDir := t.TempDir()
	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	skillsDir := filepath.Join(claudeDir, "skills")
	commandsDir := filepath.Join(claudeDir, "commands")

	staleSkills := []string{"old-skill-a", "old-skill-b"}
	staleCommands := []string{"old-cmd-a"}
	for _, id := range staleSkills {
		seedSkillDir(t, skillsDir, id)
	}
	for _, id := range staleCommands {
		seedCommandDir(t, commandsDir, id)
	}

	writeManifestStateFile(t, homeDir, manifestStateFile{
		Version:         "0.0.1-previous",
		InstalledAgents: []string{"claude-code"},
		LastSync:        "2026-01-01T00:00:00Z",
		Manifest: map[string]agentManifest{
			"claude-code": {
				Skills:              staleSkills,
				Commands:            staleCommands,
				SystemPromptPath:    filepath.Join(claudeDir, "CLAUDE.md"),
				SystemPromptSection: "methodology",
			},
		},
	})

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	for _, id := range staleSkills {
		assertDirAbsent(t, filepath.Join(skillsDir, id))
	}
	for _, id := range staleCommands {
		assertDirAbsent(t, filepath.Join(commandsDir, id))
	}

	assertSkillsInstalled(t, skillsDir)
	assertCommandsInstalled(t, commandsDir)

	st := readManifestStateFile(t, homeDir)
	claudeManifest, ok := st.Manifest["claude-code"]
	if !ok {
		t.Fatalf("state.json manifest missing claude-code entry: %+v", st)
	}

	gotSkills := append([]string{}, claudeManifest.Skills...)
	sort.Strings(gotSkills)
	wantSkills := append([]string{}, embeddedSkillIDs...)
	sort.Strings(wantSkills)
	if strings.Join(gotSkills, ",") != strings.Join(wantSkills, ",") {
		t.Fatalf("state.json manifest.claude-code.skills = %v, want %v", claudeManifest.Skills, wantSkills)
	}

	gotCommands := append([]string{}, claudeManifest.Commands...)
	sort.Strings(gotCommands)
	wantCommands := append([]string{}, commandIDs...)
	sort.Strings(wantCommands)
	if strings.Join(gotCommands, ",") != strings.Join(wantCommands, ",") {
		t.Fatalf("state.json manifest.claude-code.commands = %v, want %v", claudeManifest.Commands, wantCommands)
	}
}

// TestApp_T0InstallFreshNoManifest proves that a fresh install (no
// pre-existing ~/.virgil/state.json) installs every current skill and
// command and writes a state.json whose manifest lists them all.
func TestApp_T0InstallFreshNoManifest(t *testing.T) {
	homeDir := t.TempDir()
	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	statePath := filepath.Join(homeDir, ".virgil", "state.json")
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Fatalf("expected no pre-existing state file at %s, stat returned: %v", statePath, err)
	}

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	skillsDir := filepath.Join(claudeDir, "skills")
	commandsDir := filepath.Join(claudeDir, "commands")
	assertSkillsInstalled(t, skillsDir)
	assertCommandsInstalled(t, commandsDir)

	st := readManifestStateFile(t, homeDir)
	claudeManifest, ok := st.Manifest["claude-code"]
	if !ok {
		t.Fatalf("state.json manifest missing claude-code entry: %+v", st)
	}

	gotSkills := append([]string{}, claudeManifest.Skills...)
	sort.Strings(gotSkills)
	wantSkills := append([]string{}, embeddedSkillIDs...)
	sort.Strings(wantSkills)
	if strings.Join(gotSkills, ",") != strings.Join(wantSkills, ",") {
		t.Fatalf("state.json manifest.claude-code.skills = %v, want %v", claudeManifest.Skills, wantSkills)
	}

	gotCommands := append([]string{}, claudeManifest.Commands...)
	sort.Strings(gotCommands)
	wantCommands := append([]string{}, commandIDs...)
	sort.Strings(wantCommands)
	if strings.Join(gotCommands, ",") != strings.Join(wantCommands, ",") {
		t.Fatalf("state.json manifest.claude-code.commands = %v, want %v", claudeManifest.Commands, wantCommands)
	}
}

// TestApp_T0InstallReinstallSameVersion proves that reinstalling when
// state.json's manifest already matches the current release's skills and
// commands overwrites the artifacts in place (no orphaned files) and leaves
// the manifest contents unchanged.
func TestApp_T0InstallReinstallSameVersion(t *testing.T) {
	homeDir := t.TempDir()
	claudeDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("seed ~/.claude: %v", err)
	}

	skillsDir := filepath.Join(claudeDir, "skills")
	commandsDir := filepath.Join(claudeDir, "commands")

	writeManifestStateFile(t, homeDir, manifestStateFile{
		Version:         "dev",
		InstalledAgents: []string{"claude-code"},
		LastSync:        "2026-08-17T18:00:00Z",
		Manifest: map[string]agentManifest{
			"claude-code": {
				Skills:              append([]string{}, embeddedSkillIDs...),
				Commands:            append([]string{}, commandIDs...),
				SystemPromptPath:    filepath.Join(claudeDir, "CLAUDE.md"),
				SystemPromptSection: "methodology",
			},
		},
	})

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	assertSkillsInstalled(t, skillsDir)
	assertCommandsInstalled(t, commandsDir)

	st := readManifestStateFile(t, homeDir)
	claudeManifest, ok := st.Manifest["claude-code"]
	if !ok {
		t.Fatalf("state.json manifest missing claude-code entry: %+v", st)
	}

	gotSkills := append([]string{}, claudeManifest.Skills...)
	sort.Strings(gotSkills)
	wantSkills := append([]string{}, embeddedSkillIDs...)
	sort.Strings(wantSkills)
	if strings.Join(gotSkills, ",") != strings.Join(wantSkills, ",") {
		t.Fatalf("state.json manifest.claude-code.skills = %v, want %v (should remain unchanged)", claudeManifest.Skills, wantSkills)
	}

	gotCommands := append([]string{}, claudeManifest.Commands...)
	sort.Strings(gotCommands)
	wantCommands := append([]string{}, commandIDs...)
	sort.Strings(wantCommands)
	if strings.Join(gotCommands, ",") != strings.Join(wantCommands, ",") {
		t.Fatalf("state.json manifest.claude-code.commands = %v, want %v (should remain unchanged)", claudeManifest.Commands, wantCommands)
	}
}

// installedSchemaPath returns the path `virgil install` materializes the
// canonical virgil.json JSON Schema at, mirroring
// cmd/virgil/install.go's own schemaInstallDir/schemaFileName constants.
// Declared locally rather than imported from cmd/virgil so this file stays a
// black-box consumer of the installed layout.
func installedSchemaPath(homeDir string) string {
	return filepath.Join(homeDir, ".virgil", "schemas", "virgil-config.schema.json")
}

// TestApp_T0InstallMaterializesSchema proves that `virgil install` writes
// the embedded virgil.json JSON Schema to
// ~/.virgil/schemas/virgil-config.schema.json, independent of which (if
// any) AI agents are detected: the schema is a Virgil install-time asset,
// not a per-agent one.
func TestApp_T0InstallMaterializesSchema(t *testing.T) {
	homeDir := t.TempDir()

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}

	schemaPath := installedSchemaPath(homeDir)
	data, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read materialized schema at %s: %v", schemaPath, err)
	}

	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatalf("materialized schema at %s is not valid JSON: %v; content=%q", schemaPath, err, string(data))
	}
	if _, ok := schema["$schema"]; !ok {
		t.Fatalf("materialized schema at %s missing top-level %q key, not a real JSON Schema document: %v", schemaPath, "$schema", schema)
	}
}

// virgilConfigFile mirrors the on-disk shape of virgil.json's $schema
// pointer. Declared locally rather than imported from internal/protocol so
// this file stays a black-box consumer of the persisted JSON contract.
type virgilConfigFile struct {
	Schema string `json:"$schema"`
}

// TestApp_T0InitReferencesInstalledSchema proves that after `virgil install`
// materializes the canonical schema under a given HOME, a `virgil_init` call
// (via the serve subprocess + JSON-RPC, sharing that same HOME) points
// virgil.json's $schema field at the installed path rather than writing its
// own per-project copy, and that no docs/.virgil-schema.json is published in
// the project.
func TestApp_T0InitReferencesInstalledSchema(t *testing.T) {
	homeDir := t.TempDir()

	stdout, stderr, exitCode := runCLI(t, homeDir, "install")
	if exitCode != 0 {
		t.Fatalf("virgil install exited %d; stdout=%q stderr=%q", exitCode, stdout, stderr)
	}
	schemaPath := installedSchemaPath(homeDir)
	if _, err := os.Stat(schemaPath); err != nil {
		t.Fatalf("prerequisite install did not materialize schema at %s: %v", schemaPath, err)
	}

	projectDir := t.TempDir()
	session := startServeSessionWithHome(t, projectDir, homeDir)
	session.initialize(t)

	resp := session.call(t, 2, "tools/call", map[string]any{
		"name": "virgil_init",
		"arguments": map[string]any{
			"project_id": "schema-pointer-project",
		},
	})
	result := decodeToolCallResult(t, resp)
	if result.IsError {
		t.Fatalf("virgil_init returned isError=true: %s", result.Content[0].Text)
	}

	configPath := filepath.Join(projectDir, "virgil.json")
	configData, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read %s: %v", configPath, err)
	}
	var config virgilConfigFile
	if err := json.Unmarshal(configData, &config); err != nil {
		t.Fatalf("parse %s: %v; content=%q", configPath, err, string(configData))
	}
	if config.Schema != schemaPath {
		t.Fatalf("%s $schema = %q, want %q", configPath, config.Schema, schemaPath)
	}

	schemaData, err := os.ReadFile(config.Schema)
	if err != nil {
		t.Fatalf("read schema at %s referenced by virgil.json: %v", config.Schema, err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaData, &schema); err != nil {
		t.Fatalf("schema at %s is not valid JSON: %v; content=%q", config.Schema, err, string(schemaData))
	}
	if _, ok := schema["$schema"]; !ok {
		t.Fatalf("schema at %s missing top-level %q key, not a real JSON Schema document: %v", config.Schema, "$schema", schema)
	}

	legacySchemaPath := filepath.Join(projectDir, "docs", ".virgil-schema.json")
	if _, err := os.Stat(legacySchemaPath); !os.IsNotExist(err) {
		t.Fatalf("expected no per-project schema at %s, stat returned: %v", legacySchemaPath, err)
	}
}
