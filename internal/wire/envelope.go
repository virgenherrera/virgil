package wire

import (
	"encoding/json"

	"github.com/virgenherrera/virgil/internal/protocol"
)

const RuntimeProtocol = "virgil.dev/runtime/v1alpha1"

type Envelope interface {
	envelopeKind() string
}

type Clock struct {
	Now string `json:"now"`
}

type TargetBinding struct {
	URI  string `json:"uri"`
	Root string `json:"root"`
}

type ResourceBinding struct {
	URI     string `json:"uri"`
	Digest  string `json:"digest,omitempty"`
	Content string `json:"content"`
}

type Bindings struct {
	Target    TargetBinding     `json:"target"`
	Resources []ResourceBinding `json:"resources"`
}

type InvokeEnvelope struct {
	RuntimeProtocol string          `json:"runtime_protocol"`
	Kind            string          `json:"kind"`
	ProcessID       string          `json:"process_id"`
	Request         json.RawMessage `json:"request"`
	Bindings        Bindings        `json:"bindings"`
	Clock           Clock           `json:"clock"`
}

func (InvokeEnvelope) envelopeKind() string { return "invoke" }

type RunLimits struct {
	ProcessTimeoutMilliseconds int64 `json:"process_timeout_ms,omitempty"`
	MaxOutputBytes             int64 `json:"max_output_bytes,omitempty"`
}

type RunT0Envelope struct {
	RuntimeProtocol string    `json:"runtime_protocol"`
	Kind            string    `json:"kind"`
	FixtureIDs      []string  `json:"fixture_ids"`
	WorkspaceRoot   string    `json:"workspace_root"`
	EvidenceRoot    string    `json:"evidence_root"`
	Clock           Clock     `json:"clock"`
	Limits          RunLimits `json:"limits"`
}

func (RunT0Envelope) envelopeKind() string { return "run_t0" }

type InvokeResult struct {
	RuntimeProtocol string                   `json:"runtime_protocol"`
	Kind            string                   `json:"kind"`
	ProcessID       string                   `json:"process_id"`
	OSPID           int                      `json:"os_pid"`
	Result          protocol.OperationResult `json:"result"`
	Observations    []Observation            `json:"observations"`
}

type Observation struct {
	Kind    string `json:"kind"`
	Summary string `json:"summary"`
}

type RunT0Result struct {
	RuntimeProtocol string           `json:"runtime_protocol"`
	Kind            string           `json:"kind"`
	Outcome         string           `json:"outcome"`
	Scenarios       []ScenarioResult `json:"scenarios"`
}

type ScenarioResult struct {
	FixtureID string               `json:"fixture_id"`
	Outcome   string               `json:"outcome"`
	Processes []ProcessObservation `json:"processes"`
	Checks    []CheckResult        `json:"checks"`
	Failure   *Failure             `json:"failure,omitempty"`
	Evidence  *EvidenceReference   `json:"evidence,omitempty"`
}

type ProcessObservation struct {
	ProcessID string `json:"process_id"`
	OSPID     int    `json:"os_pid"`
	ExitCode  int    `json:"exit_code"`
}

type CheckResult struct {
	CheckID string `json:"check_id"`
	Status  string `json:"status"`
	Detail  string `json:"detail"`
}

type Failure struct {
	Class   string `json:"class"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type EvidenceReference struct {
	URI    string `json:"uri"`
	Digest string `json:"digest"`
}

type ErrorResult struct {
	RuntimeProtocol string `json:"runtime_protocol"`
	Kind            string `json:"kind"`
	Code            string `json:"code"`
	Message         string `json:"message"`
}
