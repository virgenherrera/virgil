// Package claude implements the Virgil agents.Adapter contract for Claude
// Code. It knows Claude Code's on-disk config layout (~/.claude/...), how it
// expects MCP servers to be declared in settings.json, and how it discovers
// skills, slash commands, and system-prompt content.
package claude

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/virgenherrera/virgil/internal/agents"
)

// Adapter implements agents.Adapter for Claude Code.
type Adapter struct {
	// lookPath resolves a bare command name to an absolute path. It is a
	// field (rather than a direct exec.LookPath call) so tests can stub it
	// out deterministically. Defaults to exec.LookPath via NewAdapter.
	lookPath func(file string) (string, error)
}

// NewAdapter builds a Claude Code adapter with the real exec.LookPath
// resolver wired in.
func NewAdapter() *Adapter {
	return &Adapter{lookPath: exec.LookPath}
}

var _ agents.Adapter = (*Adapter)(nil)

// --- Identity ---

// Agent returns the AgentID this adapter integrates with.
func (a *Adapter) Agent() agents.AgentID {
	return agents.Claude
}

// Name returns the human-readable agent name.
func (a *Adapter) Name() string {
	return "Claude Code"
}

// Tier returns the depth of Virgil's integration with Claude Code: MCP,
// skills, commands, and system-prompt injection are all supported.
func (a *Adapter) Tier() agents.SupportTier {
	return agents.TierFull
}

// --- Detection ---

// Detect reports whether Claude Code's user-level config directory
// (~/.claude) exists for homeDir.
func (a *Adapter) Detect(homeDir string) bool {
	info, err := os.Stat(a.GlobalConfigDir(homeDir))
	return err == nil && info.IsDir()
}

// InstallCommand tells the user how to install Claude Code when Detect
// reports it as absent.
func (a *Adapter) InstallCommand() string {
	return "npm install -g @anthropic-ai/claude-code"
}

// --- Config paths ---

// GlobalConfigDir returns ~/.claude.
func (a *Adapter) GlobalConfigDir(homeDir string) string {
	return filepath.Join(homeDir, ".claude")
}

// SettingsPath returns ~/.claude/settings.json.
func (a *Adapter) SettingsPath(homeDir string) string {
	return filepath.Join(a.GlobalConfigDir(homeDir), "settings.json")
}

// SkillsDir returns ~/.claude/skills.
func (a *Adapter) SkillsDir(homeDir string) string {
	return filepath.Join(a.GlobalConfigDir(homeDir), "skills")
}

// CommandsDir returns ~/.claude/commands.
func (a *Adapter) CommandsDir(homeDir string) string {
	return filepath.Join(a.GlobalConfigDir(homeDir), "commands")
}

// SystemPromptPath returns ~/.claude/CLAUDE.md.
func (a *Adapter) SystemPromptPath(homeDir string) string {
	return filepath.Join(a.GlobalConfigDir(homeDir), "CLAUDE.md")
}

// --- Strategies ---

// MCPStrategy reports that Claude Code's MCP servers live merged into
// settings.json under the "mcpServers" key.
func (a *Adapter) MCPStrategy() agents.MCPStrategy {
	return agents.MCPStrategyJSONMerge
}

// SystemPromptStrategy reports that Claude Code's system prompt content is
// injected as delimited markdown sections inside CLAUDE.md.
func (a *Adapter) SystemPromptStrategy() agents.SystemPromptStrategy {
	return agents.StrategyMarkdownSections
}

// --- Capabilities ---

// SupportsSkills reports Claude Code support for the skills directory.
func (a *Adapter) SupportsSkills() bool { return true }

// SupportsCommands reports Claude Code support for slash commands.
func (a *Adapter) SupportsCommands() bool { return true }

// SupportsMCP reports Claude Code support for MCP servers.
func (a *Adapter) SupportsMCP() bool { return true }

// SupportsSystemPrompt reports Claude Code support for CLAUDE.md injection.
func (a *Adapter) SupportsSystemPrompt() bool { return true }

// --- Installation ---

// WriteMCPConfig merges an MCP server entry into settings.json under
// mcpServers.{serverName}, preserving every other key already present in
// the file.
//
// Before merging, any bare (non-absolute) "command" value in config is
// resolved to an absolute path via lookPath. Claude Code's MCP client
// launches servers directly rather than through a shell, so it does not
// resolve bare command names against PATH itself — a bare "virgil" entry
// silently fails to start. This was fixed for the standalone installer in
// v0.2.1 and is preserved here so every future MCP server registered
// through this adapter gets the same treatment.
func (a *Adapter) WriteMCPConfig(settingsPath string, serverName string, config map[string]any) error {
	settings, err := readOrCreateSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}

	mcpServers, ok := settings["mcpServers"].(map[string]any)
	if !ok {
		mcpServers = make(map[string]any)
	}
	mcpServers[serverName] = a.resolveCommandPath(config)
	settings["mcpServers"] = mcpServers

	return writeSettings(settingsPath, settings)
}

// resolveCommandPath returns a copy of config with a bare "command" value
// resolved to an absolute path when lookPath can find it on PATH. The input
// map is never mutated.
func (a *Adapter) resolveCommandPath(config map[string]any) map[string]any {
	resolved := make(map[string]any, len(config))
	for k, v := range config {
		resolved[k] = v
	}

	cmd, ok := resolved["command"].(string)
	if !ok || cmd == "" || filepath.IsAbs(cmd) {
		return resolved
	}

	lookPath := a.lookPath
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	if abs, err := lookPath(cmd); err == nil {
		resolved["command"] = abs
	}
	return resolved
}

// readOrCreateSettings loads existing settings.json or returns an empty map
// when the file does not yet exist.
func readOrCreateSettings(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return make(map[string]any), nil
	}
	if err != nil {
		return nil, err
	}

	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return settings, nil
}

// writeSettings serialises settings as indented JSON and writes it to path,
// creating parent directories as needed.
func writeSettings(path string, settings map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal settings: %w", err)
	}
	data = append(data, '\n')

	return os.WriteFile(path, data, 0o644)
}

// WriteSkill writes content to {skillsDir}/{skillID}/SKILL.md, creating
// directories as needed.
func (a *Adapter) WriteSkill(skillsDir string, skillID string, content []byte) error {
	dir := filepath.Join(skillsDir, skillID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create skill directory: %w", err)
	}

	path := filepath.Join(dir, "SKILL.md")
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// WriteCommand writes content to {commandsDir}/{cmdID}.md, creating
// directories as needed.
func (a *Adapter) WriteCommand(commandsDir string, cmdID string, content []byte) error {
	if err := os.MkdirAll(commandsDir, 0o755); err != nil {
		return fmt.Errorf("create commands directory: %w", err)
	}

	path := filepath.Join(commandsDir, cmdID+".md")
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// InjectSystemPrompt writes content into promptPath between
// <!-- virgil:{sectionID} --> / <!-- /virgil:{sectionID} --> markers. If the
// markers already exist, the content between them is replaced in place; if
// the file has no such section yet, one is appended (the file is created if
// it does not exist).
func (a *Adapter) InjectSystemPrompt(promptPath string, sectionID string, content []byte) error {
	startMarker := fmt.Sprintf("<!-- virgil:%s -->", sectionID)
	endMarker := fmt.Sprintf("<!-- /virgil:%s -->", sectionID)
	section := startMarker + "\n" + string(content) + "\n" + endMarker

	existing, err := os.ReadFile(promptPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read %s: %w", promptPath, err)
	}

	var result string
	switch {
	case len(existing) == 0:
		result = section + "\n"
	default:
		text := string(existing)
		startIdx := strings.Index(text, startMarker)
		if startIdx == -1 {
			if !strings.HasSuffix(text, "\n") {
				text += "\n"
			}
			result = text + "\n" + section + "\n"
			break
		}

		relEndIdx := strings.Index(text[startIdx:], endMarker)
		if relEndIdx == -1 {
			return fmt.Errorf("section %q: found start marker without matching end marker in %s", sectionID, promptPath)
		}
		endIdx := startIdx + relEndIdx + len(endMarker)
		result = text[:startIdx] + section + text[endIdx:]
	}

	if err := os.MkdirAll(filepath.Dir(promptPath), 0o755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	if err := os.WriteFile(promptPath, []byte(result), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", promptPath, err)
	}
	return nil
}
