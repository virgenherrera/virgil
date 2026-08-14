package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/agents"
	"github.com/virgenherrera/virgil/internal/pipeline"
	"github.com/virgenherrera/virgil/internal/state"
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Re-apply Virgil skills and system prompt to already-installed agents",
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

	for _, id := range st.InstalledAgents {
		adapter, ok := registry.Get(agents.AgentID(id))
		if !ok {
			fmt.Fprintf(out, "  [!!] unknown agent %q in state, skipping\n", id)
			continue
		}

		fmt.Fprintf(out, "Syncing Virgil for %s...\n", adapter.Name())

		result := pipeline.Run(syncSteps(adapter, homeDir))
		reportResult(out, adapter.Name(), result)
		if !result.Success() {
			return fmt.Errorf("sync %s: %w", adapter.Name(), result.Error)
		}
	}

	st.LastSync = time.Now().UTC().Format(time.RFC3339)
	if err := state.Save(homeDir, st); err != nil {
		return fmt.Errorf("save state: %w", err)
	}

	fmt.Fprintln(out, "Virgil sync complete.")
	return nil
}
