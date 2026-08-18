package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Version is overridden via -ldflags at build time.
var Version = "dev"

var rootCmd = &cobra.Command{
	Use:   "virgil",
	Short: "Virgil — AI-assisted development methodology runtime",
	Long: `Virgil distributes and manages the Virgil methodology for
AI-assisted software development. It provides methodology docs,
orchestration protocols, and a runtime for planning operations.

Use the "pipe" subcommand to read a JSON envelope from stdin and
write the result to stdout.`,
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

func init() {
	rootCmd.AddCommand(pipeCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(doctorCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
