package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

const Version = "virgil.dev/planning-slice1/v1alpha1"

type ResourceRef struct {
	URI      string `json:"uri"`
	Revision string `json:"revision,omitempty"`
	Digest   string `json:"digest,omitempty"`
}

type AdapterRef struct {
	AdapterID      string `json:"adapter_id"`
	AdapterVersion string `json:"adapter_version"`
}

type MethodPackRef struct {
	PackID      string `json:"pack_id"`
	PackVersion string `json:"pack_version"`
}

type DogmaRef struct {
	DogmaID    string        `json:"dogma_id"`
	Version    string        `json:"version"`
	Digest     string        `json:"digest"`
	Source     ResourceRef   `json:"source"`
	MethodPack MethodPackRef `json:"method_pack"`
}

type TargetRef struct {
	URI           string `json:"uri"`
	CanonicalPath string `json:"canonical_path,omitempty"`
	Baseline      string `json:"baseline"`
}

type ProjectRef struct {
	ProjectID          string    `json:"project_id"`
	Target             TargetRef `json:"target"`
	DogmaRefID         string    `json:"dogma_ref_id"`
	ArtifactStoreRefID string    `json:"artifact_store_ref_id"`
}

type StorePolicy struct {
	PolicyVersion  string   `json:"policy_version"`
	ReadAllowlist  []string `json:"read_allowlist"`
	WriteAllowlist []string `json:"write_allowlist"`
}

type ArtifactStoreRef struct {
	StoreRefID string        `json:"store_ref_id"`
	Adapter    AdapterRef    `json:"adapter"`
	ProjectID  string        `json:"project_id"`
	Namespace  string        `json:"namespace"`
	Policy     StorePolicy   `json:"policy"`
	Resources  []ResourceRef `json:"resources,omitempty"`
}

type Capabilities struct {
	Supported  []string `json:"supported"`
	Guarantees []string `json:"guarantees,omitempty"`
}

type HostRef struct {
	Adapter      AdapterRef   `json:"adapter"`
	Capabilities Capabilities `json:"capabilities"`
}

type RunRef struct {
	RunID     string `json:"run_id"`
	ChangeID  string `json:"change_id"`
	ProjectID string `json:"project_id"`
	Baseline  string `json:"baseline"`
}

type ActorRef struct {
	ActorID   string   `json:"actor_id"`
	Kind      string   `json:"kind"`
	Authority []string `json:"authority"`
}

type OperationRequest struct {
	ProtocolVersion  string           `json:"protocol_version"`
	Operation        string           `json:"operation"`
	RequestID        string           `json:"request_id"`
	IdempotencyKey   string           `json:"idempotency_key"`
	DogmaRef         DogmaRef         `json:"dogma_ref"`
	ProjectRef       ProjectRef       `json:"project_ref"`
	ArtifactStoreRef ArtifactStoreRef `json:"artifact_store_ref"`
	Host             HostRef          `json:"host"`
	RunRef           *RunRef          `json:"run_ref,omitempty"`
	Actor            ActorRef         `json:"actor"`
	Input            json.RawMessage  `json:"input"`
}

type Context struct {
	DogmaRef         DogmaRef         `json:"dogma_ref"`
	ProjectRef       ProjectRef       `json:"project_ref"`
	ArtifactStoreRef ArtifactStoreRef `json:"artifact_store_ref"`
	Host             HostRef          `json:"host"`
	RunRef           *RunRef          `json:"run_ref,omitempty"`
}

func ContextFromRequest(request OperationRequest) Context {
	return Context{
		DogmaRef:         request.DogmaRef,
		ProjectRef:       request.ProjectRef,
		ArtifactStoreRef: request.ArtifactStoreRef,
		Host:             request.Host,
		RunRef:           request.RunRef,
	}
}

type ObjectPointer struct {
	ObjectID string       `json:"object_id"`
	Kind     string       `json:"kind"`
	Revision string       `json:"revision,omitempty"`
	Resource *ResourceRef `json:"resource,omitempty"`
}

type Diagnostic struct {
	Code                string   `json:"code"`
	Severity            string   `json:"severity"`
	Scope               string   `json:"scope"`
	Condition           string   `json:"condition"`
	NextAction          string   `json:"next_action"`
	MissingCapabilities []string `json:"missing_capabilities,omitempty"`
}

type NextAction struct {
	Operation string `json:"operation"`
	Condition string `json:"condition"`
}

type OperationResult struct {
	ProtocolVersion     string            `json:"protocol_version"`
	Operation           string            `json:"operation"`
	RequestID           string            `json:"request_id"`
	IdempotencyKey      string            `json:"idempotency_key"`
	ReplayedFromRequest string            `json:"replayed_from_request_id,omitempty"`
	Status              string            `json:"status"`
	RequestedContext    Context           `json:"requested_context"`
	ResolvedContext     *Context          `json:"resolved_context,omitempty"`
	DerivedStep         string            `json:"derived_step,omitempty"`
	Artifacts           []ObjectPointer   `json:"artifacts"`
	Briefs              []ObjectPointer   `json:"briefs"`
	Events              []ObjectPointer   `json:"events"`
	Effects             []json.RawMessage `json:"effects"`
	Next                NextAction        `json:"next"`
	Diagnostics         []Diagnostic      `json:"diagnostics"`
}

type ScenarioFixture struct {
	SchemaVersion       string                  `json:"schema_version"`
	ProtocolVersion     string                  `json:"protocol_version"`
	FixtureID           string                  `json:"fixture_id"`
	FixtureRevision     string                  `json:"fixture_revision"`
	Layer               string                  `json:"layer"`
	TargetRepo          TargetRef               `json:"target_repo"`
	InitialRequest      OperationRequest        `json:"initial_request"`
	ActorProfile        ActorProfile            `json:"actor_profile"`
	AdapterProfile      AdapterProfile          `json:"adapter_profile"`
	RuntimeCapabilities HostRef                 `json:"runtime_capabilities"`
	ExpectedInteraction ExpectedInteraction     `json:"expected_interaction"`
	ExpectedEvents      []ObjectExpectation     `json:"expected_events"`
	ExpectedArtifacts   []ObjectExpectation     `json:"expected_artifacts"`
	ExpectedEffects     []ObjectExpectation     `json:"expected_effects"`
	ExpectedTargetDiff  json.RawMessage         `json:"expected_target_diff"`
	ExpectedCheckpoints []CheckpointExpectation `json:"expected_checkpoints,omitempty"`
	ProhibitedEffects   json.RawMessage         `json:"prohibited_effects"`
	ContextBudget       json.RawMessage         `json:"context_budget"`
	ExpectedOutcome     json.RawMessage         `json:"expected_outcome"`
}

type ActorProfile struct {
	Mode      string           `json:"mode"`
	Component ComponentProfile `json:"component"`
	Script    ResourceRef      `json:"script"`
}

type ComponentProfile struct {
	Adapter      AdapterRef `json:"adapter"`
	Capabilities []string   `json:"capabilities"`
	ConfigDigest string     `json:"config_digest,omitempty"`
}

type AdapterProfile struct {
	Host          HostRef          `json:"host"`
	ArtifactStore ArtifactStoreRef `json:"artifact_store"`
	Isolation     ComponentProfile `json:"isolation"`
	ModelProvider ComponentProfile `json:"model_provider"`
}

type ExpectedInteraction struct {
	RequiredSteps    []InteractionStep `json:"required_steps"`
	OrderConstraints []OrderConstraint `json:"order_constraints"`
	MaxRetries       int               `json:"max_retries"`
}

type InteractionStep struct {
	StepID                string `json:"step_id"`
	Kind                  string `json:"kind"`
	Operation             string `json:"operation,omitempty"`
	DiagnosticCode        string `json:"diagnostic_code,omitempty"`
	RequestID             string `json:"request_id,omitempty"`
	OperationStatus       string `json:"operation_status,omitempty"`
	NextOperation         string `json:"next_operation,omitempty"`
	ReplayedFromRequestID string `json:"replayed_from_request_id,omitempty"`
	ProcessID             string `json:"process_id,omitempty"`
	EffectKind            string `json:"effect_kind,omitempty"`
	PolicyDecision        string `json:"policy_decision,omitempty"`
	Occurred              *bool  `json:"occurred,omitempty"`
	ResourcePattern       string `json:"resource_pattern,omitempty"`
}

type OrderConstraint struct {
	Before string `json:"before"`
	After  string `json:"after"`
}

type ObjectExpectation struct {
	Kind           string         `json:"kind"`
	MinCount       int            `json:"min_count"`
	MaxCount       int            `json:"max_count"`
	RequiredFields []string       `json:"required_fields,omitempty"`
	FieldEquals    map[string]any `json:"field_equals,omitempty"`
}

type CheckpointExpectation struct {
	CheckpointID      string              `json:"checkpoint_id"`
	AfterStep         string              `json:"after_step"`
	RelativeTo        string              `json:"relative_to"`
	TargetDiff        json.RawMessage     `json:"target_diff"`
	StoreDiff         json.RawMessage     `json:"store_diff"`
	ExpectedEvents    []ObjectExpectation `json:"expected_events"`
	ExpectedArtifacts []ObjectExpectation `json:"expected_artifacts"`
}

type ActorScript struct {
	SchemaVersion   string        `json:"schema_version"`
	ProtocolVersion string        `json:"protocol_version"`
	ScriptID        string        `json:"script_id"`
	ScriptRevision  string        `json:"script_revision"`
	Actor           ActorRef      `json:"actor"`
	Actions         []ActorAction `json:"actions"`
}

type ActorAction struct {
	ActionID         string          `json:"action_id"`
	Sequence         int             `json:"sequence"`
	Kind             string          `json:"kind"`
	ProcessID        string          `json:"process_id"`
	RetriesActionID  string          `json:"retries_action_id,omitempty"`
	AfterTraceKind   string          `json:"after_trace_kind,omitempty"`
	OperationRequest json.RawMessage `json:"operation_request,omitempty"`
	EffectAttempt    json.RawMessage `json:"effect_attempt,omitempty"`
	Reason           string          `json:"reason,omitempty"`
}

func DecodeOperationRequest(raw []byte) (OperationRequest, error) {
	var request OperationRequest
	if err := decodeStrict(raw, &request); err != nil {
		return OperationRequest{}, fmt.Errorf("decode operation request: %w", err)
	}
	return request, nil
}

func DecodeScenarioFixture(raw []byte) (ScenarioFixture, error) {
	var fixture ScenarioFixture
	if err := decodeStrict(raw, &fixture); err != nil {
		return ScenarioFixture{}, fmt.Errorf("decode scenario fixture: %w", err)
	}
	return fixture, nil
}

func DecodeActorScript(raw []byte) (ActorScript, error) {
	var script ActorScript
	if err := decodeStrict(raw, &script); err != nil {
		return ActorScript{}, fmt.Errorf("decode actor script: %w", err)
	}
	return script, nil
}

func decodeStrict(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := ensureEOF(decoder); err != nil {
		return err
	}
	return nil
}

func ensureEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}
