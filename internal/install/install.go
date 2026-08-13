package install

import (
	"fmt"
	"io"
)

// Run detects agents in projectDir and installs Virgil for each.
// Progress messages are written to out.
func Run(projectDir string, out io.Writer) error {
	fmt.Fprintln(out, "Detecting AI agents...")

	agents := DetectAgents(projectDir)
	if len(agents) == 0 {
		fmt.Fprintln(out, "  No AI agents detected.")
		fmt.Fprintln(out, "  Create a .claude/ directory or install Claude Code, then try again.")
		return nil
	}

	// Report detected agents.
	var installable []AgentInfo
	for _, a := range agents {
		switch a.Kind {
		case AgentClaude:
			fmt.Fprintf(out, "  [ok] %s detected (%s-level: %s)\n", a.Name, a.Scope, a.Path)
			installable = append(installable, a)
		case AgentCodex:
			fmt.Fprintf(out, "  [--] %s detected (MCP integration not yet supported)\n", a.Name)
		}
	}

	if len(installable) == 0 {
		return nil
	}

	// Install for each supported agent.
	fmt.Fprintln(out, "Installing Virgil MCP server...")
	var installed []string
	for _, a := range installable {
		switch a.Kind {
		case AgentClaude:
			if err := InstallClaude(a.Path); err != nil {
				fmt.Fprintf(out, "  [!!] %s: %v\n", a.Name, err)
				return fmt.Errorf("install %s: %w", a.Name, err)
			}
			fmt.Fprintf(out, "  [ok] %s: MCP server configured\n", a.Name)
			installed = append(installed, fmt.Sprintf("%s (%s-level)", a.Name, a.Scope))
		}
	}

	if len(installed) > 0 {
		fmt.Fprintln(out, "Virgil installed successfully. Restart your AI agent to activate.")
	}
	return nil
}
