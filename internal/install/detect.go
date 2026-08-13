package install

import (
	"os"
	"path/filepath"
)

// AgentKind identifies a supported AI agent.
type AgentKind string

const (
	AgentClaude AgentKind = "claude"
	AgentCodex  AgentKind = "codex"
)

// AgentInfo describes a detected AI agent and where its config lives.
type AgentInfo struct {
	Kind  AgentKind
	Name  string // human-readable name
	Path  string // path where config should be written
	Scope string // "project" or "user"
}

// DetectAgents scans the given directory (and optionally $HOME) for
// known AI agent configurations. Returns one AgentInfo per detected agent.
func DetectAgents(projectDir string) []AgentInfo {
	var agents []AgentInfo

	// Claude Code detection: project-level first, then user-level.
	projectClaude := filepath.Join(projectDir, ".claude")
	if dirExists(projectClaude) {
		agents = append(agents, AgentInfo{
			Kind:  AgentClaude,
			Name:  "Claude Code",
			Path:  filepath.Join(projectClaude, "settings.json"),
			Scope: "project",
		})
	} else if home, err := os.UserHomeDir(); err == nil {
		userClaude := filepath.Join(home, ".claude")
		if dirExists(userClaude) {
			agents = append(agents, AgentInfo{
				Kind:  AgentClaude,
				Name:  "Claude Code",
				Path:  filepath.Join(userClaude, "settings.json"),
				Scope: "user",
			})
		}
	}

	// Codex detection (placeholder).
	codexJSON := filepath.Join(projectDir, "codex.json")
	codexDir := filepath.Join(projectDir, ".codex")
	if fileExists(codexJSON) || dirExists(codexDir) {
		agents = append(agents, AgentInfo{
			Kind:  AgentCodex,
			Name:  "Codex",
			Path:  "", // no config path yet
			Scope: "project",
		})
	}

	return agents
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
