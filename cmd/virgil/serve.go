package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/mcp"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the Virgil MCP server on stdio",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("get working directory: %w", err)
		}
		server := mcp.NewServer(cwd, Version)
		return server.Run(cmd.Context(), os.Stdin, os.Stdout, os.Stderr)
	},
}
