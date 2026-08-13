package main

import (
	"os"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/entrypoint"
)

var pipeCmd = &cobra.Command{
	Use:   "pipe",
	Short: "Read a JSON envelope from stdin and write the result to stdout",
	Long: `Explicit pipe mode — reads a JSON operation envelope from stdin,
executes it, and writes the JSON result to stdout. This is the same
behavior as invoking virgil with no subcommand when stdin is piped.

Example:
  echo '{"kind":"invoke",...}' | virgil pipe`,
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		os.Exit(entrypoint.Run(cmd.Context(), os.Stdin, os.Stdout, os.Stderr))
		return nil // unreachable
	},
}
