package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/agents"
	"github.com/virgenherrera/virgil/internal/pipeline"
	"github.com/virgenherrera/virgil/internal/skills"
	"github.com/virgenherrera/virgil/internal/state"
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Re-apply Virgil skills, commands, and system prompt to installed agents",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runSync(cmd.OutOrStdout())
	},
}

// runSync re-applies embedded assets (skills, system prompt) to every agent
// recorded in ~/.virgil/state.json, without re-running agent detection or
// touching MCP configuration. Use `virgil install` instead when a new agent
// needs to be discovered or MCP registration is out of date.
func runSync(out io.Writer) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home directory: %w", err)
	}

	st, err := state.Load(homeDir)
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}
	if len(st.InstalledAgents) == 0 {
		fmt.Fprintln(out, "No installed agents found. Run `virgil install` first.")
		return nil
	}

	registry, err := newRegistry()
	if err != nil {
		return fmt.Errorf("build agent registry: %w", err)
	}

	if st.Manifest == nil {
		st.Manifest = make(map[string]state.AgentManifest)
	}

	for _, id := range st.InstalledAgents {
		adapter, ok := registry.Get(agents.AgentID(id))
		if !ok {
			fmt.Fprintf(out, "  [!!] unknown agent %q in state, skipping\n", id)
			continue
		}

		if manifest, ok := st.Manifest[id]; ok {
			cleanOrphaned(out, adapter, homeDir, manifest)
		}

		fmt.Fprintf(out, "Syncing Virgil for %s...\n", adapter.Name())

		result := pipeline.Run(syncSteps(adapter, homeDir))
		reportResult(out, adapter.Name(), result)
		if !result.Success() {
			return fmt.Errorf("sync %s: %w", adapter.Name(), result.Error)
		}

		st.Manifest[id] = buildManifest(adapter, homeDir)
	}

	st.LastSync = time.Now().UTC().Format(time.RFC3339)
	if err := state.Save(homeDir, st); err != nil {
		return fmt.Errorf("save state: %w", err)
	}

	fmt.Fprintln(out, "Virgil sync complete.")
	return nil
}

// cleanOrphaned removes skill and command entries recorded in manifest (from
// a prior install or sync) that the currently embedded set no longer ships
// -- e.g. a skill renamed between versions. Best-effort: failures are logged
// as warnings, not fatal, since sync should still proceed to re-apply the
// current set even if a stale directory can't be removed.
func cleanOrphaned(out io.Writer, adapter agents.Adapter, homeDir string, manifest state.AgentManifest) {
	currentSkills, err := skills.List()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not list embedded skills for orphan cleanup: %v\n", err)
		return
	}
	keepSkills := make(map[string]bool, len(currentSkills))
	for _, entry := range currentSkills {
		keepSkills[entry.ID] = true
	}
	keepCommands := make(map[string]bool, len(commandIDs))
	for _, id := range commandIDs {
		keepCommands[id] = true
	}

	skillsDir := adapter.SkillsDir(homeDir)
	removedSkills := 0
	for _, id := range manifest.Skills {
		if keepSkills[id] {
			continue
		}
		if err := os.RemoveAll(filepath.Join(skillsDir, id)); err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not remove orphaned skill %q for %s: %v\n", id, adapter.Name(), err)
			continue
		}
		removedSkills++
	}

	commandsDir := adapter.CommandsDir(homeDir)
	removedCommands := 0
	for _, id := range manifest.Commands {
		if keepCommands[id] {
			continue
		}
		if err := removeCommandArtifact(commandsDir, id); err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not remove orphaned command %q for %s: %v\n", id, adapter.Name(), err)
			continue
		}
		removedCommands++
	}

	if removedSkills > 0 || removedCommands > 0 {
		fmt.Fprintf(out, "  [ok] Removed orphaned assets for %s: %d skills, %d commands\n", adapter.Name(), removedSkills, removedCommands)
	}
}
