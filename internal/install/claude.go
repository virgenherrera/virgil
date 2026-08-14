package install

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func virgilMCPConfig() map[string]any {
	cmd := "virgil"
	if abs, err := exec.LookPath("virgil"); err == nil {
		cmd = abs
	}
	return map[string]any{
		"command": cmd,
		"args":    []any{"serve"},
	}
}

// InstallClaude writes the Virgil MCP server configuration into the
// Claude Code settings file at the given path. It merges with existing
// settings rather than overwriting them.
func InstallClaude(settingsPath string) error {
	settings, err := readOrCreateSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}

	// Ensure mcpServers key exists.
	mcpServers, ok := settings["mcpServers"].(map[string]any)
	if !ok {
		mcpServers = make(map[string]any)
	}
	mcpServers["virgil"] = virgilMCPConfig()
	settings["mcpServers"] = mcpServers

	return writeSettings(settingsPath, settings)
}

// readOrCreateSettings loads existing settings or returns an empty map.
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

// writeSettings serialises settings as indented JSON and writes to path,
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
