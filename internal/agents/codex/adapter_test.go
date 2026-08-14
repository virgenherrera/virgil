package codex

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/virgenherrera/virgil/internal/agents"
)

func TestDetect(t *testing.T) {
	t.Run("codex directory present", func(t *testing.T) {
		home := t.TempDir()
		if err := os.MkdirAll(filepath.Join(home, ".codex"), 0o755); err != nil {
			t.Fatalf("setup: %v", err)
		}

		a := New()
		if !a.Detect(home) {
			t.Fatal("Detect() = false, want true when ~/.codex exists")
		}
	})

	t.Run("codex directory absent", func(t *testing.T) {
		home := t.TempDir()

		a := New()
		if a.Detect(home) {
			t.Fatal("Detect() = true, want false when ~/.codex is missing")
		}
	})

	t.Run("codex path exists but is a file, not a directory", func(t *testing.T) {
		home := t.TempDir()
		if err := os.WriteFile(filepath.Join(home, ".codex"), []byte("not a dir"), 0o644); err != nil {
			t.Fatalf("setup: %v", err)
		}

		a := New()
		if a.Detect(home) {
			t.Fatal("Detect() = true, want false when ~/.codex is a regular file")
		}
	})
}

func TestWriteMCPConfig(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	a := New()
	config := map[string]any{
		"command": "/usr/local/bin/virgil",
		"args":    []string{"serve"},
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", config); err != nil {
		t.Fatalf("WriteMCPConfig() error = %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}

	got := string(data)
	want := "[mcp_servers.virgil]\n" +
		"command = \"/usr/local/bin/virgil\"\n" +
		"args = [\"serve\"]\n"

	if got != want {
		t.Fatalf("config.toml content =\n%s\nwant:\n%s", got, want)
	}
}

func TestWriteMCPConfig_WithEnv(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	a := New()
	config := map[string]any{
		"command": "node_repl",
		"args":    []string{},
		"env": map[string]string{
			"CODEX_HOME": "/Users/test/.codex",
			"NODE_PATH":  "/opt/node",
		},
	}

	if err := a.WriteMCPConfig(settingsPath, "node_repl", config); err != nil {
		t.Fatalf("WriteMCPConfig() error = %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}

	got := string(data)
	want := "[mcp_servers.node_repl]\n" +
		"command = \"node_repl\"\n" +
		"args = []\n" +
		"\n" +
		"[mcp_servers.node_repl.env]\n" +
		"CODEX_HOME = \"/Users/test/.codex\"\n" +
		"NODE_PATH = \"/opt/node\"\n"

	if got != want {
		t.Fatalf("config.toml content =\n%s\nwant:\n%s", got, want)
	}
}

func TestWriteMCPConfig_PreservesUnrelatedContent(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	preexisting := "# user comment\n" +
		"[features]\n" +
		"web_search = true\n" +
		"\n" +
		"[mcp_servers.engram]\n" +
		"command = \"engram\"\n" +
		"args = [\"mcp\", \"--tools=agent\"]\n"

	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(settingsPath, []byte(preexisting), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	a := New()
	// Use an absolute, non-resolvable command so this assertion doesn't
	// depend on whether a "virgil-test-fixture-cmd" binary happens to sit
	// on the test runner's PATH.
	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "/opt/virgil/bin/virgil",
		"args":    []string{"serve"},
	}); err != nil {
		t.Fatalf("WriteMCPConfig() error = %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	got := string(data)

	for _, want := range []string{
		"# user comment",
		"[features]",
		"web_search = true",
		"[mcp_servers.engram]",
		"command = \"engram\"",
		"[mcp_servers.virgil]",
		"command = \"/opt/virgil/bin/virgil\"",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("config.toml missing %q, got:\n%s", want, got)
		}
	}
}

func TestWriteMCPConfig_UpsertReplacesExistingServer(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	a := New()
	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "/old/path/virgil",
		"args":    []string{"serve"},
	}); err != nil {
		t.Fatalf("first WriteMCPConfig() error = %v", err)
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "/new/path/virgil",
		"args":    []string{"serve", "--verbose"},
	}); err != nil {
		t.Fatalf("second WriteMCPConfig() error = %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	got := string(data)

	if strings.Contains(got, "/old/path/virgil") {
		t.Fatalf("config.toml still contains the old server entry:\n%s", got)
	}
	if !strings.Contains(got, "/new/path/virgil") {
		t.Fatalf("config.toml missing the new server entry:\n%s", got)
	}
	// Only one [mcp_servers.virgil] header should remain.
	if n := strings.Count(got, "[mcp_servers.virgil]"); n != 1 {
		t.Fatalf("expected exactly one [mcp_servers.virgil] table, found %d in:\n%s", n, got)
	}
}

func TestWriteMCPConfig_Idempotent(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	a := New()
	config := map[string]any{
		"command": "/usr/local/bin/virgil",
		"args":    []string{"serve"},
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", config); err != nil {
		t.Fatalf("first WriteMCPConfig() error = %v", err)
	}
	first, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config after first write: %v", err)
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", config); err != nil {
		t.Fatalf("second WriteMCPConfig() error = %v", err)
	}
	second, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config after second write: %v", err)
	}

	if string(first) != string(second) {
		t.Fatalf("WriteMCPConfig() is not idempotent:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

func TestWriteMCPConfig_ResolvesCommandOnPATH(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	// "sh" is present on PATH in every CI/dev environment this test runs
	// in (POSIX systems); resolveCommandPath should rewrite it to an
	// absolute path, matching the resolve-before-write pattern used for
	// Claude's MCP config.
	a := New()
	if err := a.WriteMCPConfig(settingsPath, "shtest", map[string]any{
		"command": "sh",
		"args":    []string{"-c", "true"},
	}); err != nil {
		t.Fatalf("WriteMCPConfig() error = %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	got := string(data)

	if strings.Contains(got, "command = \"sh\"") {
		t.Fatalf("expected bare \"sh\" to be resolved to an absolute path, got:\n%s", got)
	}
	if !strings.Contains(got, "/sh\"") {
		t.Fatalf("expected resolved command to end in /sh, got:\n%s", got)
	}
}

func TestWriteMCPConfig_EmptyServerName(t *testing.T) {
	home := t.TempDir()
	settingsPath := filepath.Join(home, ".codex", "config.toml")

	a := New()
	if err := a.WriteMCPConfig(settingsPath, "", map[string]any{"command": "x"}); err == nil {
		t.Fatal("WriteMCPConfig() with empty server name: want error, got nil")
	}
}

func TestWriteSkill(t *testing.T) {
	home := t.TempDir()
	skillsDir := filepath.Join(home, ".codex", "skills")

	a := New()
	content := []byte("---\nname: test-skill\ndescription: a test skill\n---\n\nBody.\n")

	if err := a.WriteSkill(skillsDir, "test-skill", content); err != nil {
		t.Fatalf("WriteSkill() error = %v", err)
	}

	got, err := os.ReadFile(filepath.Join(skillsDir, "test-skill", "SKILL.md"))
	if err != nil {
		t.Fatalf("read written skill: %v", err)
	}
	if string(got) != string(content) {
		t.Fatalf("SKILL.md content = %q, want %q", got, content)
	}
}

func TestWriteCommand_Unsupported(t *testing.T) {
	a := New()
	if err := a.WriteCommand("/tmp/commands", "test-cmd", []byte("body")); err == nil {
		t.Fatal("WriteCommand() want error, got nil (Codex does not support commands)")
	}
}

func TestInjectSystemPrompt(t *testing.T) {
	home := t.TempDir()
	promptPath := filepath.Join(home, ".codex", "AGENTS.md")

	a := New()
	if err := a.InjectSystemPrompt(promptPath, "ignored-section-id", []byte("# Virgil\n\nSystem prompt body.\n")); err != nil {
		t.Fatalf("InjectSystemPrompt() error = %v", err)
	}

	got, err := os.ReadFile(promptPath)
	if err != nil {
		t.Fatalf("read AGENTS.md: %v", err)
	}
	want := "# Virgil\n\nSystem prompt body.\n"
	if string(got) != want {
		t.Fatalf("AGENTS.md content = %q, want %q", got, want)
	}

	// FileReplace strategy: a second call with different content replaces
	// the file wholesale rather than appending or merging.
	if err := a.InjectSystemPrompt(promptPath, "ignored-section-id", []byte("# Replaced\n")); err != nil {
		t.Fatalf("InjectSystemPrompt() second call error = %v", err)
	}
	got, err = os.ReadFile(promptPath)
	if err != nil {
		t.Fatalf("read AGENTS.md after replace: %v", err)
	}
	if string(got) != "# Replaced\n" {
		t.Fatalf("AGENTS.md was not replaced wholesale, got %q", got)
	}
}

func TestPaths(t *testing.T) {
	a := New()
	home := "/tmp/home"

	if got, want := a.GlobalConfigDir(home), filepath.Join(home, ".codex"); got != want {
		t.Errorf("GlobalConfigDir() = %q, want %q", got, want)
	}
	if got, want := a.SettingsPath(home), filepath.Join(home, ".codex", "config.toml"); got != want {
		t.Errorf("SettingsPath() = %q, want %q", got, want)
	}
	if got, want := a.SkillsDir(home), filepath.Join(home, ".codex", "skills"); got != want {
		t.Errorf("SkillsDir() = %q, want %q", got, want)
	}
	if got := a.CommandsDir(home); got != "" {
		t.Errorf("CommandsDir() = %q, want \"\"", got)
	}
	if got, want := a.SystemPromptPath(home), filepath.Join(home, ".codex", "AGENTS.md"); got != want {
		t.Errorf("SystemPromptPath() = %q, want %q", got, want)
	}
	// Codex requires the exact uppercase "AGENTS.md" — a lowercase variant
	// is silently ignored on case-sensitive filesystems.
	if got, want := filepath.Base(a.SystemPromptPath(home)), "AGENTS.md"; got != want {
		t.Errorf("SystemPromptPath() base = %q, want %q", got, want)
	}
}

func TestCapabilitiesAndStrategies(t *testing.T) {
	a := New()

	if got := a.Agent(); got != agents.Codex {
		t.Errorf("Agent() = %q, want %q", got, agents.Codex)
	}
	if got := a.Tier(); got != agents.TierFull {
		t.Errorf("Tier() = %v, want TierFull", got)
	}
	if got := a.MCPStrategy(); got != agents.MCPStrategyTOML {
		t.Errorf("MCPStrategy() = %v, want MCPStrategyTOML", got)
	}
	if got := a.SystemPromptStrategy(); got != agents.StrategyFileReplace {
		t.Errorf("SystemPromptStrategy() = %v, want StrategyFileReplace", got)
	}
	if !a.SupportsSkills() {
		t.Error("SupportsSkills() = false, want true (verified against live ~/.codex/skills)")
	}
	if a.SupportsCommands() {
		t.Error("SupportsCommands() = true, want false")
	}
	if !a.SupportsMCP() {
		t.Error("SupportsMCP() = false, want true")
	}
	if !a.SupportsSystemPrompt() {
		t.Error("SupportsSystemPrompt() = false, want true")
	}
}
