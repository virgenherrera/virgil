// Package repodocs implements the repository-backed project store used by
// virgil.init. Callers must provide every identity boundary explicitly; the
// package never derives a target or project from the current directory.
package repodocs

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"time"

	"github.com/gowebpki/jcs"
	"github.com/virgenherrera/virgil/internal/protocol"
)

const (
	managedRoot       = "docs/virgil"
	projectFile       = protocol.RepoDocsProjectFile
	eventsFile        = protocol.RepoDocsEventsFile
	changeFile        = protocol.RepoDocsChangeFile
	projectEvent      = "project_initialized"
	changeEvent       = "change_created"
	eventSchema       = "virgil.dev/project-initialized-event/v1alpha1"
	stateSchema       = "virgil.dev/project-state/v1alpha1"
	changeEventSchema = "virgil.dev/change-created-event/v1alpha1"
	changeStateSchema = "virgil.dev/change-state/v1alpha1"

	schemaProjectState       = "https://schemas.virgil.dev/planning-slice1/v1alpha1/project-state.schema.json"
	schemaProjectInitialized = "https://schemas.virgil.dev/planning-slice1/v1alpha1/project-initialized-event.schema.json"
	schemaChangeState        = "https://schemas.virgil.dev/planning-slice1/v1alpha1/change-state.schema.json"
	schemaChangeCreated      = "https://schemas.virgil.dev/planning-slice1/v1alpha1/change-created-event.schema.json"
	schemaOperationResult    = "https://schemas.virgil.dev/planning-slice1/v1alpha1/operation-result.schema.json"
	schemaEffectRecord       = "https://schemas.virgil.dev/planning-slice1/v1alpha1/effect-record.schema.json"

	revisionDraftedEvent    = "revision_drafted"
	revisionSubmittedEvent  = "revision_submitted"
	revisionApprovedEvent   = "revision_approved"
	revisionWithdrawnEvent  = "revision_withdrawn"
	revisionSupersededEvent = "revision_superseded"

	revisionLifecycleEventSchema = "virgil.dev/revision-lifecycle-event/v1alpha1"
	revisionEnvelopeSchema       = "virgil.dev/revision-envelope/v1alpha1"
	contextBriefSchema           = "virgil.dev/context-brief/v1alpha1"

	schemaRevisionEnvelope       = "https://schemas.virgil.dev/planning-slice1/v1alpha1/revision-envelope.schema.json"
	schemaRevisionLifecycleEvent = "https://schemas.virgil.dev/planning-slice1/v1alpha1/revision-lifecycle-event.schema.json"
	schemaContextBrief           = "https://schemas.virgil.dev/planning-slice1/v1alpha1/context-brief.schema.json"
)

// artifactStepOrder is the fixed Slice 1 artifact sequence. derived_step is
// always the first step in this order without an effective approved revision.
var artifactStepOrder = []string{"idea", "spec", "design", "tasks", "handoff"}

// SchemaValidator validates JSON bytes against a schema identified by its
// canonical URI. The caller provides the concrete implementation so that
// this package never imports the contracts registry directly.
type SchemaValidator interface {
	Validate(schemaID string, document []byte) error
}

// JSONValidator rejects ambiguous JSON (duplicate keys, trailing data).
type JSONValidator func([]byte) error

// Clock supplies the deterministic timestamp recorded by virgil.init.
// It deliberately does not expose the ambient wall clock.
type Clock interface {
	Now() time.Time
}

// ClockFunc adapts a function to Clock.
type ClockFunc func() time.Time

func (clock ClockFunc) Now() time.Time { return clock() }

// Canonicalizer produces the canonical JSON octets used for idempotency.
// Implementations must name the standard they implement so Init can fail
// closed instead of silently substituting encoding/json for RFC 8785.
type Canonicalizer interface {
	Canonicalize([]byte) ([]byte, error)
	Algorithm() string
}

// JCSCanonicalizer implements RFC 8785 JSON Canonicalization Scheme using the
// pinned github.com/gowebpki/jcs implementation.
type JCSCanonicalizer struct{}

func (JCSCanonicalizer) Algorithm() string { return "RFC8785" }

func (JCSCanonicalizer) Canonicalize(document []byte) ([]byte, error) {
	return jcs.Transform(document)
}

// Error is the typed, fail-closed error returned by the adapter. Code matches
// the diagnostic vocabulary of the public operation protocol.
type Error struct {
	Code      string
	Scope     string
	Condition string
	Cause     error
}

func (err *Error) Error() string {
	if err == nil {
		return ""
	}
	if err.Scope == "" {
		return err.Code + ": " + err.Condition
	}
	return err.Code + " (" + err.Scope + "): " + err.Condition
}

func (err *Error) Unwrap() error { return err.Cause }

func typedError(code, scope, condition string, cause error) error {
	return &Error{Code: code, Scope: scope, Condition: condition, Cause: cause}
}

// IdempotencyRecord binds the caller's stable intent key to the canonical
// request projection and the first request that published it.
type IdempotencyRecord struct {
	Key               string `json:"key"`
	RequestDigest     string `json:"request_digest"`
	OriginalRequestID string `json:"original_request_id"`
}

// EventPointer locates the one authoritative initialization event in the
// append-only project event log.
type EventPointer struct {
	EventID    string               `json:"event_id"`
	Kind       string               `json:"kind"`
	LineNumber int                  `json:"line_number"`
	Resource   protocol.ResourceRef `json:"resource"`
}

// ProjectResource records immutable inputs and ledgers that explain project
// state. project.json is deliberately not self-referential.
type ProjectResource struct {
	Role     string               `json:"role"`
	Resource protocol.ResourceRef `json:"resource"`
}

// ProjectState is the durable authority published in project.json. Resolved
// refs are stored for recovery and audit but are not part of RequestDigest;
// that digest always comes from the received OperationRequest.
type ProjectState struct {
	SchemaVersion   string                    `json:"schema_version"`
	ProtocolVersion string                    `json:"protocol_version"`
	ProjectRef      protocol.ProjectRef       `json:"project_ref"`
	Operation       string                    `json:"operation"`
	State           string                    `json:"state"`
	Idempotency     IdempotencyRecord         `json:"idempotency"`
	OriginalRequest protocol.OperationRequest `json:"original_request"`
	InitializedAt   string                    `json:"initialized_at"`
	ResolvedContext protocol.Context          `json:"resolved_context"`
	Event           EventPointer              `json:"event"`
	Resources       []ProjectResource         `json:"resources"`
}

// ProjectInitialized is the single event published by the first init.
type ProjectInitialized struct {
	SchemaVersion    string                    `json:"schema_version"`
	ProtocolVersion  string                    `json:"protocol_version"`
	EventID          string                    `json:"event_id"`
	Kind             string                    `json:"kind"`
	ProjectID        string                    `json:"project_id"`
	Operation        string                    `json:"operation"`
	IdempotencyKey   string                    `json:"idempotency_key"`
	RequestDigest    string                    `json:"request_digest"`
	RequestID        string                    `json:"request_id"`
	CausationID      string                    `json:"causation_id"`
	OccurredAt       string                    `json:"occurred_at"`
	Actor            protocol.ActorRef         `json:"actor"`
	DogmaRef         protocol.DogmaRef         `json:"dogma_ref"`
	ProjectRef       protocol.ProjectRef       `json:"project_ref"`
	ArtifactStoreRef protocol.ArtifactStoreRef `json:"artifact_store_ref"`
}

// ChangeResource records immutable inputs that explain change state.
type ChangeResource struct {
	Role     string               `json:"role"`
	Resource protocol.ResourceRef `json:"resource"`
}

// ChangeState is the durable authority published in change.json.
type ChangeState struct {
	SchemaVersion   string                    `json:"schema_version"`
	ProtocolVersion string                    `json:"protocol_version"`
	ProjectRef      protocol.ProjectRef       `json:"project_ref"`
	ChangeID        string                    `json:"change_id"`
	Operation       string                    `json:"operation"`
	State           string                    `json:"state"`
	DerivedStep     string                    `json:"derived_step"`
	Intent          string                    `json:"intent"`
	Provenance      protocol.SourceProvenance `json:"provenance"`
	Idempotency     IdempotencyRecord         `json:"idempotency"`
	OriginalRequest protocol.OperationRequest `json:"original_request"`
	CreatedAt       string                    `json:"created_at"`
	ResolvedContext protocol.Context          `json:"resolved_context"`
	Event           EventPointer              `json:"event"`
	Resources       []ChangeResource          `json:"resources"`
}

// ChangeCreated is the event published when a new change is created.
type ChangeCreated struct {
	SchemaVersion    string                    `json:"schema_version"`
	ProtocolVersion  string                    `json:"protocol_version"`
	EventID          string                    `json:"event_id"`
	Kind             string                    `json:"kind"`
	OccurredAt       string                    `json:"occurred_at"`
	Operation        string                    `json:"operation"`
	ProjectID        string                    `json:"project_id"`
	ChangeID         string                    `json:"change_id"`
	Intent           string                    `json:"intent"`
	RequestID        string                    `json:"request_id"`
	RequestDigest    string                    `json:"request_digest"`
	IdempotencyKey   string                    `json:"idempotency_key"`
	CausationID      string                    `json:"causation_id"`
	Actor            protocol.ActorRef         `json:"actor"`
	DogmaRef         protocol.DogmaRef         `json:"dogma_ref"`
	ProjectRef       protocol.ProjectRef       `json:"project_ref"`
	ArtifactStoreRef protocol.ArtifactStoreRef `json:"artifact_store_ref"`
	RunRef           protocol.RunRef           `json:"run_ref"`
}

// NewInput extracts the typed input fields from a virgil.new request.
type NewInput struct {
	ChangeID   string                    `json:"change_id"`
	Intent     string                    `json:"intent"`
	Provenance protocol.SourceProvenance `json:"provenance"`
	Evidence   []protocol.ResourceRef    `json:"evidence,omitempty"`
}

// Init validates, recovers or atomically publishes repo-docs state for
// virgil.init. targetRoot must be the explicit host binding for ProjectRef.
func Init(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	if err := validateInit(request, targetRoot, clock, canonicalizer, validateJSON); err != nil {
		return protocol.OperationResult{}, err
	}

	digest, err := requestDigest(request, canonicalizer)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	root, resolvedTarget, err := openTargetRoot(targetRoot)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	defer root.Close()

	projectPath := request.ArtifactStoreRef.Namespace
	if state, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, schema, validateJSON); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if found {
		result, replayErr := replayResult(request, state, digest)
		return validateResult(schema, result, replayErr)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	initializedAt := now.UTC().Format(time.RFC3339Nano)
	resolved := resolvedContext(request, resolvedTarget)
	state, event, projectBytes, eventBytes, err := buildPublication(request, digest, initializedAt, resolved)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "cannot encode authoritative init state", err)
	}
	result := successResult(request, state, event, projectBytes, eventBytes)
	if err := validatePublication(schema, projectBytes, eventBytes, result); err != nil {
		return protocol.OperationResult{}, err
	}
	if err := publish(root, projectPath, projectBytes, eventBytes); err != nil {
		var publicationError *publishError
		if errors.As(err, &publicationError) {
			state, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, schema, validateJSON)
			if loadErr != nil {
				return protocol.OperationResult{}, loadErr
			}
			if found {
				replayed, replayErr := replayResult(request, state, digest)
				return validateResult(schema, replayed, replayErr)
			}
			return protocol.OperationResult{}, typedError("ATOMICITY_UNSUPPORTED", projectPath, "cannot atomically publish the complete project directory", publicationError.Cause)
		}
		return protocol.OperationResult{}, err
	}

	return result, nil
}

// New validates, recovers or atomically publishes a change for virgil.new.
// The project must already be initialized. targetRoot must be the explicit
// host binding for ProjectRef.
func New(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	if err := validateNew(request, targetRoot, clock, canonicalizer, validateJSON); err != nil {
		return protocol.OperationResult{}, err
	}

	var input NewInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "new input is not valid JSON", err)
	}

	digest, err := requestDigest(request, canonicalizer)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	root, resolvedTarget, err := openTargetRoot(targetRoot)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	defer root.Close()

	projectPath := request.ArtifactStoreRef.Namespace
	if _, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, schema, validateJSON); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if !found {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "project is not initialized", nil)
	}

	changePath := path.Join(projectPath, "changes", input.ChangeID)
	if state, found, loadErr := loadExistingChange(root, changePath, resolvedTarget, canonicalizer, schema, validateJSON); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if found {
		result, replayErr := replayNewResult(request, state, digest, input)
		return validateResult(schema, result, replayErr)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	createdAt := now.UTC().Format(time.RFC3339Nano)
	resolved := resolvedNewContext(request, resolvedTarget, input)
	state, event, changeBytes, eventBytes, err := buildChangePublication(root, request, input, digest, createdAt, resolved, projectPath)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "cannot encode authoritative change state", err)
	}
	result := newSuccessResult(request, state, event, changeBytes, eventBytes, input, changePath)
	if err := validateChangePublication(schema, changeBytes, eventBytes, result); err != nil {
		return protocol.OperationResult{}, err
	}
	if err := publishChange(root, projectPath, input.ChangeID, changeBytes, eventBytes); err != nil {
		var publicationError *publishError
		if errors.As(err, &publicationError) {
			state, found, loadErr := loadExistingChange(root, changePath, resolvedTarget, canonicalizer, schema, validateJSON)
			if loadErr != nil {
				return protocol.OperationResult{}, loadErr
			}
			if found {
				replayed, replayErr := replayNewResult(request, state, digest, input)
				return validateResult(schema, replayed, replayErr)
			}
			return protocol.OperationResult{}, typedError("ATOMICITY_UNSUPPORTED", changePath, "cannot atomically publish the change directory", publicationError.Cause)
		}
		return protocol.OperationResult{}, err
	}

	return result, nil
}

// Continue validates, recovers or atomically advances a change for
// virgil.continue. The project and the change must already exist.
// targetRoot must be the explicit host binding for ProjectRef.
func Continue(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	if err := validateContinue(request, targetRoot, clock, canonicalizer, validateJSON); err != nil {
		return protocol.OperationResult{}, err
	}

	var input protocol.ContinueInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "continue input is not valid JSON", err)
	}

	root, resolvedTarget, err := openTargetRoot(targetRoot)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	defer root.Close()

	projectPath := request.ArtifactStoreRef.Namespace
	if _, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, schema, validateJSON); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if !found {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "project is not initialized", nil)
	}

	changePath := path.Join(projectPath, "changes", input.ChangeID)
	changeState, found, loadErr := loadExistingChange(root, changePath, resolvedTarget, canonicalizer, schema, validateJSON)
	if loadErr != nil {
		return protocol.OperationResult{}, loadErr
	}
	if !found {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "change does not exist", nil)
	}
	if changeState.ProjectRef.ProjectID != request.ProjectRef.ProjectID {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "change belongs to a different project", nil)
	}
	if changeState.ResolvedContext.RunRef == nil || *request.RunRef != *changeState.ResolvedContext.RunRef {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "run_ref does not match the change's canonical run", nil)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	nowStr := now.UTC().Format(time.RFC3339Nano)

	var result protocol.OperationResult
	var handlerErr error
	switch input.Entry.Kind {
	case "content_proposal":
		result, handlerErr = handleContentProposal(root, request, input, changePath, resolvedTarget, nowStr, schema, validateJSON)
	case "approval":
		switch input.Entry.Decision {
		case "approved":
			result, handlerErr = handleApprovalApproved(root, request, input, changePath, resolvedTarget, nowStr, schema, validateJSON)
		case "request_changes":
			result, handlerErr = handleRequestChanges(root, request, input, changePath, resolvedTarget, nowStr, schema, validateJSON)
		default:
			handlerErr = typedError("CAPABILITY_UNSUPPORTED", input.Entry.Decision, "approval decision is not yet implemented", nil)
		}
	default:
		handlerErr = typedError("CAPABILITY_UNSUPPORTED", input.Entry.Kind, "continue entry kind is not yet implemented", nil)
	}

	return validateResult(schema, result, handlerErr)
}

func validateContinue(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.continue" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs Continue accepts only the current virgil.continue protocol", nil)
	}
	if request.RequestID == "" || request.IdempotencyKey == "" || request.ProjectRef.ProjectID == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "request, idempotency and project identities are required", nil)
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "request references are not coherent", nil)
	}
	if request.DogmaRef.Source.URI == "" || !validSHA256(request.DogmaRef.Digest) ||
		(request.DogmaRef.Source.Digest != "" && request.DogmaRef.Source.Digest != request.DogmaRef.Digest) {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "dogma source and immutable digest are not coherent", nil)
	}
	if request.ProjectRef.Target.URI == request.DogmaRef.Source.URI {
		return typedError("METHOD_TARGET_COLLISION", request.ProjectRef.Target.URI, "method source and target identity collide", nil)
	}
	if request.ArtifactStoreRef.Adapter.AdapterID != "repo-docs" || request.ArtifactStoreRef.Adapter.AdapterVersion != "v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Adapter.AdapterID, "artifact store adapter is unsupported", nil)
	}
	if request.ArtifactStoreRef.Policy.PolicyVersion != "repo-docs/v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Policy.PolicyVersion, "repo-docs policy version is unsupported", nil)
	}
	expectedNamespace := path.Join(managedRoot, "projects", request.ProjectRef.ProjectID)
	if !safeRelativePath(request.ProjectRef.ProjectID) || request.ArtifactStoreRef.Namespace != expectedNamespace {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace must be exactly docs/virgil/projects/{project_id}", nil)
	}
	if !allowedByWritePolicy(request.ArtifactStoreRef.Namespace, request.ArtifactStoreRef.Policy.WriteAllowlist) {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace is outside the effective write allowlist", nil)
	}
	if request.RunRef == nil {
		return typedError("PRECONDITION_FAILED", request.Operation, "virgil.continue requires an explicit run_ref", nil)
	}
	if request.RunRef.ProjectID != request.ProjectRef.ProjectID || request.RunRef.Baseline != request.ProjectRef.Target.Baseline {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "run_ref is not coherent with project_ref", nil)
	}
	if err := validateJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "continue input is ambiguous JSON", err)
	}
	var input protocol.ContinueInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "continue input cannot be decoded", err)
	}
	if input.ChangeID == "" || !safeRelativePath(input.ChangeID) {
		return typedError("STORE_POLICY_VIOLATION", input.ChangeID, "change_id must be a safe relative path component", nil)
	}
	if request.RunRef.ChangeID != input.ChangeID {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "run_ref.change_id does not match continue input change_id", nil)
	}
	if err := validateEntryShape(input.Entry); err != nil {
		return err
	}
	if !filepath.IsAbs(targetRoot) {
		return typedError("IDENTITY_AMBIGUOUS", targetRoot, "target root must be explicit and absolute", nil)
	}
	if clock == nil {
		return typedError("PRECONDITION_FAILED", request.Operation, "an explicit clock is required", nil)
	}
	if canonicalizer == nil || canonicalizer.Algorithm() != "RFC8785" {
		return typedError("CAPABILITY_UNSUPPORTED", request.Operation, "RFC 8785 canonicalization is required", nil)
	}
	return nil
}

func validateEntryShape(entry protocol.EntryUnion) error {
	switch entry.Kind {
	case "content_proposal":
		if !validArtifactKind(entry.ArtifactKind) {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "content_proposal requires a valid artifact_kind", nil)
		}
		if entry.Content == nil || entry.Content.URI == "" {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "content_proposal requires a content resource", nil)
		}
		return nil
	case "approval":
		if entry.ArtifactID == "" || entry.Revision == "" {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "approval requires artifact_id and revision", nil)
		}
		switch entry.Decision {
		case "approved", "request_changes", "rejected":
		default:
			return typedError("PRECONDITION_FAILED", "virgil.continue", "approval decision is invalid", nil)
		}
		if entry.Rationale == "" {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "approval requires a rationale", nil)
		}
		return nil
	case "answer":
		if entry.Answer == "" {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "answer entry requires an answer", nil)
		}
		return nil
	case "recovery_request":
		if entry.Reason == "" {
			return typedError("PRECONDITION_FAILED", "virgil.continue", "recovery_request requires a reason", nil)
		}
		return nil
	default:
		return typedError("PRECONDITION_FAILED", "virgil.continue", "entry.kind is not a recognized continue entry", nil)
	}
}

func validArtifactKind(kind string) bool {
	return indexOf(artifactStepOrder, kind) >= 0
}

func validateNew(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.new" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs New accepts only the current virgil.new protocol", nil)
	}
	if request.RequestID == "" || request.IdempotencyKey == "" || request.ProjectRef.ProjectID == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "request, idempotency and project identities are required", nil)
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "request references are not coherent", nil)
	}
	if request.DogmaRef.Source.URI == "" || !validSHA256(request.DogmaRef.Digest) ||
		(request.DogmaRef.Source.Digest != "" && request.DogmaRef.Source.Digest != request.DogmaRef.Digest) {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "dogma source and immutable digest are not coherent", nil)
	}
	if request.ProjectRef.Target.URI == request.DogmaRef.Source.URI {
		return typedError("METHOD_TARGET_COLLISION", request.ProjectRef.Target.URI, "method source and target identity collide", nil)
	}
	if request.ArtifactStoreRef.Adapter.AdapterID != "repo-docs" || request.ArtifactStoreRef.Adapter.AdapterVersion != "v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Adapter.AdapterID, "artifact store adapter is unsupported", nil)
	}
	if request.ArtifactStoreRef.Policy.PolicyVersion != "repo-docs/v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Policy.PolicyVersion, "repo-docs policy version is unsupported", nil)
	}
	expectedNamespace := path.Join(managedRoot, "projects", request.ProjectRef.ProjectID)
	if !safeRelativePath(request.ProjectRef.ProjectID) || request.ArtifactStoreRef.Namespace != expectedNamespace {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace must be exactly docs/virgil/projects/{project_id}", nil)
	}
	if !allowedByWritePolicy(request.ArtifactStoreRef.Namespace, request.ArtifactStoreRef.Policy.WriteAllowlist) {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace is outside the effective write allowlist", nil)
	}
	if err := validateJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "new input is ambiguous JSON", err)
	}
	var input NewInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "new input cannot be decoded", err)
	}
	if input.ChangeID == "" || input.Intent == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "change_id and intent are required", nil)
	}
	if !safeRelativePath(input.ChangeID) {
		return typedError("STORE_POLICY_VIOLATION", input.ChangeID, "change_id must be a safe relative path component", nil)
	}
	if input.Provenance.Kind == "" || input.Provenance.CapturedAt == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "provenance kind and captured_at are required", nil)
	}
	if request.RunRef != nil {
		return typedError("PRECONDITION_FAILED", request.Operation, "virgil.new must not receive a run_ref", nil)
	}
	if !filepath.IsAbs(targetRoot) {
		return typedError("IDENTITY_AMBIGUOUS", targetRoot, "target root must be explicit and absolute", nil)
	}
	if clock == nil {
		return typedError("PRECONDITION_FAILED", request.Operation, "an explicit clock is required", nil)
	}
	if canonicalizer == nil || canonicalizer.Algorithm() != "RFC8785" {
		return typedError("CAPABILITY_UNSUPPORTED", request.Operation, "RFC 8785 canonicalization is required", nil)
	}
	return nil
}

func loadExistingChange(root *os.Root, changePath, resolvedTarget string, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (ChangeState, bool, error) {
	changeInfo, statErr := root.Lstat(changePath)
	if errors.Is(statErr, fs.ErrNotExist) {
		return ChangeState{}, false, nil
	}
	if statErr != nil || !changeInfo.IsDir() || changeInfo.Mode()&os.ModeSymlink != 0 {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "published change path is not a real directory", statErr)
	}
	entries, err := fs.ReadDir(root.FS(), changePath)
	if err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "cannot enumerate change authority", err)
	}
	var changeFound, eventsFound bool
	for _, entry := range entries {
		entryPath := path.Join(changePath, entry.Name())
		info, statErr := root.Lstat(entryPath)
		if statErr != nil || info.Mode()&os.ModeSymlink != 0 {
			return ChangeState{}, false, typedError("CORRUPT_LEDGER", entryPath, "change authority contains an unreadable or symlinked entry", statErr)
		}
		switch entry.Name() {
		case changeFile:
			if !info.Mode().IsRegular() {
				return ChangeState{}, false, typedError("CORRUPT_LEDGER", entryPath, "change.json must be a regular file", nil)
			}
			changeFound = true
		case eventsFile:
			if !info.Mode().IsRegular() {
				return ChangeState{}, false, typedError("CORRUPT_LEDGER", entryPath, "events.jsonl must be a regular file", nil)
			}
			eventsFound = true
		case "artifacts", "briefs":
			if !info.IsDir() {
				return ChangeState{}, false, typedError("CORRUPT_LEDGER", entryPath, entry.Name()+" must be a real directory", nil)
			}
		default:
			return ChangeState{}, false, typedError("CORRUPT_LEDGER", entryPath, "change authority contains an unknown entry", nil)
		}
	}
	if !changeFound || !eventsFound {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change authority requires regular change.json and events.jsonl", nil)
	}
	changeBytes, err := root.ReadFile(path.Join(changePath, changeFile))
	if err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "cannot read change authority", err)
	}
	eventBytes, err := root.ReadFile(path.Join(changePath, eventsFile))
	if err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change authority has no complete event log", err)
	}
	if err := schema.Validate(schemaChangeState, changeBytes); err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change state violates its bundled schema", err)
	}
	eventLines, firstEventLine, splitErr := splitChangeEventLines(eventBytes)
	if splitErr != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change event log has no well-formed lines", splitErr)
	}
	if err := schema.Validate(schemaChangeCreated, firstEventLine); err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change event violates its bundled schema", err)
	}
	for _, lifecycleLine := range eventLines[1:] {
		if err := schema.Validate(schemaRevisionLifecycleEvent, lifecycleLine); err != nil {
			return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "revision lifecycle event violates its bundled schema", err)
		}
	}
	state, event, err := decodeChangeAuthority(changeBytes, eventLines, validateJSON)
	if err != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "published change authority is invalid", err)
	}
	eventURI := path.Join(changePath, eventsFile)
	durableDigest, digestErr := requestDigest(state.OriginalRequest, canonicalizer)
	if digestErr != nil {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "cannot re-canonicalize original request", digestErr)
	}
	projectAuthorityResource, eventResource, resourcesOK := authoritativeChangeResources(state.Resources)
	expectedResolved := protocol.ContextFromRequest(state.OriginalRequest)
	expectedResolved.ProjectRef.Target.CanonicalPath = resolvedTarget
	expectedResolved.RunRef = state.ResolvedContext.RunRef
	if state.Event.EventID != event.EventID || state.Event.Kind != changeEvent || state.Event.LineNumber != 1 ||
		state.Event.Resource.URI != eventURI || state.Event.Resource.Digest != fmt.Sprintf("sha256:%x", sha256.Sum256(firstEventLine)) ||
		state.Idempotency.RequestDigest != durableDigest || state.Idempotency.RequestDigest != event.RequestDigest ||
		state.Idempotency.Key != state.OriginalRequest.IdempotencyKey || state.Idempotency.OriginalRequestID != state.OriginalRequest.RequestID ||
		state.ProtocolVersion != state.OriginalRequest.ProtocolVersion || state.Operation != state.OriginalRequest.Operation ||
		state.ProjectRef.ProjectID != event.ProjectID || state.ChangeID != event.ChangeID ||
		state.ResolvedContext.ProjectRef.ProjectID != state.ProjectRef.ProjectID ||
		state.ResolvedContext.ArtifactStoreRef.ProjectID != state.ProjectRef.ProjectID ||
		state.ResolvedContext.ArtifactStoreRef.Namespace != path.Dir(path.Dir(changePath)) ||
		state.ResolvedContext.ArtifactStoreRef.StoreRefID != state.ResolvedContext.ProjectRef.ArtifactStoreRefID ||
		state.ResolvedContext.DogmaRef.DogmaID != state.ResolvedContext.ProjectRef.DogmaRefID ||
		!reflect.DeepEqual(state.ProjectRef, state.ResolvedContext.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext, expectedResolved) ||
		!reflect.DeepEqual(state.ResolvedContext.DogmaRef, event.DogmaRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ProjectRef, event.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ArtifactStoreRef, event.ArtifactStoreRef) ||
		!reflect.DeepEqual(state.OriginalRequest.Actor, event.Actor) ||
		state.ResolvedContext.RunRef == nil || !reflect.DeepEqual(*state.ResolvedContext.RunRef, event.RunRef) ||
		!resourcesOK || !reflect.DeepEqual(eventResource, state.Event.Resource) ||
		projectAuthorityResource.URI == "" || !validSHA256(projectAuthorityResource.Digest) {
		return ChangeState{}, false, typedError("CORRUPT_LEDGER", changePath, "change state and creation event disagree", nil)
	}
	return state, true, nil
}

// splitChangeEventLines splits a change's events.jsonl into its well-formed,
// non-empty lines. It also returns the exact bytes of the first line (plus
// its trailing newline) so callers can validate or digest the immutable
// change_created event independently of any revision lifecycle events
// appended afterward by virgil.continue.
func splitChangeEventLines(eventBytes []byte) ([][]byte, []byte, error) {
	trimmed := bytes.TrimSpace(eventBytes)
	if len(trimmed) == 0 {
		return nil, nil, fmt.Errorf("event log is empty")
	}
	rawLines := bytes.Split(trimmed, []byte{'\n'})
	lines := make([][]byte, 0, len(rawLines))
	for _, line := range rawLines {
		if len(line) == 0 {
			continue
		}
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return nil, nil, fmt.Errorf("event log has no well-formed lines")
	}
	firstLine := append(append([]byte(nil), lines[0]...), '\n')
	return lines, firstLine, nil
}

func decodeChangeAuthority(changeBytes []byte, eventLines [][]byte, validateJSON JSONValidator) (ChangeState, ChangeCreated, error) {
	var state ChangeState
	if err := decodeSingleJSON(changeBytes, &state, validateJSON); err != nil {
		return ChangeState{}, ChangeCreated{}, err
	}
	if len(eventLines) == 0 {
		return ChangeState{}, ChangeCreated{}, fmt.Errorf("change events.jsonl must contain at least one event")
	}
	var event ChangeCreated
	if err := decodeSingleJSON(eventLines[0], &event, validateJSON); err != nil {
		return ChangeState{}, ChangeCreated{}, err
	}
	for _, line := range eventLines[1:] {
		var lifecycle protocol.RevisionLifecycleEvent
		if err := decodeSingleJSON(line, &lifecycle, validateJSON); err != nil {
			return ChangeState{}, ChangeCreated{}, fmt.Errorf("revision lifecycle event is invalid: %w", err)
		}
		switch lifecycle.Kind {
		case revisionDraftedEvent, revisionSubmittedEvent, revisionApprovedEvent, revisionWithdrawnEvent, revisionSupersededEvent:
		default:
			return ChangeState{}, ChangeCreated{}, fmt.Errorf("revision lifecycle event has an unknown kind %q", lifecycle.Kind)
		}
		if lifecycle.ChangeID != state.ChangeID || lifecycle.ProjectID != state.ProjectRef.ProjectID {
			return ChangeState{}, ChangeCreated{}, fmt.Errorf("revision lifecycle event identity does not match the change authority")
		}
	}
	if _, err := time.Parse(time.RFC3339, state.CreatedAt); err != nil {
		return ChangeState{}, ChangeCreated{}, fmt.Errorf("created_at is not RFC3339: %w", err)
	}
	if _, err := time.Parse(time.RFC3339, event.OccurredAt); err != nil {
		return ChangeState{}, ChangeCreated{}, fmt.Errorf("event occurred_at is not RFC3339: %w", err)
	}
	if state.SchemaVersion != changeStateSchema || state.ProtocolVersion != protocol.Version ||
		state.ProjectRef.ProjectID == "" || state.ChangeID == "" || state.Operation != "virgil.new" || state.State != "created" ||
		state.DerivedStep != "idea" || state.Intent == "" ||
		state.Idempotency.Key == "" || state.Idempotency.RequestDigest == "" || state.Idempotency.OriginalRequestID == "" ||
		state.OriginalRequest.RequestID == "" || state.CreatedAt == "" || state.Event.EventID == "" || state.Event.LineNumber != 1 ||
		state.Event.Resource.URI == "" || state.Event.Resource.Digest == "" || len(state.Resources) != 2 ||
		!validSHA256(state.Idempotency.RequestDigest) || !validSHA256(state.Event.Resource.Digest) ||
		event.SchemaVersion != changeEventSchema || event.ProtocolVersion != protocol.Version || event.EventID == "" || event.Kind != changeEvent ||
		event.Operation != state.Operation || event.IdempotencyKey != state.Idempotency.Key ||
		!validSHA256(event.RequestDigest) || event.RequestID != state.Idempotency.OriginalRequestID || event.CausationID != event.RequestID || event.OccurredAt != state.CreatedAt ||
		event.Actor.ActorID == "" || event.ProjectRef.ProjectID != event.ProjectID ||
		event.DogmaRef.DogmaID != event.ProjectRef.DogmaRefID ||
		event.ArtifactStoreRef.ProjectID != event.ProjectID ||
		event.ArtifactStoreRef.StoreRefID != event.ProjectRef.ArtifactStoreRefID ||
		event.RunRef.ChangeID != state.ChangeID || event.RunRef.ProjectID != state.ProjectRef.ProjectID {
		return ChangeState{}, ChangeCreated{}, fmt.Errorf("change authority version or event kind is invalid")
	}
	return state, event, nil
}

func authoritativeChangeResources(resources []ChangeResource) (protocol.ResourceRef, protocol.ResourceRef, bool) {
	if len(resources) != 2 {
		return protocol.ResourceRef{}, protocol.ResourceRef{}, false
	}
	var projectAuth, eventLog protocol.ResourceRef
	for _, resource := range resources {
		if resource.Resource.URI == "" || !validSHA256(resource.Resource.Digest) {
			return protocol.ResourceRef{}, protocol.ResourceRef{}, false
		}
		switch resource.Role {
		case "project_authority":
			if projectAuth.URI != "" {
				return protocol.ResourceRef{}, protocol.ResourceRef{}, false
			}
			projectAuth = resource.Resource
		case "event_log":
			if eventLog.URI != "" {
				return protocol.ResourceRef{}, protocol.ResourceRef{}, false
			}
			eventLog = resource.Resource
		default:
			return protocol.ResourceRef{}, protocol.ResourceRef{}, false
		}
	}
	return projectAuth, eventLog, projectAuth.URI != "" && eventLog.URI != ""
}

func replayNewResult(request protocol.OperationRequest, state ChangeState, digest string, input NewInput) (protocol.OperationResult, error) {
	if state.ProjectRef.ProjectID != request.ProjectRef.ProjectID || state.Operation != request.Operation || state.Idempotency.Key != request.IdempotencyKey {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.ProjectRef.ProjectID, "change already exists from a different intention", nil)
	}
	if state.Idempotency.RequestDigest != digest {
		return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different request digest", nil)
	}
	resolved := state.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:     request.ProtocolVersion,
		Operation:           request.Operation,
		RequestID:           request.RequestID,
		IdempotencyKey:      request.IdempotencyKey,
		ReplayedFromRequest: state.Idempotency.OriginalRequestID,
		Status:              "success",
		RequestedContext:    protocol.ContextFromRequest(request),
		ResolvedContext:     &resolved,
		DerivedStep:         "idea",
		Artifacts:           []protocol.ObjectPointer{},
		Briefs:              []protocol.ObjectPointer{},
		Events:              []protocol.ObjectPointer{changeEventPointer(state)},
		Effects:             []protocol.EffectRecord{},
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "change is created and ready for the first artifact",
		},
		Diagnostics: []protocol.Diagnostic{},
	}, nil
}

func resolvedNewContext(request protocol.OperationRequest, resolvedTarget string, input NewInput) protocol.Context {
	context := protocol.ContextFromRequest(request)
	context.ProjectRef.Target.CanonicalPath = resolvedTarget
	context.RunRef = &protocol.RunRef{
		RunID:     stableID("run", request.ProjectRef.ProjectID, input.ChangeID, request.IdempotencyKey),
		ChangeID:  input.ChangeID,
		ProjectID: request.ProjectRef.ProjectID,
		Baseline:  request.ProjectRef.Target.Baseline,
	}
	return context
}

func buildChangePublication(root *os.Root, request protocol.OperationRequest, input NewInput, digest, createdAt string, resolved protocol.Context, projectPath string) (ChangeState, ChangeCreated, []byte, []byte, error) {
	eventID := stableID("event", request.ProjectRef.ProjectID, input.ChangeID, request.Operation, request.IdempotencyKey, digest)
	changePath := path.Join(projectPath, "changes", input.ChangeID)
	event := ChangeCreated{
		SchemaVersion:    changeEventSchema,
		ProtocolVersion:  request.ProtocolVersion,
		EventID:          eventID,
		Kind:             changeEvent,
		OccurredAt:       createdAt,
		Operation:        request.Operation,
		ProjectID:        request.ProjectRef.ProjectID,
		ChangeID:         input.ChangeID,
		Intent:           input.Intent,
		RequestID:        request.RequestID,
		RequestDigest:    digest,
		IdempotencyKey:   request.IdempotencyKey,
		CausationID:      request.RequestID,
		Actor:            request.Actor,
		DogmaRef:         resolved.DogmaRef,
		ProjectRef:       resolved.ProjectRef,
		ArtifactStoreRef: resolved.ArtifactStoreRef,
		RunRef:           *resolved.RunRef,
	}
	eventURI := path.Join(changePath, eventsFile)
	eventBytes, err := json.Marshal(event)
	if err != nil {
		return ChangeState{}, ChangeCreated{}, nil, nil, err
	}
	eventBytes = append(eventBytes, '\n')
	eventResource := withDigest(protocol.ResourceRef{URI: eventURI}, eventBytes)

	projectAuthorityURI := path.Join(projectPath, projectFile)
	projectAuthorityBytes, err := root.ReadFile(path.Join(projectPath, projectFile))
	if err != nil {
		projectAuthorityBytes = nil
	}
	var projectAuthorityResource protocol.ResourceRef
	if len(projectAuthorityBytes) > 0 {
		projectAuthorityResource = withDigest(protocol.ResourceRef{URI: projectAuthorityURI}, projectAuthorityBytes)
	} else {
		projectAuthorityResource = protocol.ResourceRef{URI: projectAuthorityURI}
	}

	state := ChangeState{
		SchemaVersion:   changeStateSchema,
		ProtocolVersion: request.ProtocolVersion,
		ProjectRef:      resolved.ProjectRef,
		ChangeID:        input.ChangeID,
		Operation:       request.Operation,
		State:           "created",
		DerivedStep:     "idea",
		Intent:          input.Intent,
		Provenance:      input.Provenance,
		Idempotency: IdempotencyRecord{
			Key:               request.IdempotencyKey,
			RequestDigest:     digest,
			OriginalRequestID: request.RequestID,
		},
		OriginalRequest: request,
		CreatedAt:       createdAt,
		ResolvedContext: resolved,
		Event: EventPointer{
			EventID:    eventID,
			Kind:       changeEvent,
			LineNumber: 1,
			Resource:   eventResource,
		},
		Resources: []ChangeResource{
			{Role: "project_authority", Resource: projectAuthorityResource},
			{Role: "event_log", Resource: eventResource},
		},
	}
	changeBytes, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return ChangeState{}, ChangeCreated{}, nil, nil, err
	}
	changeBytes = append(changeBytes, '\n')
	return state, event, changeBytes, eventBytes, nil
}

func newSuccessResult(request protocol.OperationRequest, state ChangeState, event ChangeCreated, changeBytes, eventBytes []byte, input NewInput, changePath string) protocol.OperationResult {
	changeResource := withDigest(protocol.ResourceRef{URI: path.Join(changePath, changeFile)}, changeBytes)
	eventResource := withDigest(state.Event.Resource, eventBytes)
	eventPointer := changeEventPointer(state)
	eventPointer.Resource = &eventResource
	resolved := state.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      "idea",
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{eventPointer},
		Effects: []protocol.EffectRecord{
			writeEffect(request, "change", changeResource, eventResource, len(changeBytes)),
			writeEffect(request, "event", eventResource, eventResource, len(eventBytes)),
		},
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "change is created and ready for the first artifact",
		},
		Diagnostics: []protocol.Diagnostic{},
	}
}

func changeEventPointer(state ChangeState) protocol.ObjectPointer {
	resource := state.Event.Resource
	return protocol.ObjectPointer{
		ObjectID: state.Event.EventID,
		Kind:     state.Event.Kind,
		Revision: state.Idempotency.RequestDigest,
		Resource: &resource,
	}
}

func validateChangePublication(schema SchemaValidator, changeBytes, eventBytes []byte, result protocol.OperationResult) error {
	if err := schema.Validate(schemaChangeState, changeBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated change state violates its bundled schema", err)
	}
	if err := schema.Validate(schemaChangeCreated, eventBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated change event violates its bundled schema", err)
	}
	validated, err := validateResult(schema, result, nil)
	if err != nil {
		return err
	}
	_ = validated
	return nil
}

func publishChange(root *os.Root, projectPath, changeID string, changeBytes, eventBytes []byte) error {
	changesDir := path.Join(projectPath, "changes")
	changePath := path.Join(changesDir, changeID)
	if err := createDirectoryChain(root, changesDir); err != nil {
		return err
	}
	if err := syncDirectoryChain(root, changesDir); err != nil {
		return err
	}

	tempName := ".new-" + stableID("tmp", changePath, fmt.Sprintf("%x", sha256.Sum256(changeBytes)))
	tempPath := path.Join(changesDir, tempName)
	if err := root.Mkdir(tempPath, 0o700); err != nil {
		if !errors.Is(err, fs.ErrExist) {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create exclusive sibling staging directory", err)
		}
		if removeErr := root.RemoveAll(tempPath); removeErr != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot recover crashed staging directory", errors.Join(err, removeErr))
		}
		if err := root.Mkdir(tempPath, 0o700); err != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create staging directory after crash recovery", err)
		}
	}
	published := false
	defer func() {
		if !published {
			_ = root.RemoveAll(tempPath)
		}
	}()

	if err := writeExclusive(root, path.Join(tempPath, changeFile), changeBytes); err != nil {
		return err
	}
	if err := writeExclusive(root, path.Join(tempPath, eventsFile), eventBytes); err != nil {
		return err
	}
	if err := syncDirectory(root, tempPath); err != nil {
		return err
	}
	if err := root.Rename(tempPath, changePath); err != nil {
		return &publishError{Cause: err}
	}
	published = true
	if err := syncDirectory(root, changesDir); err != nil {
		return err
	}
	return nil
}

func validateInit(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.init" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs Init accepts only the current virgil.init protocol", nil)
	}
	if request.RequestID == "" || request.IdempotencyKey == "" || request.ProjectRef.ProjectID == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "request, idempotency and project identities are required", nil)
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "request references are not coherent", nil)
	}
	if request.DogmaRef.Source.URI == "" || !validSHA256(request.DogmaRef.Digest) ||
		(request.DogmaRef.Source.Digest != "" && request.DogmaRef.Source.Digest != request.DogmaRef.Digest) {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "dogma source and immutable digest are not coherent", nil)
	}
	if request.ProjectRef.Target.URI == request.DogmaRef.Source.URI {
		return typedError("METHOD_TARGET_COLLISION", request.ProjectRef.Target.URI, "method source and target identity collide", nil)
	}
	if request.ArtifactStoreRef.Adapter.AdapterID != "repo-docs" || request.ArtifactStoreRef.Adapter.AdapterVersion != "v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Adapter.AdapterID, "artifact store adapter is unsupported", nil)
	}
	if request.ArtifactStoreRef.Policy.PolicyVersion != "repo-docs/v1alpha1" {
		return typedError("CAPABILITY_UNSUPPORTED", request.ArtifactStoreRef.Policy.PolicyVersion, "repo-docs policy version is unsupported", nil)
	}
	expectedNamespace := path.Join(managedRoot, "projects", request.ProjectRef.ProjectID)
	if !safeRelativePath(request.ProjectRef.ProjectID) || request.ArtifactStoreRef.Namespace != expectedNamespace {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace must be exactly docs/virgil/projects/{project_id}", nil)
	}
	if !allowedByWritePolicy(request.ArtifactStoreRef.Namespace, request.ArtifactStoreRef.Policy.WriteAllowlist) {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace is outside the effective write allowlist", nil)
	}
	var input struct {
		ProjectID string `json:"project_id"`
	}
	if err := validateJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "init input is ambiguous JSON", err)
	}
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil || input.ProjectID != request.ProjectRef.ProjectID {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "init input project_id does not match ProjectRef", err)
	}
	if !filepath.IsAbs(targetRoot) {
		return typedError("IDENTITY_AMBIGUOUS", targetRoot, "target root must be explicit and absolute", nil)
	}
	if clock == nil {
		return typedError("PRECONDITION_FAILED", request.Operation, "an explicit clock is required", nil)
	}
	if canonicalizer == nil || canonicalizer.Algorithm() != "RFC8785" {
		return typedError("CAPABILITY_UNSUPPORTED", request.Operation, "RFC 8785 canonicalization is required", nil)
	}
	return nil
}

func requestDigest(request protocol.OperationRequest, canonicalizer Canonicalizer) (string, error) {
	raw, err := json.Marshal(request)
	if err != nil {
		return "", typedError("INTERNAL_ERROR", request.Operation, "cannot serialize request for idempotency", err)
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", typedError("INTERNAL_ERROR", request.Operation, "cannot project request for idempotency", err)
	}
	// Protocol v1alpha1 excludes exactly request_id. Derived event/timestamp IDs,
	// resolved refs and replay linkage are output state and never enter this map.
	delete(value, "request_id")
	projected, err := json.Marshal(value)
	if err != nil {
		return "", typedError("INTERNAL_ERROR", request.Operation, "cannot serialize idempotency projection", err)
	}
	canonical, err := canonicalizer.Canonicalize(projected)
	if err != nil {
		return "", typedError("CAPABILITY_UNSUPPORTED", request.Operation, "RFC 8785 canonicalization failed", err)
	}
	digest := sha256.Sum256(canonical)
	return fmt.Sprintf("sha256:%x", digest), nil
}

func openTargetRoot(targetRoot string) (*os.Root, string, error) {
	if runtime.GOOS == "windows" || runtime.GOOS == "plan9" || runtime.GOOS == "js" || runtime.GOOS == "wasip1" {
		return nil, "", typedError("ATOMICITY_UNSUPPORTED", targetRoot, "repo-docs requires Unix same-filesystem rename and directory fsync semantics", nil)
	}
	info, err := os.Lstat(targetRoot)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, "", typedError("IDENTITY_AMBIGUOUS", targetRoot, "target root must be an existing non-symlink directory", err)
	}
	resolved, err := filepath.EvalSymlinks(targetRoot)
	if err != nil || !filepath.IsAbs(resolved) {
		return nil, "", typedError("IDENTITY_AMBIGUOUS", targetRoot, "target root cannot be canonically resolved", err)
	}
	// Open the canonical path rather than the caller spelling: OpenRoot follows
	// symlinks in its root name even though descendant operations are confined.
	root, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, "", typedError("ATOMICITY_UNSUPPORTED", targetRoot, "cannot open a traversal-resistant target root", err)
	}
	openedInfo, openedErr := root.Stat(".")
	currentInfo, currentErr := os.Lstat(resolved)
	if openedErr != nil || currentErr != nil || currentInfo.Mode()&os.ModeSymlink != 0 ||
		!currentInfo.IsDir() || !os.SameFile(openedInfo, currentInfo) {
		_ = root.Close()
		return nil, "", typedError("ATOMICITY_UNSUPPORTED", targetRoot, "canonical target root changed while it was opened", errors.Join(openedErr, currentErr))
	}
	return root, resolved, nil
}

func loadExisting(root *os.Root, projectPath, resolvedTarget string, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (ProjectState, bool, error) {
	projectInfo, projectStatErr := root.Lstat(projectPath)
	if errors.Is(projectStatErr, fs.ErrNotExist) {
		return ProjectState{}, false, nil
	}
	if projectStatErr != nil || !projectInfo.IsDir() || projectInfo.Mode()&os.ModeSymlink != 0 {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "published project path is not a real directory", projectStatErr)
	}
	entries, err := fs.ReadDir(root.FS(), projectPath)
	if err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "cannot enumerate project authority", err)
	}
	var projectFound, eventsFound bool
	for _, entry := range entries {
		entryPath := path.Join(projectPath, entry.Name())
		info, statErr := root.Lstat(entryPath)
		if statErr != nil || info.Mode()&os.ModeSymlink != 0 {
			return ProjectState{}, false, typedError("CORRUPT_LEDGER", entryPath, "project authority contains an unreadable or symlinked entry", statErr)
		}
		switch entry.Name() {
		case projectFile:
			if !info.Mode().IsRegular() {
				return ProjectState{}, false, typedError("CORRUPT_LEDGER", entryPath, "project.json must be a regular file", nil)
			}
			projectFound = true
		case eventsFile:
			if !info.Mode().IsRegular() {
				return ProjectState{}, false, typedError("CORRUPT_LEDGER", entryPath, "events.jsonl must be a regular file", nil)
			}
			eventsFound = true
		case "changes":
			if !info.IsDir() {
				return ProjectState{}, false, typedError("CORRUPT_LEDGER", entryPath, "changes must be a real directory", nil)
			}
		default:
			return ProjectState{}, false, typedError("CORRUPT_LEDGER", entryPath, "project authority contains an unknown entry", nil)
		}
	}
	if !projectFound || !eventsFound {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "project authority requires regular project.json and events.jsonl", nil)
	}
	projectBytes, err := root.ReadFile(path.Join(projectPath, projectFile))
	if err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "cannot read project authority", err)
	}
	eventBytes, err := root.ReadFile(path.Join(projectPath, eventsFile))
	if err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "project authority has no complete event log", err)
	}
	if err := schema.Validate(schemaProjectState, projectBytes); err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "project state violates its bundled schema", err)
	}
	if err := schema.Validate(schemaProjectInitialized, eventBytes); err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "initialization event violates its bundled schema", err)
	}
	state, event, err := decodeAuthority(projectBytes, eventBytes, validateJSON)
	if err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "published project authority is invalid", err)
	}
	validationClock := ClockFunc(func() time.Time { return time.Unix(1, 0).UTC() })
	if err := validateInit(state.OriginalRequest, resolvedTarget, validationClock, canonicalizer, validateJSON); err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "original request no longer satisfies the init contract", err)
	}
	eventURI := path.Join(projectPath, eventsFile)
	durableDigest, digestErr := requestDigest(state.OriginalRequest, canonicalizer)
	if digestErr != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "cannot re-canonicalize original request", digestErr)
	}
	dogmaResource, eventResource, resourcesOK := authoritativeResources(state.Resources)
	expectedDogmaResource := state.ResolvedContext.DogmaRef.Source
	expectedDogmaResource.Digest = state.ResolvedContext.DogmaRef.Digest
	expectedResolved := protocol.ContextFromRequest(state.OriginalRequest)
	expectedResolved.ProjectRef.Target.CanonicalPath = resolvedTarget
	if state.Event.EventID != event.EventID || state.Event.Kind != projectEvent || state.Event.LineNumber != 1 ||
		state.Event.Resource.URI != eventURI || state.Event.Resource.Digest != fmt.Sprintf("sha256:%x", sha256.Sum256(eventBytes)) ||
		state.Idempotency.RequestDigest != durableDigest || state.Idempotency.RequestDigest != event.RequestDigest ||
		state.Idempotency.Key != state.OriginalRequest.IdempotencyKey || state.Idempotency.OriginalRequestID != state.OriginalRequest.RequestID ||
		state.ProtocolVersion != state.OriginalRequest.ProtocolVersion || state.Operation != state.OriginalRequest.Operation ||
		state.ProjectRef.ProjectID != event.ProjectID ||
		state.ResolvedContext.ProjectRef.ProjectID != state.ProjectRef.ProjectID ||
		state.ResolvedContext.ArtifactStoreRef.ProjectID != state.ProjectRef.ProjectID ||
		state.ResolvedContext.ArtifactStoreRef.Namespace != projectPath ||
		state.ResolvedContext.ArtifactStoreRef.StoreRefID != state.ResolvedContext.ProjectRef.ArtifactStoreRefID ||
		state.ResolvedContext.DogmaRef.DogmaID != state.ResolvedContext.ProjectRef.DogmaRefID ||
		!reflect.DeepEqual(state.ProjectRef, state.ResolvedContext.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext, expectedResolved) ||
		!reflect.DeepEqual(state.ResolvedContext.DogmaRef, event.DogmaRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ProjectRef, event.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ArtifactStoreRef, event.ArtifactStoreRef) ||
		!reflect.DeepEqual(state.OriginalRequest.Actor, event.Actor) ||
		!resourcesOK || !reflect.DeepEqual(dogmaResource, expectedDogmaResource) ||
		!reflect.DeepEqual(eventResource, state.Event.Resource) {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "project state and initialization event disagree", nil)
	}
	return state, true, nil
}

func decodeAuthority(projectBytes, eventBytes []byte, validateJSON JSONValidator) (ProjectState, ProjectInitialized, error) {
	var state ProjectState
	if err := decodeSingleJSON(projectBytes, &state, validateJSON); err != nil {
		return ProjectState{}, ProjectInitialized{}, err
	}
	lines := bytes.Split(bytes.TrimSpace(eventBytes), []byte{'\n'})
	if len(lines) != 1 || len(lines[0]) == 0 {
		return ProjectState{}, ProjectInitialized{}, fmt.Errorf("events.jsonl must contain exactly one event")
	}
	var event ProjectInitialized
	if err := decodeSingleJSON(lines[0], &event, validateJSON); err != nil {
		return ProjectState{}, ProjectInitialized{}, err
	}
	if _, err := time.Parse(time.RFC3339, state.InitializedAt); err != nil {
		return ProjectState{}, ProjectInitialized{}, fmt.Errorf("initialized_at is not RFC3339: %w", err)
	}
	if _, err := time.Parse(time.RFC3339, event.OccurredAt); err != nil {
		return ProjectState{}, ProjectInitialized{}, fmt.Errorf("event occurred_at is not RFC3339: %w", err)
	}
	if state.SchemaVersion != stateSchema || state.ProtocolVersion != protocol.Version || state.ProjectRef.ProjectID == "" || state.Operation != "virgil.init" || state.State != "initialized" ||
		state.Idempotency.Key == "" || state.Idempotency.RequestDigest == "" || state.Idempotency.OriginalRequestID == "" ||
		state.OriginalRequest.RequestID == "" || state.InitializedAt == "" || state.Event.EventID == "" || state.Event.LineNumber != 1 ||
		state.Event.Resource.URI == "" || state.Event.Resource.Digest == "" || len(state.Resources) != 2 ||
		!validSHA256(state.Idempotency.RequestDigest) || !validSHA256(state.Event.Resource.Digest) ||
		event.SchemaVersion != eventSchema || event.ProtocolVersion != protocol.Version || event.EventID == "" || event.Kind != projectEvent ||
		event.Operation != state.Operation || event.IdempotencyKey != state.Idempotency.Key ||
		!validSHA256(event.RequestDigest) || event.RequestID != state.Idempotency.OriginalRequestID || event.CausationID != event.RequestID || event.OccurredAt != state.InitializedAt ||
		event.Actor.ActorID == "" || event.ProjectRef.ProjectID != event.ProjectID ||
		event.DogmaRef.DogmaID != event.ProjectRef.DogmaRefID ||
		event.ArtifactStoreRef.ProjectID != event.ProjectID ||
		event.ArtifactStoreRef.StoreRefID != event.ProjectRef.ArtifactStoreRefID {
		return ProjectState{}, ProjectInitialized{}, fmt.Errorf("authority version or event kind is invalid")
	}
	return state, event, nil
}

func authoritativeResources(resources []ProjectResource) (protocol.ResourceRef, protocol.ResourceRef, bool) {
	if len(resources) != 2 {
		return protocol.ResourceRef{}, protocol.ResourceRef{}, false
	}
	var dogma, eventLog protocol.ResourceRef
	for _, resource := range resources {
		if resource.Resource.URI == "" || !validSHA256(resource.Resource.Digest) {
			return protocol.ResourceRef{}, protocol.ResourceRef{}, false
		}
		switch resource.Role {
		case "dogma":
			if dogma.URI != "" {
				return protocol.ResourceRef{}, protocol.ResourceRef{}, false
			}
			dogma = resource.Resource
		case "event_log":
			if eventLog.URI != "" {
				return protocol.ResourceRef{}, protocol.ResourceRef{}, false
			}
			eventLog = resource.Resource
		default:
			return protocol.ResourceRef{}, protocol.ResourceRef{}, false
		}
	}
	return dogma, eventLog, dogma.URI != "" && eventLog.URI != ""
}

func decodeSingleJSON(document []byte, target any, validateJSON JSONValidator) error {
	if err := validateJSON(document); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

type publishError struct {
	Cause error
}

func (err *publishError) Error() string {
	return "atomic project publication failed: " + err.Cause.Error()
}
func (err *publishError) Unwrap() error { return err.Cause }

func replayResult(request protocol.OperationRequest, state ProjectState, digest string) (protocol.OperationResult, error) {
	if state.ProjectRef.ProjectID != request.ProjectRef.ProjectID || state.Operation != request.Operation || state.Idempotency.Key != request.IdempotencyKey {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.ProjectRef.ProjectID, "project is already initialized by a different intention", nil)
	}
	if state.Idempotency.RequestDigest != digest {
		return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different request digest", nil)
	}
	resolved := state.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:     request.ProtocolVersion,
		Operation:           request.Operation,
		RequestID:           request.RequestID,
		IdempotencyKey:      request.IdempotencyKey,
		ReplayedFromRequest: state.Idempotency.OriginalRequestID,
		Status:              "success",
		RequestedContext:    protocol.ContextFromRequest(request),
		ResolvedContext:     &resolved,
		DerivedStep:         "idea",
		Artifacts:           []protocol.ObjectPointer{},
		Briefs:              []protocol.ObjectPointer{},
		Events:              []protocol.ObjectPointer{operationEventPointer(state)},
		Effects:             []protocol.EffectRecord{},
		Next: protocol.NextAction{
			Operation: "virgil.new",
			Condition: "project is initialized and ready for a change",
		},
		Diagnostics: []protocol.Diagnostic{},
	}, nil
}

func resolvedContext(request protocol.OperationRequest, resolvedTarget string) protocol.Context {
	context := protocol.ContextFromRequest(request)
	context.ProjectRef.Target.CanonicalPath = resolvedTarget
	return context
}

func buildPublication(request protocol.OperationRequest, digest, initializedAt string, resolved protocol.Context) (ProjectState, ProjectInitialized, []byte, []byte, error) {
	eventID := stableID("event", request.ProjectRef.ProjectID, request.Operation, request.IdempotencyKey, digest)
	event := ProjectInitialized{
		SchemaVersion:    eventSchema,
		ProtocolVersion:  request.ProtocolVersion,
		EventID:          eventID,
		Kind:             projectEvent,
		ProjectID:        request.ProjectRef.ProjectID,
		Operation:        request.Operation,
		IdempotencyKey:   request.IdempotencyKey,
		RequestDigest:    digest,
		RequestID:        request.RequestID,
		CausationID:      request.RequestID,
		OccurredAt:       initializedAt,
		Actor:            request.Actor,
		DogmaRef:         resolved.DogmaRef,
		ProjectRef:       resolved.ProjectRef,
		ArtifactStoreRef: resolved.ArtifactStoreRef,
	}
	eventURI := path.Join(request.ArtifactStoreRef.Namespace, eventsFile)
	eventBytes, err := json.Marshal(event)
	if err != nil {
		return ProjectState{}, ProjectInitialized{}, nil, nil, err
	}
	eventBytes = append(eventBytes, '\n')
	eventResource := withDigest(protocol.ResourceRef{URI: eventURI}, eventBytes)
	dogmaResource := resolved.DogmaRef.Source
	dogmaResource.Digest = resolved.DogmaRef.Digest
	state := ProjectState{
		SchemaVersion:   stateSchema,
		ProtocolVersion: request.ProtocolVersion,
		ProjectRef:      resolved.ProjectRef,
		Operation:       request.Operation,
		State:           "initialized",
		Idempotency: IdempotencyRecord{
			Key:               request.IdempotencyKey,
			RequestDigest:     digest,
			OriginalRequestID: request.RequestID,
		},
		OriginalRequest: request,
		InitializedAt:   initializedAt,
		ResolvedContext: resolved,
		Event: EventPointer{
			EventID:    eventID,
			Kind:       projectEvent,
			LineNumber: 1,
			Resource:   eventResource,
		},
		Resources: []ProjectResource{
			{Role: "dogma", Resource: dogmaResource},
			{Role: "event_log", Resource: eventResource},
		},
	}
	// project.json cannot contain a digest of its own final bytes without a
	// circular fixed-point problem. Its ResourceRef intentionally has URI only;
	// callers calculate the observation digest after durable publication.
	projectBytes, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return ProjectState{}, ProjectInitialized{}, nil, nil, err
	}
	projectBytes = append(projectBytes, '\n')
	return state, event, projectBytes, eventBytes, nil
}

func publish(root *os.Root, projectPath string, projectBytes, eventBytes []byte) error {
	parent := path.Dir(projectPath)
	if err := createDirectoryChain(root, parent); err != nil {
		return err
	}
	if err := syncDirectoryChain(root, parent); err != nil {
		return err
	}

	tempName := ".init-" + stableID("tmp", projectPath, fmt.Sprintf("%x", sha256.Sum256(projectBytes)))
	tempPath := path.Join(parent, tempName)
	if err := root.Mkdir(tempPath, 0o700); err != nil {
		if !errors.Is(err, fs.ErrExist) {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create exclusive sibling staging directory", err)
		}
		if removeErr := root.RemoveAll(tempPath); removeErr != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot recover crashed staging directory", errors.Join(err, removeErr))
		}
		if err := root.Mkdir(tempPath, 0o700); err != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create staging directory after crash recovery", err)
		}
	}
	published := false
	defer func() {
		if !published {
			_ = root.RemoveAll(tempPath)
		}
	}()

	if err := writeExclusive(root, path.Join(tempPath, projectFile), projectBytes); err != nil {
		return err
	}
	if err := writeExclusive(root, path.Join(tempPath, eventsFile), eventBytes); err != nil {
		return err
	}
	if err := syncDirectory(root, tempPath); err != nil {
		return err
	}
	if err := root.Rename(tempPath, projectPath); err != nil {
		return &publishError{Cause: err}
	}
	published = true
	if err := syncDirectory(root, parent); err != nil {
		return err
	}
	return nil
}

func createDirectoryChain(root *os.Root, relative string) error {
	current := ""
	for _, component := range strings.Split(relative, "/") {
		if component == "" {
			continue
		}
		current = path.Join(current, component)
		info, err := root.Lstat(current)
		if errors.Is(err, fs.ErrNotExist) {
			mkdirErr := root.Mkdir(current, 0o700)
			info, err = root.Lstat(current)
			if mkdirErr != nil && (err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
				return typedError("ATOMICITY_UNSUPPORTED", current, "cannot create managed directory component exclusively", mkdirErr)
			}
		}
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return typedError("STORE_POLICY_VIOLATION", current, "managed path contains a symlink or non-directory component", err)
		}
	}
	return nil
}

func syncDirectoryChain(root *os.Root, relative string) error {
	directories := []string{"."}
	current := ""
	for _, component := range strings.Split(relative, "/") {
		if component == "" {
			continue
		}
		current = path.Join(current, component)
		directories = append(directories, current)
	}
	for index := len(directories) - 1; index >= 0; index-- {
		if err := syncDirectory(root, directories[index]); err != nil {
			return err
		}
	}
	return nil
}

func writeExclusive(root *os.Root, relative string, content []byte) error {
	file, err := root.OpenFile(relative, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "cannot create exclusive staged file", err)
	}
	if _, err = file.Write(content); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "cannot durably write staged file", err)
	}
	if closeErr != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "cannot close staged file", closeErr)
	}
	return nil
}

func syncDirectory(root *os.Root, relative string) error {
	directory, err := root.Open(relative)
	if err != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "cannot open directory for durability sync", err)
	}
	err = directory.Sync()
	closeErr := directory.Close()
	if err != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "filesystem does not guarantee directory durability", err)
	}
	if closeErr != nil {
		return typedError("ATOMICITY_UNSUPPORTED", relative, "cannot close synced directory", closeErr)
	}
	return nil
}

func successResult(request protocol.OperationRequest, state ProjectState, event ProjectInitialized, projectBytes, eventBytes []byte) protocol.OperationResult {
	projectResource := withDigest(protocol.ResourceRef{URI: path.Join(request.ArtifactStoreRef.Namespace, projectFile)}, projectBytes)
	eventResource := withDigest(state.Event.Resource, eventBytes)
	eventPointer := operationEventPointer(state)
	eventPointer.Resource = &eventResource
	resolved := state.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      "idea",
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{eventPointer},
		Effects: []protocol.EffectRecord{
			writeEffect(request, "project", projectResource, eventResource, len(projectBytes)),
			writeEffect(request, "event", eventResource, eventResource, len(eventBytes)),
		},
		Next: protocol.NextAction{
			Operation: "virgil.new",
			Condition: "project is initialized and ready for a change",
		},
		Diagnostics: []protocol.Diagnostic{},
	}
}

func operationEventPointer(state ProjectState) protocol.ObjectPointer {
	resource := state.Event.Resource
	return protocol.ObjectPointer{
		ObjectID: state.Event.EventID,
		Kind:     state.Event.Kind,
		Revision: state.Idempotency.RequestDigest,
		Resource: &resource,
	}
}

func validatePublication(schema SchemaValidator, projectBytes, eventBytes []byte, result protocol.OperationResult) error {
	if err := schema.Validate(schemaProjectState, projectBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated project state violates its bundled schema", err)
	}
	if err := schema.Validate(schemaProjectInitialized, eventBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated initialization event violates its bundled schema", err)
	}
	validated, err := validateResult(schema, result, nil)
	if err != nil {
		return err
	}
	_ = validated
	return nil
}

func validateResult(schema SchemaValidator, result protocol.OperationResult, operationErr error) (protocol.OperationResult, error) {
	if operationErr != nil {
		return protocol.OperationResult{}, operationErr
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "cannot encode OperationResult", err)
	}
	if err := schema.Validate(schemaOperationResult, raw); err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "OperationResult violates its bundled schema", err)
	}
	for _, effect := range result.Effects {
		rawEffect, marshalErr := json.Marshal(effect)
		if marshalErr != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "cannot encode EffectRecord", marshalErr)
		}
		if validateErr := schema.Validate(schemaEffectRecord, rawEffect); validateErr != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "EffectRecord violates its bundled schema", validateErr)
		}
	}
	return result, nil
}

func writeEffect(request protocol.OperationRequest, suffix string, resource, evidence protocol.ResourceRef, size int) protocol.EffectRecord {
	return protocol.EffectRecord{
		ProtocolVersion: request.ProtocolVersion,
		EffectID:        stableID("effect", request.RequestID, suffix, resource.Digest),
		RequestID:       request.RequestID,
		CausationID:     request.RequestID,
		Kind:            "write",
		Resource:        resource,
		Adapter:         request.ArtifactStoreRef.Adapter,
		Capability:      "artifact_store.write",
		PolicyDecision:  "authorized",
		Requested: map[string]any{
			"operation": request.Operation,
			"resource":  resource.URI,
		},
		Occurred: true,
		Observed: map[string]any{
			"published_atomically": true,
			"size_bytes":           size,
		},
		StateAfter: &resource,
		Evidence:   []protocol.ResourceRef{evidence},
	}
}

func withDigest(resource protocol.ResourceRef, content []byte) protocol.ResourceRef {
	digest := sha256.Sum256(content)
	resource.Digest = fmt.Sprintf("sha256:%x", digest)
	return resource
}

func stableID(parts ...string) string {
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return fmt.Sprintf("sha256:%x", digest)
}

func validSHA256(value string) bool {
	if len(value) != len("sha256:")+sha256.Size*2 || !strings.HasPrefix(value, "sha256:") {
		return false
	}
	for _, character := range value[len("sha256:"):] {
		if !strings.ContainsRune("0123456789abcdef", character) {
			return false
		}
	}
	return true
}

func safeRelativePath(value string) bool {
	return value != "" && value != "." && value != ".." &&
		!strings.Contains(value, "/") && !strings.Contains(value, "\\") &&
		path.Clean(value) == value
}

func allowedByWritePolicy(namespace string, allowlist []string) bool {
	return len(allowlist) == 1 && allowlist[0] == managedRoot+"/**" &&
		strings.HasPrefix(namespace, managedRoot+"/")
}

func safeRelativeResourcePath(value string) bool {
	if value == "" || path.IsAbs(value) || strings.Contains(value, "\\") {
		return false
	}
	cleaned := path.Clean(value)
	if cleaned != value || cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return false
	}
	return true
}

func indexOf(list []string, value string) int {
	for index, candidate := range list {
		if candidate == value {
			return index
		}
	}
	return -1
}

func provenanceKindForActor(actor protocol.ActorRef) string {
	if actor.Kind == "human" {
		return "human_input"
	}
	return "external_system"
}

// revisionRecord pairs a decoded RevisionEnvelope with its identity and its
// path relative to the os.Root, so handlers can locate and rewrite it.
type revisionRecord struct {
	ID       string
	Path     string
	Envelope protocol.RevisionEnvelope
}

// listRevisions enumerates the published (non-staging) revisions of one
// artifact kind under a change's artifacts/ directory, decoding and
// schema-validating every envelope.json found. A missing artifacts/{kind}
// directory is not an error: it simply means no revision has been proposed
// yet for that kind.
func listRevisions(root *os.Root, changePath, artifactKind string, schema SchemaValidator, validateJSON JSONValidator) ([]revisionRecord, error) {
	kindPath := path.Join(changePath, "artifacts", artifactKind)
	info, statErr := root.Lstat(kindPath)
	if errors.Is(statErr, fs.ErrNotExist) {
		return nil, nil
	}
	if statErr != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, typedError("CORRUPT_LEDGER", kindPath, "artifact kind path is not a real directory", statErr)
	}
	entries, err := fs.ReadDir(root.FS(), kindPath)
	if err != nil {
		return nil, typedError("CORRUPT_LEDGER", kindPath, "cannot enumerate artifact revisions", err)
	}
	records := make([]revisionRecord, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			// Crashed staging directories are never published under a
			// non-dot name; ignore them rather than treating them as
			// corruption.
			continue
		}
		revPath := path.Join(kindPath, name)
		revInfo, statErr := root.Lstat(revPath)
		if statErr != nil || !revInfo.IsDir() || revInfo.Mode()&os.ModeSymlink != 0 {
			return nil, typedError("CORRUPT_LEDGER", revPath, "revision path is not a real directory", statErr)
		}
		envelopePath := path.Join(revPath, "envelope.json")
		envelopeBytes, readErr := root.ReadFile(envelopePath)
		if readErr != nil {
			return nil, typedError("CORRUPT_LEDGER", envelopePath, "cannot read revision envelope", readErr)
		}
		if err := schema.Validate(schemaRevisionEnvelope, envelopeBytes); err != nil {
			return nil, typedError("CORRUPT_LEDGER", envelopePath, "revision envelope violates its bundled schema", err)
		}
		var envelope protocol.RevisionEnvelope
		if err := decodeSingleJSON(envelopeBytes, &envelope, validateJSON); err != nil {
			return nil, typedError("CORRUPT_LEDGER", envelopePath, "revision envelope is not valid JSON", err)
		}
		if envelope.RevisionID != name || envelope.ArtifactKind != artifactKind {
			return nil, typedError("CORRUPT_LEDGER", envelopePath, "revision envelope identity does not match its path", nil)
		}
		records = append(records, revisionRecord{ID: name, Path: revPath, Envelope: envelope})
	}
	return records, nil
}

// nextRevisionID assigns the next sequential revision identifier for an
// artifact kind. Only durably published (renamed) revisions are counted, so
// a crash before publication never produces a gap or a collision.
func nextRevisionID(existing []revisionRecord) string {
	return fmt.Sprintf("rev-%06d", len(existing)+1)
}

// computeDerivedStep is always recomputed as a query over durable revisions;
// it is never itself persisted by virgil.continue. A step is "effective"
// once exactly one of its revisions carries state == "approved" — the
// approval handler maintains the invariant that at most one revision per
// artifact kind is ever in that state at a time (superseding any prior
// approval before applying a new one).
func computeDerivedStep(root *os.Root, changePath string, schema SchemaValidator, validateJSON JSONValidator) (string, error) {
	for _, kind := range artifactStepOrder {
		records, err := listRevisions(root, changePath, kind, schema, validateJSON)
		if err != nil {
			return "", err
		}
		effective := false
		for _, record := range records {
			if record.Envelope.State == "approved" {
				effective = true
				break
			}
		}
		if !effective {
			return kind, nil
		}
	}
	return "complete", nil
}

// upstreamRefsFor links a freshly drafted revision to the effective approved
// revision of the immediately preceding artifact step, when one exists.
func upstreamRefsFor(root *os.Root, changePath, artifactKind string, schema SchemaValidator, validateJSON JSONValidator) ([]protocol.UpstreamRef, error) {
	index := indexOf(artifactStepOrder, artifactKind)
	if index <= 0 {
		return []protocol.UpstreamRef{}, nil
	}
	previousKind := artifactStepOrder[index-1]
	records, err := listRevisions(root, changePath, previousKind, schema, validateJSON)
	if err != nil {
		return nil, err
	}
	for _, record := range records {
		if record.Envelope.State == "approved" {
			return []protocol.UpstreamRef{{RevisionID: record.ID, ArtifactKind: previousKind}}, nil
		}
	}
	return []protocol.UpstreamRef{}, nil
}

// appendLifecycleEvents durably appends candidate revision lifecycle events
// to a change's events.jsonl using copy-rewrite-rename. Any candidate whose
// (kind, artifact_kind, revision_id) triple already exists in the log is
// silently skipped, which makes this call idempotent: replays and
// crash-recovery retries that present the same candidates converge without
// duplicating events. artifact_kind must be part of the key because revision
// numbering restarts at rev-000001 for every artifact kind — keying on
// (kind, revision_id) alone would treat spec's first revision_drafted event
// as a duplicate of idea's, since both carry revision_id "rev-000001". It
// returns the events that were actually appended and the resulting full
// file content.
func appendLifecycleEvents(root *os.Root, changePath string, candidates []protocol.RevisionLifecycleEvent, schema SchemaValidator) ([]protocol.RevisionLifecycleEvent, []byte, error) {
	eventsPath := path.Join(changePath, eventsFile)
	existingBytes, err := root.ReadFile(eventsPath)
	if err != nil {
		return nil, nil, typedError("CORRUPT_LEDGER", eventsPath, "cannot read change event log", err)
	}
	existingKeys := make(map[string]bool)
	lines := bytes.Split(bytes.TrimSpace(existingBytes), []byte{'\n'})
	for index, line := range lines {
		if len(line) == 0 || index == 0 {
			// Line 0 is the immutable change_created event, never a
			// lifecycle event candidate.
			continue
		}
		var probe struct {
			Kind         string `json:"kind"`
			ArtifactKind string `json:"artifact_kind"`
			RevisionID   string `json:"revision_id"`
		}
		if err := json.Unmarshal(line, &probe); err != nil {
			return nil, nil, typedError("CORRUPT_LEDGER", eventsPath, "cannot decode existing lifecycle event", err)
		}
		existingKeys[probe.Kind+"\x00"+probe.ArtifactKind+"\x00"+probe.RevisionID] = true
	}

	appended := make([]protocol.RevisionLifecycleEvent, 0, len(candidates))
	updated := append([]byte(nil), existingBytes...)
	for _, candidate := range candidates {
		key := candidate.Kind + "\x00" + candidate.ArtifactKind + "\x00" + candidate.RevisionID
		if existingKeys[key] {
			continue
		}
		eventBytes, err := json.Marshal(candidate)
		if err != nil {
			return nil, nil, typedError("INTERNAL_ERROR", eventsPath, "cannot encode lifecycle event", err)
		}
		if err := schema.Validate(schemaRevisionLifecycleEvent, eventBytes); err != nil {
			return nil, nil, typedError("INTERNAL_ERROR", eventsPath, "generated lifecycle event violates its bundled schema", err)
		}
		eventBytes = append(eventBytes, '\n')
		updated = append(updated, eventBytes...)
		appended = append(appended, candidate)
		existingKeys[key] = true
	}
	if len(appended) == 0 {
		return nil, existingBytes, nil
	}

	tempPath := path.Join(changePath, ".events-"+stableID("tmp", eventsPath, fmt.Sprintf("%x", sha256.Sum256(updated))))
	if err := root.Remove(tempPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, nil, typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot clear crashed staging file", err)
	}
	if err := writeExclusive(root, tempPath, updated); err != nil {
		return nil, nil, err
	}
	if err := root.Rename(tempPath, eventsPath); err != nil {
		_ = root.Remove(tempPath)
		return nil, nil, typedError("ATOMICITY_UNSUPPORTED", eventsPath, "cannot atomically replace change event log", err)
	}
	if err := syncDirectory(root, changePath); err != nil {
		return nil, nil, err
	}
	return appended, updated, nil
}

// rewriteEnvelope durably replaces a revision's envelope.json using
// copy-rewrite-rename.
func rewriteEnvelope(root *os.Root, revisionPath string, envelope protocol.RevisionEnvelope, schema SchemaValidator) ([]byte, error) {
	envelopeBytes, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return nil, typedError("INTERNAL_ERROR", revisionPath, "cannot encode revision envelope", err)
	}
	envelopeBytes = append(envelopeBytes, '\n')
	if err := schema.Validate(schemaRevisionEnvelope, envelopeBytes); err != nil {
		return nil, typedError("INTERNAL_ERROR", revisionPath, "generated revision envelope violates its bundled schema", err)
	}
	envelopePath := path.Join(revisionPath, "envelope.json")
	tempPath := path.Join(revisionPath, ".envelope-"+stableID("tmp", envelopePath, fmt.Sprintf("%x", sha256.Sum256(envelopeBytes))))
	if err := root.Remove(tempPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot clear crashed staging file", err)
	}
	if err := writeExclusive(root, tempPath, envelopeBytes); err != nil {
		return nil, err
	}
	if err := root.Rename(tempPath, envelopePath); err != nil {
		_ = root.Remove(tempPath)
		return nil, typedError("ATOMICITY_UNSUPPORTED", envelopePath, "cannot atomically replace revision envelope", err)
	}
	if err := syncDirectory(root, revisionPath); err != nil {
		return nil, err
	}
	return envelopeBytes, nil
}

// publishRevision atomically publishes a brand-new revision directory
// (envelope.json + content.md) using the same stage-then-rename pattern as
// publishChange: build the directory under a hidden sibling name, then
// rename it into place. Because the final name never exists until the
// rename succeeds, a crash mid-publication never leaves a partially visible
// revision for listRevisions to observe.
func publishRevision(root *os.Root, changePath, artifactKind, revisionID string, envelopeBytes, contentBytes []byte) error {
	kindPath := path.Join(changePath, "artifacts", artifactKind)
	if err := createDirectoryChain(root, kindPath); err != nil {
		return err
	}
	if err := syncDirectoryChain(root, kindPath); err != nil {
		return err
	}

	revisionPath := path.Join(kindPath, revisionID)
	tempName := ".rev-" + stableID("tmp", revisionPath, fmt.Sprintf("%x", sha256.Sum256(envelopeBytes)))
	tempPath := path.Join(kindPath, tempName)
	if err := root.Mkdir(tempPath, 0o700); err != nil {
		if !errors.Is(err, fs.ErrExist) {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create exclusive sibling staging directory", err)
		}
		if removeErr := root.RemoveAll(tempPath); removeErr != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot recover crashed staging directory", errors.Join(err, removeErr))
		}
		if err := root.Mkdir(tempPath, 0o700); err != nil {
			return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create staging directory after crash recovery", err)
		}
	}
	published := false
	defer func() {
		if !published {
			_ = root.RemoveAll(tempPath)
		}
	}()

	if err := writeExclusive(root, path.Join(tempPath, "envelope.json"), envelopeBytes); err != nil {
		return err
	}
	if err := writeExclusive(root, path.Join(tempPath, "content.md"), contentBytes); err != nil {
		return err
	}
	if err := syncDirectory(root, tempPath); err != nil {
		return err
	}
	if err := root.Rename(tempPath, revisionPath); err != nil {
		return typedError("ATOMICITY_UNSUPPORTED", revisionPath, "cannot atomically publish revision directory", err)
	}
	published = true
	if err := syncDirectory(root, kindPath); err != nil {
		return err
	}
	return nil
}

// handleContentProposal implements the content_proposal entry: it drafts a
// revision as "awaiting_approval" in one publication and persists both the
// revision_drafted and revision_submitted lifecycle events, per the Slice 1
// architecture decision that a content proposal both drafts and submits in
// the same invocation.
func handleContentProposal(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, changePath, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	derivedStep, err := computeDerivedStep(root, changePath, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	if derivedStep == "complete" {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactKind, "all required artifacts already have an effective approved revision", nil)
	}
	if entry.ArtifactKind != derivedStep {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactKind, "content proposal does not target the current derived step", nil)
	}

	if !safeRelativeResourcePath(entry.Content.URI) {
		return protocol.OperationResult{}, typedError("STORE_POLICY_VIOLATION", entry.Content.URI, "content resource must be a safe relative path", nil)
	}
	contentBytes, err := root.ReadFile(entry.Content.URI)
	if err != nil {
		return protocol.OperationResult{}, typedError("CORRUPT_LEDGER", entry.Content.URI, "cannot read the proposed content resource", err)
	}
	contentDigest := withDigest(protocol.ResourceRef{}, contentBytes).Digest
	if entry.Content.Digest != "" && entry.Content.Digest != contentDigest {
		return protocol.OperationResult{}, typedError("CORRUPT_LEDGER", entry.Content.URI, "content resource digest does not match its declared reference", nil)
	}

	existing, err := listRevisions(root, changePath, entry.ArtifactKind, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	var target *revisionRecord
	for index := range existing {
		if existing[index].Envelope.IdempotencyKey != request.IdempotencyKey {
			continue
		}
		if existing[index].Envelope.Content.Digest != contentDigest {
			return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different content proposal", nil)
		}
		target = &existing[index]
		break
	}

	var envelope protocol.RevisionEnvelope
	var revisionPath string
	var envelopeBytes []byte
	created := false
	if target != nil {
		envelope = target.Envelope
		revisionPath = target.Path
	} else {
		revisionID := nextRevisionID(existing)
		revisionPath = path.Join(changePath, "artifacts", entry.ArtifactKind, revisionID)
		contentResource := withDigest(protocol.ResourceRef{URI: path.Join(revisionPath, "content.md")}, contentBytes)
		upstreamRefs, upstreamErr := upstreamRefsFor(root, changePath, entry.ArtifactKind, schema, validateJSON)
		if upstreamErr != nil {
			return protocol.OperationResult{}, upstreamErr
		}
		envelope = protocol.RevisionEnvelope{
			SchemaVersion:   revisionEnvelopeSchema,
			ProtocolVersion: request.ProtocolVersion,
			RevisionID:      revisionID,
			ArtifactKind:    entry.ArtifactKind,
			ChangeID:        input.ChangeID,
			ProjectID:       request.ProjectRef.ProjectID,
			State:           "awaiting_approval",
			UpstreamRefs:    upstreamRefs,
			Content:         contentResource,
			Provenance: protocol.SourceProvenance{
				Kind:       provenanceKindForActor(request.Actor),
				CapturedAt: nowStr,
				Source:     &protocol.ResourceRef{URI: entry.Content.URI, Digest: contentDigest},
			},
			CreatedAt:      nowStr,
			IdempotencyKey: request.IdempotencyKey,
			RequestID:      request.RequestID,
		}
		marshaled, marshalErr := json.MarshalIndent(envelope, "", "  ")
		if marshalErr != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", revisionPath, "cannot encode revision envelope", marshalErr)
		}
		envelopeBytes = append(marshaled, '\n')
		if err := schema.Validate(schemaRevisionEnvelope, envelopeBytes); err != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", revisionPath, "generated revision envelope violates its bundled schema", err)
		}
		if err := publishRevision(root, changePath, entry.ArtifactKind, revisionID, envelopeBytes, contentBytes); err != nil {
			return protocol.OperationResult{}, err
		}
		created = true
	}

	runRef := *request.RunRef
	draftedEvent := protocol.RevisionLifecycleEvent{
		SchemaVersion:   revisionLifecycleEventSchema,
		ProtocolVersion: request.ProtocolVersion,
		Kind:            revisionDraftedEvent,
		RevisionID:      envelope.RevisionID,
		ArtifactKind:    envelope.ArtifactKind,
		ChangeID:        input.ChangeID,
		ProjectID:       request.ProjectRef.ProjectID,
		Operation:       request.Operation,
		RequestID:       request.RequestID,
		IdempotencyKey:  request.IdempotencyKey,
		Actor:           request.Actor,
		Timestamp:       nowStr,
		RunRef:          runRef,
	}
	submittedEvent := draftedEvent
	submittedEvent.Kind = revisionSubmittedEvent

	appended, updatedEventsBytes, err := appendLifecycleEvents(root, changePath, []protocol.RevisionLifecycleEvent{draftedEvent, submittedEvent}, schema)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	effects := []protocol.EffectRecord{}
	if created {
		envelopeResource := withDigest(protocol.ResourceRef{URI: path.Join(revisionPath, "envelope.json")}, envelopeBytes)
		effects = append(effects,
			writeEffect(request, "revision-envelope", envelopeResource, envelopeResource, len(envelopeBytes)),
			writeEffect(request, "revision-content", envelope.Content, envelope.Content, len(contentBytes)),
		)
	}
	var replayedFrom string
	if !created && target != nil {
		replayedFrom = target.Envelope.RequestID
	}
	if len(appended) > 0 {
		eventsResource := withDigest(protocol.ResourceRef{URI: path.Join(changePath, eventsFile)}, updatedEventsBytes)
		effects = append(effects, writeEffect(request, "revision-lifecycle-events", eventsResource, eventsResource, len(updatedEventsBytes)))
	}

	eventPointers := make([]protocol.ObjectPointer, 0, len(appended))
	for _, event := range appended {
		eventPointers = append(eventPointers, protocol.ObjectPointer{
			ObjectID: stableID("event", input.ChangeID, event.Kind, event.RevisionID),
			Kind:     event.Kind,
			Revision: request.IdempotencyKey,
		})
	}

	resolved := resolvedContext(request, resolvedTarget)
	result := protocol.OperationResult{
		ProtocolVersion:     request.ProtocolVersion,
		Operation:           request.Operation,
		RequestID:           request.RequestID,
		IdempotencyKey:      request.IdempotencyKey,
		ReplayedFromRequest: replayedFrom,
		Status:              "needs_input",
		RequestedContext:    protocol.ContextFromRequest(request),
		ResolvedContext:     &resolved,
		DerivedStep:         derivedStep,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: envelope.RevisionID, Kind: "revision", Revision: envelope.Content.Digest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  eventPointers,
		Effects: effects,
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "approval required",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "APPROVAL_REQUIRED",
				Severity:   "info",
				Scope:      envelope.ArtifactKind,
				Condition:  fmt.Sprintf("revision %s of %s is awaiting_approval", envelope.RevisionID, envelope.ArtifactKind),
				NextAction: "submit an approval entry for this revision before continuing",
			},
		},
	}
	return result, nil
}

// handleApprovalApproved implements the approval entry with decision ==
// "approved". Approval is a monotonic gate: once a revision reaches
// "approved", repeating the same decision is a safe no-op rather than an
// error, so this handler is idempotent by resulting state rather than by
// strict idempotency-key matching.
func handleApprovalApproved(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, changePath, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	derivedStep, err := computeDerivedStep(root, changePath, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	if derivedStep == "complete" {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "all required artifacts already have an effective approved revision", nil)
	}
	if entry.ArtifactID != "" && entry.ArtifactID != derivedStep {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "artifact_id does not match the current derived step", nil)
	}

	records, err := listRevisions(root, changePath, derivedStep, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	var awaiting *revisionRecord
	var priorApproved *revisionRecord
	for index := range records {
		switch records[index].Envelope.State {
		case "awaiting_approval":
			if awaiting != nil {
				return protocol.OperationResult{}, typedError("CORRUPT_LEDGER", changePath, "more than one revision is awaiting approval for the derived step", nil)
			}
			awaiting = &records[index]
		case "approved":
			priorApproved = &records[index]
		}
	}
	if awaiting == nil {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", derivedStep, "no revision is awaiting approval for the current derived step", nil)
	}
	if entry.Revision != "" && entry.Revision != awaiting.ID {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.Revision, "approval revision does not match the revision awaiting approval", nil)
	}

	approvedActor := request.Actor
	approvedEnvelope := awaiting.Envelope
	approvedEnvelope.State = "approved"
	approvedEnvelope.ApprovedBy = &approvedActor
	approvedEnvelope.ApprovedAt = nowStr
	if _, err := rewriteEnvelope(root, awaiting.Path, approvedEnvelope, schema); err != nil {
		return protocol.OperationResult{}, err
	}

	runRef := *request.RunRef
	candidates := []protocol.RevisionLifecycleEvent{
		{
			SchemaVersion:   revisionLifecycleEventSchema,
			ProtocolVersion: request.ProtocolVersion,
			Kind:            revisionApprovedEvent,
			RevisionID:      awaiting.ID,
			ArtifactKind:    derivedStep,
			ChangeID:        input.ChangeID,
			ProjectID:       request.ProjectRef.ProjectID,
			Operation:       request.Operation,
			RequestID:       request.RequestID,
			IdempotencyKey:  request.IdempotencyKey,
			Actor:           request.Actor,
			Timestamp:       nowStr,
			RunRef:          runRef,
			ApprovedBy:      &approvedActor,
			Rationale:       entry.Rationale,
		},
	}

	artifacts := []protocol.ObjectPointer{
		{ObjectID: awaiting.ID, Kind: "revision", Revision: approvedEnvelope.Content.Digest},
	}

	if priorApproved != nil && priorApproved.ID != awaiting.ID {
		supersededEnvelope := priorApproved.Envelope
		supersededEnvelope.State = "superseded"
		if _, err := rewriteEnvelope(root, priorApproved.Path, supersededEnvelope, schema); err != nil {
			return protocol.OperationResult{}, err
		}
		candidates = append(candidates, protocol.RevisionLifecycleEvent{
			SchemaVersion:   revisionLifecycleEventSchema,
			ProtocolVersion: request.ProtocolVersion,
			Kind:            revisionSupersededEvent,
			RevisionID:      priorApproved.ID,
			ArtifactKind:    derivedStep,
			ChangeID:        input.ChangeID,
			ProjectID:       request.ProjectRef.ProjectID,
			Operation:       request.Operation,
			RequestID:       request.RequestID,
			IdempotencyKey:  request.IdempotencyKey,
			Actor:           request.Actor,
			Timestamp:       nowStr,
			RunRef:          runRef,
			SupersededBy:    awaiting.ID,
		})
		artifacts = append(artifacts, protocol.ObjectPointer{ObjectID: priorApproved.ID, Kind: "revision", Revision: supersededEnvelope.Content.Digest})
	}

	appended, updatedEventsBytes, err := appendLifecycleEvents(root, changePath, candidates, schema)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	newDerivedStep, err := computeDerivedStep(root, changePath, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	effects := []protocol.EffectRecord{}
	if len(appended) > 0 {
		eventsResource := withDigest(protocol.ResourceRef{URI: path.Join(changePath, eventsFile)}, updatedEventsBytes)
		effects = append(effects, writeEffect(request, "revision-lifecycle-events", eventsResource, eventsResource, len(updatedEventsBytes)))
	}

	eventPointers := make([]protocol.ObjectPointer, 0, len(appended))
	for _, event := range appended {
		eventPointers = append(eventPointers, protocol.ObjectPointer{
			ObjectID: stableID("event", input.ChangeID, event.Kind, event.RevisionID),
			Kind:     event.Kind,
			Revision: request.IdempotencyKey,
		})
	}

	next := protocol.NextAction{Operation: "virgil.continue", Condition: "next artifact step is ready to propose"}
	if newDerivedStep == "complete" {
		next = protocol.NextAction{Operation: "none", Condition: "all artifacts approved"}
	}

	resolved := resolvedContext(request, resolvedTarget)
	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      newDerivedStep,
		Artifacts:        artifacts,
		Briefs:           []protocol.ObjectPointer{},
		Events:           eventPointers,
		Effects:          effects,
		Next:             next,
		Diagnostics:      []protocol.Diagnostic{},
	}
	return result, nil
}

// handleRequestChanges implements the approval entry with decision ==
// "request_changes": it withdraws the revision awaiting approval so a new
// content_proposal can be drafted for the same, still-current derived step.
func handleRequestChanges(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, changePath, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	derivedStep, err := computeDerivedStep(root, changePath, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	if derivedStep == "complete" {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "all required artifacts already have an effective approved revision", nil)
	}
	if entry.ArtifactID != "" && entry.ArtifactID != derivedStep {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "artifact_id does not match the current derived step", nil)
	}

	records, err := listRevisions(root, changePath, derivedStep, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	var awaiting *revisionRecord
	for index := range records {
		if records[index].Envelope.State != "awaiting_approval" {
			continue
		}
		if awaiting != nil {
			return protocol.OperationResult{}, typedError("CORRUPT_LEDGER", changePath, "more than one revision is awaiting approval for the derived step", nil)
		}
		awaiting = &records[index]
	}
	if awaiting == nil {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", derivedStep, "no revision is awaiting approval for the current derived step", nil)
	}
	if entry.Revision != "" && entry.Revision != awaiting.ID {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.Revision, "approval revision does not match the revision awaiting approval", nil)
	}

	withdrawnEnvelope := awaiting.Envelope
	withdrawnEnvelope.State = "withdrawn"
	if _, err := rewriteEnvelope(root, awaiting.Path, withdrawnEnvelope, schema); err != nil {
		return protocol.OperationResult{}, err
	}

	runRef := *request.RunRef
	withdrawnEvent := protocol.RevisionLifecycleEvent{
		SchemaVersion:   revisionLifecycleEventSchema,
		ProtocolVersion: request.ProtocolVersion,
		Kind:            revisionWithdrawnEvent,
		RevisionID:      awaiting.ID,
		ArtifactKind:    derivedStep,
		ChangeID:        input.ChangeID,
		ProjectID:       request.ProjectRef.ProjectID,
		Operation:       request.Operation,
		RequestID:       request.RequestID,
		IdempotencyKey:  request.IdempotencyKey,
		Actor:           request.Actor,
		Timestamp:       nowStr,
		RunRef:          runRef,
		Reason:          "request_changes",
	}

	appended, updatedEventsBytes, err := appendLifecycleEvents(root, changePath, []protocol.RevisionLifecycleEvent{withdrawnEvent}, schema)
	if err != nil {
		return protocol.OperationResult{}, err
	}

	effects := []protocol.EffectRecord{}
	if len(appended) > 0 {
		eventsResource := withDigest(protocol.ResourceRef{URI: path.Join(changePath, eventsFile)}, updatedEventsBytes)
		effects = append(effects, writeEffect(request, "revision-lifecycle-events", eventsResource, eventsResource, len(updatedEventsBytes)))
	}

	eventPointers := make([]protocol.ObjectPointer, 0, len(appended))
	for _, event := range appended {
		eventPointers = append(eventPointers, protocol.ObjectPointer{
			ObjectID: stableID("event", input.ChangeID, event.Kind, event.RevisionID),
			Kind:     event.Kind,
			Revision: request.IdempotencyKey,
		})
	}

	resolved := resolvedContext(request, resolvedTarget)
	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "needs_input",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      derivedStep,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: awaiting.ID, Kind: "revision", Revision: withdrawnEnvelope.Content.Digest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  eventPointers,
		Effects: effects,
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "revision withdrawn; new content proposal required",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "REVISION_WITHDRAWN",
				Severity:   "info",
				Scope:      derivedStep,
				Condition:  fmt.Sprintf("revision %s of %s was withdrawn for requested changes", awaiting.ID, derivedStep),
				NextAction: "submit a new content_proposal for " + derivedStep,
			},
		},
	}
	return result, nil
}
