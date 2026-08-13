package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Virgil methodology into a project (not yet implemented)",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(os.Stderr, "virgil install: not yet implemented")
		os.Exit(1)
		return nil // unreachable
	},
}
