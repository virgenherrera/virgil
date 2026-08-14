// Package state persists which AI agents Virgil has installed itself into,
// so `virgil sync` can re-apply embedded assets (skills, system prompt)
// without re-running agent detection.
package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// InstallState records the outcome of the most recent `virgil install` run.
type InstallState struct {
	// Version is the virgil binary version that produced this state.
	Version string `json:"version"`
	// InstalledAgents holds the AgentID (as a string) of every agent Virgil
	// has installed into, e.g. "claude-code", "codex".
	InstalledAgents []string `json:"installed_agents"`
	// LastSync is the RFC3339 timestamp of the most recent install or sync.
	LastSync string `json:"last_sync"`
}

// Path returns the state file location: {homeDir}/.virgil/state.json.
func Path(homeDir string) string {
	return filepath.Join(homeDir, ".virgil", "state.json")
}

// Load reads state from {homeDir}/.virgil/state.json. A missing file is not
// an error -- it returns a zero-value InstallState, since "no state yet" is
// the expected condition before the first `virgil install`.
func Load(homeDir string) (*InstallState, error) {
	data, err := os.ReadFile(Path(homeDir))
	if os.IsNotExist(err) {
		return &InstallState{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read state: %w", err)
	}

	var s InstallState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parse state: %w", err)
	}
	return &s, nil
}

// Save serialises s as indented JSON and writes it to
// {homeDir}/.virgil/state.json, creating the parent directory as needed.
func Save(homeDir string, s *InstallState) error {
	path := Path(homeDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	data = append(data, '\n')

	return os.WriteFile(path, data, 0o644)
}
