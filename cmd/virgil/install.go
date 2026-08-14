package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/agents"
	"github.com/virgenherrera/virgil/internal/agents/claude"
	"github.com/virgenherrera/virgil/internal/agents/codex"
	"github.com/virgenherrera/virgil/internal/pipeline"
	"github.com/virgenherrera/virgil/internal/skills"
	"github.com/virgenherrera/virgil/internal/state"
)

// mcpServerName is the key Virgil registers itself under in each agent's
// MCP server configuration.
const mcpServerName = "virgil"

// virgilSystemPrompt is injected into each supported agent's system prompt
// so it knows how to reach Virgil's MCP tools.
var virgilSystemPrompt = []byte(`## Virgil Methodology

This project uses Virgil for AI-assisted development planning. Use the virgil MCP tools
to navigate the methodology:

- ` + "`/virgil-init`" + ` — Initialize a Virgil project
- ` + "`/virgil-new`" + ` — Start a new planning change
- ` + "`/virgil-propose`" + ` — Submit an artifact proposal
- ` + "`/virgil-approve`" + ` — Approve and advance the pipeline
- ` + "`/virgil-status`" + ` — Check current project state

Call ` + "`virgil_status`" + ` first to check if the project is already initialized.
`)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Virgil MCP integration for detected AI agents",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runInstall(cmd.OutOrStdout())
	},
}

// runInstall discovers installed AI agents on the current machine and wires
// Virgil into each of them: MCP server registration, embedded skills, and
// system prompt injection. It persists the outcome to ~/.virgil/state.json
// so `virgil sync` can re-apply embedded assets later without repeating
// detection.
func runInstall(out io.Writer) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home directory: %w", err)
	}

	registry, err := newRegistry()
	if err != nil {
		return fmt.Errorf("build agent registry: %w", err)
	}

	discovered := registry.DiscoverInstalled(homeDir)
	if len(discovered) == 0 {
		fmt.Fprintln(out, "No supported AI agents detected.")
		fmt.Fprintln(out, "Install Claude Code or Codex, then run `virgil install` again.")
		return nil
	}

	var installedAgents []string
	for _, adapter := range discovered {
		fmt.Fprintf(out, "Installing Virgil for %s...\n", adapter.Name())

		result := pipeline.Run(installSteps(adapter, homeDir))
		reportResult(out, adapter.Name(), result)
		if !result.Success() {
			return fmt.Errorf("install %s: %w", adapter.Name(), result.Error)
		}

		installedAgents = append(installedAgents, string(adapter.Agent()))
	}

	st, err := state.Load(homeDir)
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}
	st.Version = Version
	st.InstalledAgents = mergeUnique(st.InstalledAgents, installedAgents)
	st.LastSync = time.Now().UTC().Format(time.RFC3339)
	if err := state.Save(homeDir, st); err != nil {
		return fmt.Errorf("save state: %w", err)
	}

	fmt.Fprintln(out, "Virgil installed successfully. Restart your AI agent to activate.")
	return nil
}

// reportResult prints one line per applied step, or the failure and any
// rollback errors when the pipeline did not succeed.
func reportResult(out io.Writer, agentName string, result pipeline.Result) {
	for _, applied := range result.Applied {
		fmt.Fprintf(out, "  [ok] %s: %s\n", agentName, applied)
	}
	if result.Success() {
		return
	}
	fmt.Fprintf(out, "  [!!] %s: %v\n", agentName, result.Error)
	for _, rbErr := range result.RollbackErrors {
		fmt.Fprintf(out, "  [!!] %s: %v\n", agentName, rbErr)
	}
}

// newRegistry builds the default agent registry with every known adapter
// registered.
func newRegistry() (*agents.Registry, error) {
	return agents.NewRegistry(claude.NewAdapter(), codex.New())
}

// virgilMCPConfig returns the MCP server configuration Virgil registers with
// each agent. It resolves "virgil" to an absolute path via exec.LookPath as
// defense-in-depth: an adapter's own WriteMCPConfig also resolves bare
// command names, but supplying an absolute path here keeps the written
// config correct even if that per-adapter resolution step is ever skipped.
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

// installSteps builds the full install pipeline for adapter: MCP config
// registration followed by the same skills + system prompt steps `virgil
// sync` re-runs later.
func installSteps(adapter agents.Adapter, homeDir string) []pipeline.Step {
	var steps []pipeline.Step

	if adapter.SupportsMCP() {
		steps = append(steps, mcpConfigStep(adapter, homeDir))
	}
	steps = append(steps, syncSteps(adapter, homeDir)...)

	return steps
}

// syncSteps builds the pipeline steps that (re-)apply embedded assets --
// skills and system prompt -- without touching MCP configuration. Shared by
// `virgil install` (as part of the full pipeline) and `virgil sync` (on its
// own, since MCP registration does not need to change on sync).
func syncSteps(adapter agents.Adapter, homeDir string) []pipeline.Step {
	var steps []pipeline.Step

	if adapter.SupportsSkills() {
		steps = append(steps, skillsStep(adapter, homeDir))
	}
	if adapter.SupportsSystemPrompt() {
		steps = append(steps, systemPromptStep(adapter, homeDir))
	}

	return steps
}

func mcpConfigStep(adapter agents.Adapter, homeDir string) pipeline.Step {
	settingsPath := adapter.SettingsPath(homeDir)
	return pipeline.Step{
		Name: "write-mcp-config",
		Prepare: func() error {
			return ensureAccessibleDir(filepath.Dir(settingsPath))
		},
		Apply: func() error {
			return adapter.WriteMCPConfig(settingsPath, mcpServerName, virgilMCPConfig())
		},
		Rollback: func() error {
			// Best-effort: MCP config is merged into a shared settings
			// file, so precisely unwinding it risks discarding unrelated
			// user edits made between Apply and rollback. Warn instead of
			// attempting a blind revert.
			fmt.Fprintf(os.Stderr, "warning: could not automatically roll back MCP config at %s; please review it manually\n", settingsPath)
			return nil
		},
	}
}

func skillsStep(adapter agents.Adapter, homeDir string) pipeline.Step {
	skillsDir := adapter.SkillsDir(homeDir)
	return pipeline.Step{
		Name: "write-skills",
		Prepare: func() error {
			return ensureAccessibleDir(skillsDir)
		},
		Apply: func() error {
			entries, err := skills.List()
			if err != nil {
				return fmt.Errorf("list embedded skills: %w", err)
			}
			for _, entry := range entries {
				content, err := skills.Get(entry.ID)
				if err != nil {
					return fmt.Errorf("get skill %q: %w", entry.ID, err)
				}
				if err := adapter.WriteSkill(skillsDir, entry.ID, content); err != nil {
					return fmt.Errorf("write skill %q: %w", entry.ID, err)
				}
			}
			return nil
		},
		Rollback: func() error {
			fmt.Fprintf(os.Stderr, "warning: could not automatically roll back skills written to %s; please remove manually if needed\n", skillsDir)
			return nil
		},
	}
}

func systemPromptStep(adapter agents.Adapter, homeDir string) pipeline.Step {
	promptPath := adapter.SystemPromptPath(homeDir)
	return pipeline.Step{
		Name: "inject-system-prompt",
		Prepare: func() error {
			return ensureAccessibleDir(filepath.Dir(promptPath))
		},
		Apply: func() error {
			return adapter.InjectSystemPrompt(promptPath, "methodology", virgilSystemPrompt)
		},
		Rollback: func() error {
			fmt.Fprintf(os.Stderr, "warning: could not automatically roll back system prompt at %s; please review it manually\n", promptPath)
			return nil
		},
	}
}

// ensureAccessibleDir verifies path is usable as a target directory: either
// it already exists as a directory, or it does not exist yet (in which case
// each step's own Apply creates it via MkdirAll). It fails fast when path
// exists but is a regular file, or when it cannot be stat'd for a reason
// other than non-existence (e.g. a permission error on a parent directory).
func ensureAccessibleDir(path string) error {
	info, err := os.Stat(path)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("%s exists and is not a directory", path)
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("stat %s: %w", path, err)
	}
	return nil
}

// mergeUnique returns the union of existing and added, preserving first
// occurrence order and dropping duplicates. Used to fold newly installed
// agent IDs into state without clobbering agents installed in a prior run.
func mergeUnique(existing, added []string) []string {
	seen := make(map[string]bool, len(existing)+len(added))
	merged := make([]string, 0, len(existing)+len(added))
	for _, id := range existing {
		if !seen[id] {
			seen[id] = true
			merged = append(merged, id)
		}
	}
	for _, id := range added {
		if !seen[id] {
			seen[id] = true
			merged = append(merged, id)
		}
	}
	return merged
}
