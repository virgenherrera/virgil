package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

const Version = "virgil.dev/planning-slice1/v1alpha1"

// VirgilConfigFile is the repo-docs adapter control file published at the
// target root by virgil.init. It is not part of managed_root: it is the
// adapter's own bootstrap state, analogous to .git/config.
const VirgilConfigFile = "virgil.json"

// artifactFileNames is the fixed, numbered filename for each Slice 1
// artifact_kind, published under managed_root's per-change subdirectory
// ("docs/{change_id}/"). The numbering encodes the pipeline order so a plain
// directory listing shows the change's progress without reading any file.
var artifactFileNames = map[string]string{
	"idea":    "00-idea.md",
	"spec":    "01-spec.md",
	"design":  "02-design.md",
	"tasks":   "03-tasks.md",
	"handoff": "04-handoff.md",
}

// artifactDirNames is the fixed, numbered directory name for each Slice 1
// artifact_kind, published under managed_root's per-change subdirectory
// ("docs/{change_id}/"). Each artifact's file lives inside its own directory
// so a stage can later accumulate more than one file (diagrams, schemas,
// supplementary docs) alongside the canonical artifact file.
var artifactDirNames = map[string]string{
	"idea":    "00-idea",
	"spec":    "01-spec",
	"design":  "02-design",
	"tasks":   "03-tasks",
	"handoff": "04-handoff",
}

// ArtifactStepOrder is the fixed Slice 1 artifact sequence shared by the
// repo-docs adapter and every T0 oracle that observes its durable output.
var ArtifactStepOrder = []string{"idea", "spec", "design", "tasks", "handoff"}

// ArtifactFileName returns the fixed docs/-relative filename for kind, or ""
// if kind is not a recognized Slice 1 artifact_kind.
func ArtifactFileName(kind string) string {
	return artifactFileNames[kind]
}

// ArtifactDirName returns the fixed docs/-relative directory name for kind,
// or "" if kind is not a recognized Slice 1 artifact_kind.
func ArtifactDirName(kind string) string {
	return artifactDirNames[kind]
}

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

type SourceProvenance struct {
	Kind       string       `json:"kind"`
	CapturedAt string       `json:"captured_at"`
	Source     *ResourceRef `json:"source,omitempty"`
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

// ContinueInput is the typed payload for virgil.continue.
type ContinueInput struct {
	ChangeID string     `json:"change_id"`
	Entry    EntryUnion `json:"entry"`
}

// EntryUnion discriminates on Kind: content_proposal | approval | answer | recovery_request.
type EntryUnion struct {
	Kind string `json:"kind"`
	// Content proposal fields.
	ArtifactKind string       `json:"artifact_kind,omitempty"`
	Content      *ResourceRef `json:"content,omitempty"`
	// Approval fields.
	ArtifactID string `json:"artifact_id,omitempty"`
	Revision   string `json:"revision,omitempty"`
	Decision   string `json:"decision,omitempty"`
	Rationale  string `json:"rationale,omitempty"`
	// Answer fields.
	Answer string `json:"answer,omitempty"`
	// Recovery fields.
	Reason string `json:"reason,omitempty"`
}

// UpstreamRef points to the revision of an upstream artifact kind a revision was built on.
type UpstreamRef struct {
	RevisionID   string `json:"revision_id"`
	ArtifactKind string `json:"artifact_kind"`
}

// IdempotencyRecord binds a caller's stable intent key to the canonical
// request projection and the first request that published it. It is embedded
// both in VirgilConfig (for virgil.init) and in ActiveChange (for
// virgil.new), and is intentionally the same shape as the durable idempotency
// authority repo-docs used to keep in project.json/change.json.
type IdempotencyRecord struct {
	Key               string `json:"key"`
	RequestDigest     string `json:"request_digest"`
	OriginalRequestID string `json:"original_request_id"`
}

// ActiveChange is the single change repo-docs tracks per project, published
// under VirgilConfig.ActiveChange. Its artifacts live under their own
// docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md subdirectory; there is still only one
// active change per project, so git history — not a second active_change
// slot — is where prior changes live once superseded.
type ActiveChange struct {
	ChangeID        string            `json:"change_id"`
	Intention       string            `json:"intention"`
	RunID           string            `json:"run_id"`
	CreatedAt       string            `json:"created_at"`
	Provenance      SourceProvenance  `json:"provenance"`
	Idempotency     IdempotencyRecord `json:"idempotency"`
	OriginalRequest OperationRequest  `json:"original_request"`
	ResolvedContext Context           `json:"resolved_context"`
}

// VirgilConfig is the durable authority published as virgil.json at the
// target root by virgil.init, and updated in place by virgil.new to carry
// ActiveChange. It replaces project.json, events.jsonl and change.json: git
// is the ledger, so repo-docs keeps exactly one control file plus the
// artifact files themselves.
type VirgilConfig struct {
	SchemaVersion   string            `json:"schema_version"`
	ProtocolVersion string            `json:"protocol_version"`
	ProjectID       string            `json:"project_id"`
	DogmaRef        DogmaRef          `json:"dogma_ref"`
	Adapter         AdapterRef        `json:"adapter"`
	ManagedRoot     string            `json:"managed_root"`
	CreatedAt       string            `json:"created_at"`
	CreatedBy       ActorRef          `json:"created_by"`
	Idempotency     IdempotencyRecord `json:"idempotency"`
	OriginalRequest OperationRequest  `json:"original_request"`
	ResolvedContext Context           `json:"resolved_context"`
	ActiveChange    *ActiveChange     `json:"active_change,omitempty"`
}

// ArtifactFrontmatter is the JSON frontmatter embedded between the leading
// "---json" / "---" markers of every docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md file.
// It replaces the Slice 1 RevisionEnvelope: there is no separate
// envelope.json, and there is no revision_lifecycle_event log, because the
// file itself — rewritten in place through drafts, withdrawals and approval
// — is the durable authority.
type ArtifactFrontmatter struct {
	Schema          string           `json:"schema"`
	ProtocolVersion string           `json:"protocol_version"`
	ArtifactKind    string           `json:"artifact_kind"`
	ChangeID        string           `json:"change_id"`
	ProjectID       string           `json:"project_id"`
	Status          string           `json:"status"`
	Revision        string           `json:"revision"`
	UpstreamRefs    []UpstreamRef    `json:"upstream_refs"`
	ContentDigest   string           `json:"content_digest"`
	IdempotencyKey  string           `json:"idempotency_key"`
	RequestID       string           `json:"request_id"`
	CreatedAt       string           `json:"created_at"`
	Provenance      SourceProvenance `json:"provenance"`
	ApprovedBy      *ActorRef        `json:"approved_by,omitempty"`
	ApprovedAt      string           `json:"approved_at,omitempty"`
}

// ContextBrief is compiled context for a specific step, stored at
// briefs/{brief_id}.json.
type ContextBrief struct {
	SchemaVersion    string           `json:"schema_version"`
	ProtocolVersion  string           `json:"protocol_version"`
	BriefID          string           `json:"brief_id"`
	ChangeID         string           `json:"change_id"`
	ProjectID        string           `json:"project_id"`
	ArtifactKind     string           `json:"artifact_kind"`
	Objective        string           `json:"objective"`
	Sources          []BriefSource    `json:"sources"`
	ExcludedSources  []ExcludedSource `json:"excluded_sources"`
	Budget           BriefBudget      `json:"budget"`
	BaselineRevision string           `json:"baseline_revision,omitempty"`
	CreatedAt        string           `json:"created_at"`
}

// BriefSource is a source consulted when compiling a ContextBrief.
type BriefSource struct {
	URI        string           `json:"uri"`
	Provenance SourceProvenance `json:"provenance"`
	Digest     string           `json:"digest"`
}

// ExcludedSource is a source deliberately excluded from a ContextBrief.
type ExcludedSource struct {
	URI    string `json:"uri"`
	Reason string `json:"reason"`
}

// BriefBudget tracks the token budget of a ContextBrief.
type BriefBudget struct {
	MaxTokens  int `json:"max_tokens"`
	UsedTokens int `json:"used_tokens"`
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
	ProtocolVersion     string          `json:"protocol_version"`
	Operation           string          `json:"operation"`
	RequestID           string          `json:"request_id"`
	IdempotencyKey      string          `json:"idempotency_key"`
	ReplayedFromRequest string          `json:"replayed_from_request_id,omitempty"`
	Status              string          `json:"status"`
	RequestedContext    Context         `json:"requested_context"`
	ResolvedContext     *Context        `json:"resolved_context,omitempty"`
	DerivedStep         string          `json:"derived_step,omitempty"`
	Artifacts           []ObjectPointer `json:"artifacts"`
	Briefs              []ObjectPointer `json:"briefs"`
	Events              []ObjectPointer `json:"events"`
	Effects             []EffectRecord  `json:"effects"`
	Next                NextAction      `json:"next"`
	Diagnostics         []Diagnostic    `json:"diagnostics"`
}

type EffectRecord struct {
	ProtocolVersion string         `json:"protocol_version"`
	EffectID        string         `json:"effect_id"`
	RequestID       string         `json:"request_id"`
	CausationID     string         `json:"causation_id"`
	Kind            string         `json:"kind"`
	Resource        ResourceRef    `json:"resource"`
	Adapter         AdapterRef     `json:"adapter"`
	Capability      string         `json:"capability"`
	PolicyDecision  string         `json:"policy_decision"`
	Requested       map[string]any `json:"requested"`
	Occurred        bool           `json:"occurred"`
	Observed        any            `json:"observed"`
	StateBefore     *ResourceRef   `json:"state_before,omitempty"`
	StateAfter      *ResourceRef   `json:"state_after,omitempty"`
	Evidence        []ResourceRef  `json:"evidence"`
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
