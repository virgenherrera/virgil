// Package codex implements the agents.Adapter contract for the OpenAI Codex
// CLI.
//
// Codex's config format was verified before writing this adapter, not
// assumed:
//   - ~/.codex/config.toml is a real TOML file (confirmed against a live
//     installation) holding MCP servers under [mcp_servers.<name>] tables,
//     each with "command"/"args" or "url", plus an optional
//     [mcp_servers.<name>.env] subtable for stdio servers.
//   - ~/.codex/skills/<id>/SKILL.md exists on disk with the same
//     frontmatter convention (name/description) Virgil already embeds for
//     Claude Code, so SupportsSkills is true here — not the "probably
//     false" starting assumption.
//   - ~/.codex/AGENTS.md is Codex's system prompt file. Codex requires the
//     exact uppercase filename; a lowercase "agents.md" is silently ignored
//     on case-sensitive filesystems.
//   - Codex has no separate slash-command directory; skills serve as slash
//     commands, so SupportsCommands routes through WriteSkill.
package codex

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/virgenherrera/virgil/internal/agents"
)

// Adapter implements agents.Adapter for the Codex CLI.
type Adapter struct{}

// New returns a Codex Adapter.
func New() *Adapter {
	return &Adapter{}
}

var _ agents.Adapter = (*Adapter)(nil)

// --- Identity ---

// Agent returns the Codex AgentID.
func (a *Adapter) Agent() agents.AgentID { return agents.Codex }

// Name returns the human-readable agent name.
func (a *Adapter) Name() string { return "Codex" }

// Tier returns TierFull: Codex supports MCP (config.toml), skills
// (~/.codex/skills/<id>/SKILL.md), and system prompt injection
// (~/.codex/AGENTS.md) — the three capabilities TierFull requires. It has
// no slash-command mechanism, but SupportTier does not gate on commands.
func (a *Adapter) Tier() agents.SupportTier { return agents.TierFull }

// --- Detection ---

// Detect reports whether ~/.codex exists as a directory.
func (a *Adapter) Detect(homeDir string) bool {
	info, err := os.Stat(a.GlobalConfigDir(homeDir))
	return err == nil && info.IsDir()
}

// InstallCommand returns the command a user runs to install the Codex CLI.
func (a *Adapter) InstallCommand() string {
	return "npm install -g @openai/codex@latest"
}

// --- Config paths ---

// GlobalConfigDir returns ~/.codex.
func (a *Adapter) GlobalConfigDir(homeDir string) string {
	return filepath.Join(homeDir, ".codex")
}

// SettingsPath returns ~/.codex/config.toml, the file MCP servers and most
// other Codex configuration live in.
func (a *Adapter) SettingsPath(homeDir string) string {
	return filepath.Join(homeDir, ".codex", "config.toml")
}

// SkillsDir returns ~/.codex/skills.
func (a *Adapter) SkillsDir(homeDir string) string {
	return filepath.Join(homeDir, ".codex", "skills")
}

// CommandsDir returns the skills directory — Codex surfaces skills as slash
// commands, so commands are written as skills.
func (a *Adapter) CommandsDir(homeDir string) string {
	return a.SkillsDir(homeDir)
}

// SystemPromptPath returns ~/.codex/AGENTS.md. The uppercase filename is
// required: Codex silently ignores a lowercase "agents.md" on case-sensitive
// filesystems.
func (a *Adapter) SystemPromptPath(homeDir string) string {
	return filepath.Join(homeDir, ".codex", "AGENTS.md")
}

// --- Strategies ---

// MCPStrategy returns MCPStrategyTOML: Codex reads MCP servers from
// [mcp_servers.<name>] tables in config.toml.
func (a *Adapter) MCPStrategy() agents.MCPStrategy { return agents.MCPStrategyTOML }

// SystemPromptStrategy returns StrategyFileReplace: AGENTS.md has no
// section-marker convention, so Virgil owns the whole file.
func (a *Adapter) SystemPromptStrategy() agents.SystemPromptStrategy {
	return agents.StrategyFileReplace
}

// --- Capabilities ---

// SupportsSkills returns true — confirmed against a live
// ~/.codex/skills/<id>/SKILL.md installation.
func (a *Adapter) SupportsSkills() bool { return true }

// SupportsCommands returns true — Codex surfaces skills as slash commands,
// so WriteCommand writes to the skills directory.
func (a *Adapter) SupportsCommands() bool { return true }

// SupportsMCP returns true — Codex supports MCP via config.toml.
func (a *Adapter) SupportsMCP() bool { return true }

// SupportsSystemPrompt returns true — Codex reads ~/.codex/AGENTS.md.
func (a *Adapter) SupportsSystemPrompt() bool { return true }

// --- Installation ---

// WriteMCPConfig upserts an [mcp_servers.<serverName>] table into the TOML
// config at settingsPath, replacing any existing table with that name (and
// its [mcp_servers.<serverName>.env] subtable, if any) while leaving every
// other line in the file untouched.
//
// This intentionally does not use a TOML parsing library. Codex's
// config.toml carries a user's full CLI configuration — feature flags,
// per-project trust state, plugin/marketplace registrations, shell
// environment policy, and more — and a parse/mutate/re-serialize round trip
// through a general-purpose TOML library loses comments, key ordering, and
// formatting the user depends on. Instead this performs targeted line-level
// surgery: locate the named table (and only that table), replace it, leave
// everything else byte-for-byte as it was. This is the same approach a
// sibling Codex adapter (gentle-ai) uses in production for the same reason.
//
// If config["command"] is a bare executable name resolvable on PATH, it is
// rewritten to the absolute path exec.LookPath finds, mirroring the
// resolve-before-write pattern Virgil already uses for Claude's MCP config.
func (a *Adapter) WriteMCPConfig(settingsPath string, serverName string, config map[string]any) error {
	if serverName == "" {
		return errors.New("codex: server name must not be empty")
	}

	resolved := resolveCommandPath(config)

	block, err := renderMCPServerBlock(serverName, resolved)
	if err != nil {
		return fmt.Errorf("codex: render mcp server %q: %w", serverName, err)
	}

	existing, err := readFileOrEmpty(settingsPath)
	if err != nil {
		return fmt.Errorf("codex: read %s: %w", settingsPath, err)
	}

	merged := upsertTOMLTable(existing, "mcp_servers."+serverName, block)

	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		return fmt.Errorf("codex: create config directory: %w", err)
	}

	return os.WriteFile(settingsPath, []byte(merged), 0o644)
}

// WriteSkill writes content to skillsDir/skillID/SKILL.md, the layout Codex
// reads skills from (verified against a live ~/.codex/skills installation).
func (a *Adapter) WriteSkill(skillsDir string, skillID string, content []byte) error {
	if skillID == "" {
		return errors.New("codex: skill id must not be empty")
	}

	dir := filepath.Join(skillsDir, skillID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("codex: create skill directory: %w", err)
	}

	return os.WriteFile(filepath.Join(dir, "SKILL.md"), content, 0o644)
}

// WriteCommand writes a command as a skill — Codex surfaces skills as slash
// commands, so commands land in {commandsDir}/{cmdID}/SKILL.md.
func (a *Adapter) WriteCommand(commandsDir string, cmdID string, content []byte) error {
	return a.WriteSkill(commandsDir, cmdID, content)
}

// InjectSystemPrompt implements StrategyFileReplace by overwriting
// promptPath wholesale. sectionID is accepted to satisfy the Adapter
// interface but unused: FileReplace has no notion of named sections, unlike
// Claude Code's marker-delimited markdown strategy.
func (a *Adapter) InjectSystemPrompt(promptPath string, _ string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(promptPath), 0o755); err != nil {
		return fmt.Errorf("codex: create system prompt directory: %w", err)
	}

	return os.WriteFile(promptPath, content, 0o644)
}

// --- MCP TOML rendering ---

// mcpKeyOrder lists well-known MCP server keys in the order they should
// render, keeping generated blocks stable and matching the shape Codex's
// own config.toml uses (command/args before the rest).
var mcpKeyOrder = []string{"command", "args", "url", "cwd", "startup_timeout_sec", "enabled"}

// resolveCommandPath returns a copy of config with a bare "command" value
// rewritten to its absolute path via exec.LookPath, when resolvable. config
// is left untouched if "command" is absent, not a string, already absolute,
// or not found on PATH.
func resolveCommandPath(config map[string]any) map[string]any {
	cmd, ok := config["command"].(string)
	if !ok || cmd == "" || filepath.IsAbs(cmd) {
		return config
	}

	abs, err := exec.LookPath(cmd)
	if err != nil {
		return config
	}

	out := make(map[string]any, len(config))
	for k, v := range config {
		out[k] = v
	}
	out["command"] = abs
	return out
}

// renderMCPServerBlock renders config as a "[mcp_servers.<serverName>]"
// table, with a trailing "[mcp_servers.<serverName>.env]" subtable when
// config["env"] is present.
func renderMCPServerBlock(serverName string, config map[string]any) (string, error) {
	tableName := "mcp_servers." + serverName

	var lines []string
	written := make(map[string]bool, len(config))

	for _, key := range mcpKeyOrder {
		v, ok := config[key]
		if !ok {
			continue
		}
		line, err := renderTOMLKeyValue(key, v)
		if err != nil {
			return "", err
		}
		lines = append(lines, line)
		written[key] = true
	}

	var rest []string
	for k := range config {
		if k == "env" || written[k] {
			continue
		}
		rest = append(rest, k)
	}
	sort.Strings(rest)
	for _, key := range rest {
		line, err := renderTOMLKeyValue(key, config[key])
		if err != nil {
			return "", err
		}
		lines = append(lines, line)
	}

	block := "[" + tableName + "]"
	if len(lines) > 0 {
		block += "\n" + strings.Join(lines, "\n")
	}

	if rawEnv, ok := config["env"]; ok {
		envLines, err := renderEnvTable(rawEnv)
		if err != nil {
			return "", fmt.Errorf("env: %w", err)
		}
		block += "\n\n[" + tableName + ".env]"
		if len(envLines) > 0 {
			block += "\n" + strings.Join(envLines, "\n")
		}
	}

	return block, nil
}

// renderEnvTable renders an env map (map[string]string or map[string]any of
// strings) as sorted "KEY = "value"" lines.
func renderEnvTable(raw any) ([]string, error) {
	values := make(map[string]string)

	switch env := raw.(type) {
	case map[string]string:
		for k, v := range env {
			values[k] = v
		}
	case map[string]any:
		for k, v := range env {
			s, ok := v.(string)
			if !ok {
				return nil, fmt.Errorf("key %q: expected string, got %T", k, v)
			}
			values[k] = s
		}
	default:
		return nil, fmt.Errorf("expected map[string]string or map[string]any, got %T", raw)
	}

	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+" = "+quoteTOMLString(values[k]))
	}
	return lines, nil
}

// renderTOMLKeyValue renders a single "key = value" TOML line.
func renderTOMLKeyValue(key string, v any) (string, error) {
	rendered, err := renderTOMLValue(v)
	if err != nil {
		return "", fmt.Errorf("key %q: %w", key, err)
	}
	return key + " = " + rendered, nil
}

// renderTOMLValue renders v as a TOML value. Supported types cover what an
// MCP server entry needs: strings, bools, integers (int/int64/float64 — the
// latter for values that arrived via JSON decoding), and string arrays
// ([]string or []any of strings).
func renderTOMLValue(v any) (string, error) {
	switch val := v.(type) {
	case string:
		return quoteTOMLString(val), nil
	case bool:
		return strconv.FormatBool(val), nil
	case int:
		return strconv.Itoa(val), nil
	case int64:
		return strconv.FormatInt(val, 10), nil
	case float64:
		if val == float64(int64(val)) {
			return strconv.FormatInt(int64(val), 10), nil
		}
		return strconv.FormatFloat(val, 'f', -1, 64), nil
	case []string:
		items := make([]string, len(val))
		for i, s := range val {
			items[i] = quoteTOMLString(s)
		}
		return "[" + strings.Join(items, ", ") + "]", nil
	case []any:
		items := make([]string, len(val))
		for i, e := range val {
			s, ok := e.(string)
			if !ok {
				return "", fmt.Errorf("array element %d: expected string, got %T", i, e)
			}
			items[i] = quoteTOMLString(s)
		}
		return "[" + strings.Join(items, ", ") + "]", nil
	default:
		return "", fmt.Errorf("unsupported TOML value type %T", v)
	}
}

// quoteTOMLString renders s as a TOML basic string, escaping backslashes
// before quotes so it round-trips correctly (this matters most for Windows
// paths in "command").
func quoteTOMLString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

// --- File helpers ---

// readFileOrEmpty returns a file's content, or "" if it does not exist.
func readFileOrEmpty(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

// upsertTOMLTable removes any existing [tableName] table (and nested
// subtables, e.g. [tableName.env]) from content and appends newBlock at the
// end. Every other line — comments, blank lines, unrelated tables — is
// preserved verbatim. Idempotent: writing the same block twice produces
// byte-identical output.
func upsertTOMLTable(content, tableName, newBlock string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	header := "[" + tableName + "]"
	subPrefix := "[" + tableName + "."

	lines := strings.Split(content, "\n")
	var kept []string

	i := 0
	for i < len(lines) {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == header || strings.HasPrefix(trimmed, subPrefix) {
			i++
			for i < len(lines) {
				next := strings.TrimSpace(lines[i])
				if strings.HasPrefix(next, "[") && strings.HasSuffix(next, "]") {
					break
				}
				i++
			}
			continue
		}
		kept = append(kept, lines[i])
		i++
	}

	base := strings.TrimSpace(strings.Join(kept, "\n"))
	if base == "" {
		return newBlock + "\n"
	}
	return base + "\n\n" + newBlock + "\n"
}
