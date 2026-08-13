package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/virgenherrera/virgil/internal/install"
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Virgil MCP integration for AI agents in the current project",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("get working directory: %w", err)
		}
		return install.Run(cwd, os.Stdout)
	},
}
