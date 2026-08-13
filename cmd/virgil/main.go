package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/entrypoint"
)

// Version is overridden via -ldflags at build time.
var Version = "dev"

var rootCmd = &cobra.Command{
	Use:   "virgil",
	Short: "Virgil — AI-assisted development methodology runtime",
	Long: `Virgil distributes and manages the Virgil methodology for
AI-assisted software development. It provides methodology docs,
orchestration protocols, and a runtime for planning operations.

When invoked with piped stdin (no subcommand), Virgil reads a JSON
envelope from stdin and writes the result to stdout. This preserves
backwards compatibility with the T0 test harness and any tooling
that invokes virgil as a subprocess.`,
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			// stdin is a pipe — run entrypoint for backwards compat
			os.Exit(entrypoint.Run(cmd.Context(), os.Stdin, os.Stdout, os.Stderr))
		}
		// interactive terminal — show help
		return cmd.Help()
	},
}

func init() {
	rootCmd.AddCommand(pipeCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(versionCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
