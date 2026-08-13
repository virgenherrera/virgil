package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the Virgil MCP server (not yet implemented)",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(os.Stderr, "virgil serve: not yet implemented")
		os.Exit(1)
		return nil // unreachable
	},
}
