package main

import (
	"context"
	"os"

	"github.com/virgenherrera/virgil/internal/entrypoint"
)

func main() {
	os.Exit(entrypoint.Run(context.Background(), os.Stdin, os.Stdout, os.Stderr))
}
