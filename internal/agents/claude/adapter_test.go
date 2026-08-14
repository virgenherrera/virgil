package claude

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteMCPConfig_MergesWithExisting(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	initial := `{
  "existingKey": "keep-me",
  "mcpServers": {
    "other": {
      "command": "/usr/bin/other",
      "args": ["run"]
    }
  }
}
`
	if err := os.WriteFile(settingsPath, []byte(initial), 0o644); err != nil {
		t.Fatalf("write initial settings: %v", err)
	}

	a := &Adapter{lookPath: func(string) (string, error) {
		return "/usr/local/bin/virgil", nil
	}}

	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "virgil",
		"args":    []any{"serve"},
	}); err != nil {
		t.Fatalf("WriteMCPConfig: %v", err)
	}

	settings := readSettings(t, settingsPath)

	if got := settings["existingKey"]; got != "keep-me" {
		t.Errorf("existingKey = %v, want keep-me (unrelated keys must be preserved)", got)
	}

	mcpServers, ok := settings["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("mcpServers is not a map: %v", settings["mcpServers"])
	}

	other, ok := mcpServers["other"].(map[string]any)
	if !ok {
		t.Fatalf("mcpServers.other missing or wrong type: %v", mcpServers["other"])
	}
	if other["command"] != "/usr/bin/other" {
		t.Errorf("mcpServers.other.command = %v, want /usr/bin/other (must survive merge untouched)", other["command"])
	}

	virgil, ok := mcpServers["virgil"].(map[string]any)
	if !ok {
		t.Fatalf("mcpServers.virgil missing or wrong type: %v", mcpServers["virgil"])
	}
	if virgil["command"] != "/usr/local/bin/virgil" {
		t.Errorf("mcpServers.virgil.command = %v, want /usr/local/bin/virgil", virgil["command"])
	}
}

func TestWriteMCPConfig_IdempotentInstall(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	a := &Adapter{lookPath: func(string) (string, error) {
		return "/usr/local/bin/virgil", nil
	}}

	config := map[string]any{
		"command": "virgil",
		"args":    []any{"serve"},
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", config); err != nil {
		t.Fatalf("first WriteMCPConfig: %v", err)
	}
	first, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read after first write: %v", err)
	}

	if err := a.WriteMCPConfig(settingsPath, "virgil", config); err != nil {
		t.Fatalf("second WriteMCPConfig: %v", err)
	}
	second, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read after second write: %v", err)
	}

	if string(first) != string(second) {
		t.Errorf("settings.json changed on second identical install:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

func TestWriteMCPConfig_AbsolutePath(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	var lookedUp string
	a := &Adapter{lookPath: func(name string) (string, error) {
		lookedUp = name
		return "/opt/homebrew/bin/virgil", nil
	}}

	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "virgil",
		"args":    []any{"serve"},
	}); err != nil {
		t.Fatalf("WriteMCPConfig: %v", err)
	}

	if lookedUp != "virgil" {
		t.Errorf("lookPath called with %q, want %q", lookedUp, "virgil")
	}

	settings := readSettings(t, settingsPath)
	mcpServers := settings["mcpServers"].(map[string]any)
	virgil := mcpServers["virgil"].(map[string]any)

	cmd, _ := virgil["command"].(string)
	if cmd != "/opt/homebrew/bin/virgil" {
		t.Errorf("command = %q, want an absolute path (/opt/homebrew/bin/virgil)", cmd)
	}
	if !filepath.IsAbs(cmd) {
		t.Errorf("command %q is not absolute", cmd)
	}
	if cmd == "virgil" {
		t.Errorf("command was left as bare %q — Claude Code's MCP client cannot resolve bare names from PATH", cmd)
	}
}

func TestWriteMCPConfig_UnresolvableCommandKeptAsIs(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	a := &Adapter{lookPath: func(string) (string, error) {
		return "", os.ErrNotExist
	}}

	if err := a.WriteMCPConfig(settingsPath, "virgil", map[string]any{
		"command": "virgil",
	}); err != nil {
		t.Fatalf("WriteMCPConfig: %v", err)
	}

	settings := readSettings(t, settingsPath)
	mcpServers := settings["mcpServers"].(map[string]any)
	virgil := mcpServers["virgil"].(map[string]any)

	if virgil["command"] != "virgil" {
		t.Errorf("command = %v, want fallback to bare %q when lookPath fails", virgil["command"], "virgil")
	}
}

func TestWriteSkill(t *testing.T) {
	dir := t.TempDir()
	skillsDir := filepath.Join(dir, "skills")

	a := NewAdapter()
	content := []byte("# My Skill\n\nDoes a thing.\n")

	if err := a.WriteSkill(skillsDir, "my-skill", content); err != nil {
		t.Fatalf("WriteSkill: %v", err)
	}

	path := filepath.Join(skillsDir, "my-skill", "SKILL.md")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written skill: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("skill content = %q, want %q", got, content)
	}
}

func TestWriteCommand(t *testing.T) {
	dir := t.TempDir()
	commandsDir := filepath.Join(dir, "commands")

	a := NewAdapter()
	content := []byte("---\ndescription: test\n---\nDo the thing.\n")

	if err := a.WriteCommand(commandsDir, "do-thing", content); err != nil {
		t.Fatalf("WriteCommand: %v", err)
	}

	path := filepath.Join(commandsDir, "do-thing.md")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written command: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("command content = %q, want %q", got, content)
	}
}

func TestDetect(t *testing.T) {
	a := NewAdapter()

	t.Run("absent", func(t *testing.T) {
		home := t.TempDir()
		if a.Detect(home) {
			t.Errorf("Detect(%s) = true, want false (no .claude directory)", home)
		}
	})

	t.Run("present", func(t *testing.T) {
		home := t.TempDir()
		if err := os.MkdirAll(filepath.Join(home, ".claude"), 0o755); err != nil {
			t.Fatalf("mkdir .claude: %v", err)
		}
		if !a.Detect(home) {
			t.Errorf("Detect(%s) = false, want true (.claude directory exists)", home)
		}
	})

	t.Run("file not directory", func(t *testing.T) {
		home := t.TempDir()
		if err := os.WriteFile(filepath.Join(home, ".claude"), []byte("oops"), 0o644); err != nil {
			t.Fatalf("write .claude file: %v", err)
		}
		if a.Detect(home) {
			t.Errorf("Detect(%s) = true, want false (.claude is a file, not a directory)", home)
		}
	})
}

func TestInjectSystemPrompt(t *testing.T) {
	t.Run("creates file with new section when none exists", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "CLAUDE.md")

		a := NewAdapter()
		if err := a.InjectSystemPrompt(path, "virgil-workflow", []byte("Follow the workflow.")); err != nil {
			t.Fatalf("InjectSystemPrompt: %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read CLAUDE.md: %v", err)
		}
		want := "<!-- virgil:virgil-workflow -->\nFollow the workflow.\n<!-- /virgil:virgil-workflow -->\n"
		if string(got) != want {
			t.Errorf("content = %q, want %q", got, want)
		}
	})

	t.Run("appends section when file exists without markers", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "CLAUDE.md")
		if err := os.WriteFile(path, []byte("# My Project\n\nSome notes.\n"), 0o644); err != nil {
			t.Fatalf("seed CLAUDE.md: %v", err)
		}

		a := NewAdapter()
		if err := a.InjectSystemPrompt(path, "virgil-workflow", []byte("Follow the workflow.")); err != nil {
			t.Fatalf("InjectSystemPrompt: %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read CLAUDE.md: %v", err)
		}
		want := "# My Project\n\nSome notes.\n\n<!-- virgil:virgil-workflow -->\nFollow the workflow.\n<!-- /virgil:virgil-workflow -->\n"
		if string(got) != want {
			t.Errorf("content = %q, want %q", got, want)
		}
	})

	t.Run("replaces content between existing markers in place", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "CLAUDE.md")
		seed := "# My Project\n\n<!-- virgil:virgil-workflow -->\nOld content.\n<!-- /virgil:virgil-workflow -->\n\nMore notes below.\n"
		if err := os.WriteFile(path, []byte(seed), 0o644); err != nil {
			t.Fatalf("seed CLAUDE.md: %v", err)
		}

		a := NewAdapter()
		if err := a.InjectSystemPrompt(path, "virgil-workflow", []byte("New content.")); err != nil {
			t.Fatalf("InjectSystemPrompt: %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read CLAUDE.md: %v", err)
		}
		want := "# My Project\n\n<!-- virgil:virgil-workflow -->\nNew content.\n<!-- /virgil:virgil-workflow -->\n\nMore notes below.\n"
		if string(got) != want {
			t.Errorf("content = %q, want %q", got, want)
		}
	})

	t.Run("replace is idempotent", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "CLAUDE.md")

		a := NewAdapter()
		if err := a.InjectSystemPrompt(path, "virgil-workflow", []byte("Content.")); err != nil {
			t.Fatalf("first InjectSystemPrompt: %v", err)
		}
		first, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read after first inject: %v", err)
		}

		if err := a.InjectSystemPrompt(path, "virgil-workflow", []byte("Content.")); err != nil {
			t.Fatalf("second InjectSystemPrompt: %v", err)
		}
		second, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read after second inject: %v", err)
		}

		if string(first) != string(second) {
			t.Errorf("CLAUDE.md changed on second identical inject:\nfirst:\n%s\nsecond:\n%s", first, second)
		}
	})

	t.Run("distinct sections coexist", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "CLAUDE.md")

		a := NewAdapter()
		if err := a.InjectSystemPrompt(path, "section-a", []byte("A content.")); err != nil {
			t.Fatalf("inject section-a: %v", err)
		}
		if err := a.InjectSystemPrompt(path, "section-b", []byte("B content.")); err != nil {
			t.Fatalf("inject section-b: %v", err)
		}

		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read CLAUDE.md: %v", err)
		}
		want := "<!-- virgil:section-a -->\nA content.\n<!-- /virgil:section-a -->\n\n<!-- virgil:section-b -->\nB content.\n<!-- /virgil:section-b -->\n"
		if string(got) != want {
			t.Errorf("content = %q, want %q", got, want)
		}
	})
}

func readSettings(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("unmarshal %s: %v", path, err)
	}
	return settings
}
