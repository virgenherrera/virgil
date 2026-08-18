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

// planningCompleteNotice is appended to success messages from virgil_write
// and virgil_transition when the operation leaves ALL project tasks at
// status "refined". It reinforces the planning boundary: Virgil manages
// planning only, and implementation requires explicit human authorization.
const planningCompleteNotice = "Planning complete. Implementation requires explicit human authorization."

// SimplifyResult converts a full wire.InvokeResult into a SimpleResult
// for agent consumption. planningComplete should reflect the project's
// task state AFTER the operation (i.e. computed from refreshed state) --
// when true, a planning-complete notice is appended to success messages.
func SimplifyResult(result wire.InvokeResult, planningComplete bool) SimpleResult {
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
		simple.Message = formatSuccessMessage(r.Operation, r.DerivedStep, planningComplete)
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

func formatSuccessMessage(operation, derivedStep string, planningComplete bool) string {
	var msg string
	switch operation {
	case "virgil.init":
		msg = "Project initialized. Ready to write documents."
	case "virgil.write":
		msg = "Document written successfully."
	case "virgil.transition":
		msg = "Task status updated."
	default:
		msg = fmt.Sprintf("Operation %s completed.", operation)
	}

	// Only virgil.write and virgil.transition can leave the task set at
	// "all refined" as a direct result of the call, but the check is
	// operation-agnostic: it fires whenever the caller reports the
	// post-operation state as planning-complete.
	if planningComplete {
		msg = msg + "\n" + planningCompleteNotice
	}
	return msg
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
