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
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

const (
	managedRoot  = "docs/virgil"
	projectFile  = "project.json"
	eventsFile   = "events.jsonl"
	projectEvent = "project_initialized"
	eventSchema  = "virgil.dev/project-initialized-event/v1alpha1"
	stateSchema  = "virgil.dev/project-state/v1alpha1"
)

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

// Init validates, recovers or atomically publishes repo-docs state for
// virgil.init. targetRoot must be the explicit host binding for ProjectRef.
func Init(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer) (protocol.OperationResult, error) {
	if err := validateInit(request, targetRoot, clock, canonicalizer); err != nil {
		return protocol.OperationResult{}, err
	}

	digest, err := requestDigest(request, canonicalizer)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	registry, err := contracts.NewRegistry()
	if err != nil {
		return protocol.OperationResult{}, typedError("CAPABILITY_UNSUPPORTED", request.Operation, "bundled durable-state schemas are unavailable", err)
	}
	root, resolvedTarget, err := openTargetRoot(targetRoot)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	defer root.Close()

	projectPath := request.ArtifactStoreRef.Namespace
	if state, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, registry); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if found {
		result, replayErr := replayResult(request, state, digest)
		return validateResult(registry, result, replayErr)
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
	if err := validatePublication(registry, projectBytes, eventBytes, result); err != nil {
		return protocol.OperationResult{}, err
	}
	if err := publish(root, projectPath, projectBytes, eventBytes); err != nil {
		var publicationError *publishError
		if errors.As(err, &publicationError) {
			state, found, loadErr := loadExisting(root, projectPath, resolvedTarget, canonicalizer, registry)
			if loadErr != nil {
				return protocol.OperationResult{}, loadErr
			}
			if found {
				replayed, replayErr := replayResult(request, state, digest)
				return validateResult(registry, replayed, replayErr)
			}
			return protocol.OperationResult{}, typedError("ATOMICITY_UNSUPPORTED", projectPath, "cannot atomically publish the complete project directory", publicationError.Cause)
		}
		return protocol.OperationResult{}, err
	}

	return result, nil
}

func validateInit(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer) error {
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
	if err := wire.ValidateUnambiguousJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "init input is ambiguous JSON", err)
	}
	if err := decodeSingleJSON(request.Input, &input); err != nil || input.ProjectID != request.ProjectRef.ProjectID {
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

func loadExisting(root *os.Root, projectPath, resolvedTarget string, canonicalizer Canonicalizer, registry *contracts.Registry) (ProjectState, bool, error) {
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
	if err := registry.Validate(contracts.SchemaProjectState, projectBytes); err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "project state violates its bundled schema", err)
	}
	if err := registry.Validate(contracts.SchemaProjectInitialized, eventBytes); err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "initialization event violates its bundled schema", err)
	}
	state, event, err := decodeAuthority(projectBytes, eventBytes)
	if err != nil {
		return ProjectState{}, false, typedError("CORRUPT_LEDGER", projectPath, "published project authority is invalid", err)
	}
	validationClock := ClockFunc(func() time.Time { return time.Unix(1, 0).UTC() })
	if err := validateInit(state.OriginalRequest, resolvedTarget, validationClock, canonicalizer); err != nil {
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

func decodeAuthority(projectBytes, eventBytes []byte) (ProjectState, ProjectInitialized, error) {
	var state ProjectState
	if err := decodeSingleJSON(projectBytes, &state); err != nil {
		return ProjectState{}, ProjectInitialized{}, err
	}
	lines := bytes.Split(bytes.TrimSpace(eventBytes), []byte{'\n'})
	if len(lines) != 1 || len(lines[0]) == 0 {
		return ProjectState{}, ProjectInitialized{}, fmt.Errorf("events.jsonl must contain exactly one event")
	}
	var event ProjectInitialized
	if err := decodeSingleJSON(lines[0], &event); err != nil {
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

func decodeSingleJSON(document []byte, target any) error {
	if err := wire.ValidateUnambiguousJSON(document); err != nil {
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
		return typedError("ATOMICITY_UNSUPPORTED", tempPath, "cannot create exclusive sibling staging directory", err)
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

func validatePublication(registry *contracts.Registry, projectBytes, eventBytes []byte, result protocol.OperationResult) error {
	if err := registry.Validate(contracts.SchemaProjectState, projectBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated project state violates its bundled schema", err)
	}
	if err := registry.Validate(contracts.SchemaProjectInitialized, eventBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated initialization event violates its bundled schema", err)
	}
	validated, err := validateResult(registry, result, nil)
	if err != nil {
		return err
	}
	_ = validated
	return nil
}

func validateResult(registry *contracts.Registry, result protocol.OperationResult, operationErr error) (protocol.OperationResult, error) {
	if operationErr != nil {
		return protocol.OperationResult{}, operationErr
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "cannot encode OperationResult", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, raw); err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "OperationResult violates its bundled schema", err)
	}
	for _, effect := range result.Effects {
		rawEffect, marshalErr := json.Marshal(effect)
		if marshalErr != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", result.Operation, "cannot encode EffectRecord", marshalErr)
		}
		if validateErr := registry.Validate(contracts.SchemaEffectRecord, rawEffect); validateErr != nil {
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
