package entrypoint

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/virgenherrera/virgil/internal/contracts"
	runtimeimpl "github.com/virgenherrera/virgil/internal/runtime"
	"github.com/virgenherrera/virgil/internal/t0"
	"github.com/virgenherrera/virgil/internal/wire"
)

func Run(ctx context.Context, stdin io.Reader, stdout, stderr io.Writer) int {
	envelope, err := wire.DecodeEnvelope(stdin)
	if err != nil {
		return writeError(stdout, stderr, "INVALID_ENVELOPE", "request envelope rejected")
	}
	registry, err := contracts.NewRegistry()
	if err != nil {
		return writeError(stdout, stderr, "BUNDLED_CONTRACTS_UNAVAILABLE", "bundled contracts unavailable")
	}

	switch request := envelope.(type) {
	case wire.InvokeEnvelope:
		result, err := runtimeimpl.Invoke(registry, request)
		if err != nil {
			return writeError(stdout, stderr, "INVOKE_REJECTED", "invoke request rejected")
		}
		if err := writeJSON(stdout, result); err != nil {
			_, _ = fmt.Fprintln(stderr, "virgil: WRITE_RESPONSE_FAILED")
			return 1
		}
		return 0
	case wire.RunT0Envelope:
		result := t0.NewRunner(registry).Run(ctx, request)
		if err := writeJSON(stdout, result); err != nil {
			_, _ = fmt.Fprintln(stderr, "virgil: WRITE_RESPONSE_FAILED")
			return 1
		}
		return 0
	default:
		return writeError(stdout, stderr, "INVALID_ENVELOPE", "request envelope rejected")
	}
}

func writeError(stdout, stderr io.Writer, code, message string) int {
	_, _ = fmt.Fprintf(stderr, "virgil: %s\n", code)
	_ = writeJSON(stdout, wire.ErrorResult{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "error",
		Code:            code,
		Message:         message,
	})
	return 2
}

func writeJSON(writer io.Writer, value any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(value)
}
