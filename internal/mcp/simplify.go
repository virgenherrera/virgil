package mcp

import (
	"fmt"
	"strings"

	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

// SimpleResult is the agent-facing response from a Virgil operation.
// It distills the full wire.InvokeResult into the fields an MCP client
// needs to decide what to do next.
type SimpleResult struct {
	Status      string   `json:"status"` // success, blocked, error, unsupported, needs_input
	Operation   string   `json:"operation"`
	DerivedStep string   `json:"derived_step,omitempty"`
	Message     string   `json:"message"`             // human-readable summary
	Artifacts   []string `json:"artifacts,omitempty"` // list of created/modified file paths
	NextStep    string   `json:"next_step,omitempty"` // what to do next
	Error       string   `json:"error,omitempty"`
}

// SimplifyResult converts a full wire.InvokeResult into a SimpleResult
// for agent consumption.
func SimplifyResult(result wire.InvokeResult) SimpleResult {
	r := result.Result

	simple := SimpleResult{
		Status:      r.Status,
		Operation:   r.Operation,
		DerivedStep: r.DerivedStep,
	}

	// Collect artifact file paths from effects.
	for _, effect := range r.Effects {
		if effect.Kind == "write" && effect.Occurred && effect.Resource.URI != "" {
			simple.Artifacts = append(simple.Artifacts, effect.Resource.URI)
		}
	}

	// Build human-readable message from status and diagnostics.
	switch r.Status {
	case "success":
		simple.Message = formatSuccessMessage(r.Operation, r.DerivedStep)
	case "needs_input":
		simple.Message = "Operation needs additional input."
	case "blocked":
		simple.Message = "Operation blocked. Check the error field for details."
		simple.Error = extractDiagnosticConditions(r.Diagnostics)
	case "error":
		simple.Message = "Operation failed."
		simple.Error = extractDiagnosticConditions(r.Diagnostics)
	case "unsupported":
		simple.Message = fmt.Sprintf("Operation %s is not supported.", r.Operation)
		simple.Error = extractDiagnosticConditions(r.Diagnostics)
	default:
		simple.Message = fmt.Sprintf("Operation returned status: %s", r.Status)
	}

	// Next step from the result's Next action.
	if r.Next.Operation != "" && r.Next.Operation != "none" {
		simple.NextStep = fmt.Sprintf("%s: %s", r.Next.Operation, r.Next.Condition)
	} else if r.Next.Condition != "" {
		simple.NextStep = r.Next.Condition
	}

	return simple
}

func formatSuccessMessage(operation, derivedStep string) string {
	switch operation {
	case "virgil.init":
		return "Project initialized. Ready to write documents."
	case "virgil.write":
		return "Document written successfully."
	case "virgil.transition":
		return "Task status updated."
	default:
		return fmt.Sprintf("Operation %s completed.", operation)
	}
}

func extractDiagnosticConditions(diagnostics []protocol.Diagnostic) string {
	if len(diagnostics) == 0 {
		return ""
	}
	var conditions []string
	for _, d := range diagnostics {
		if d.Condition != "" {
			conditions = append(conditions, d.Condition)
		}
	}
	return strings.Join(conditions, "; ")
}
