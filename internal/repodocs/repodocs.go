// Package repodocs implements the repository-backed project store used by
// virgil.init, virgil.new and virgil.continue. Callers must provide every
// identity boundary explicitly; the package never derives a target or
// project from the current directory.
//
// Layout: repo-docs keeps exactly three kinds of durable object at the
// target root — virgil.json (the adapter control file, holding project
// identity and the single active change), AGENTS.md (a generated guide for
// AI agents interacting with the Virgil-managed repository) and, per change,
// up to five numbered artifact files under managed_root's per-change
// subdirectory ("docs/{change_id}/"):
// docs/{change_id}/00-idea/00-idea.md .. docs/{change_id}/04-handoff/04-handoff.md. This layout
// leaves room for a project to accumulate multiple changes side by side
// under docs/ over time, one subdirectory per change_id. There is no
// project.json/events.jsonl/change.json ledger: git is the ledger.
// derived_step is always recomputed by scanning docs/{change_id}/ for those
// files and reading their JSON frontmatter, never cached or persisted
// separately. active_change occupies a single slot at a time: once its
// artifact pipeline reaches derived_step "complete" (every artifact has an
// effective approved revision), the approving virgil.continue call clears
// active_change from virgil.json, freeing the slot for a subsequent
// virgil.new with a different change_id.
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
	managedRoot      = "docs"
	virgilConfigFile = protocol.VirgilConfigFile
	agentsFile       = "AGENTS.md"

	configSchemaVersion = "virgil.dev/config/v1alpha1"

	artifactFrontmatterSchema = "virgil.dev/artifact/v1alpha1"

	schemaVirgilConfig        = "https://schemas.virgil.dev/planning-slice1/v1alpha1/virgil-config.schema.json"
	schemaArtifactFrontmatter = "https://schemas.virgil.dev/planning-slice1/v1alpha1/artifact-frontmatter.schema.json"
	schemaOperationResult     = "https://schemas.virgil.dev/planning-slice1/v1alpha1/operation-result.schema.json"
	schemaEffectRecord        = "https://schemas.virgil.dev/planning-slice1/v1alpha1/effect-record.schema.json"

	statusAwaitingApproval = "awaiting_approval"
	statusApproved         = "approved"
	statusWithdrawn        = "withdrawn"

	frontmatterOpen  = "---json\n"
	frontmatterClose = "\n---\n\n"
)

// artifactStepOrder is the fixed Slice 1 artifact sequence. derived_step is
// always the first step in this order without an approved artifact file.
var artifactStepOrder = protocol.ArtifactStepOrder

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

// NewInput extracts the typed input fields from a virgil.new request.
type NewInput struct {
	ChangeID   string                    `json:"change_id"`
	Intent     string                    `json:"intent"`
	Provenance protocol.SourceProvenance `json:"provenance"`
	Evidence   []protocol.ResourceRef    `json:"evidence,omitempty"`
}

// artifactRecord is a parsed docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md file: its relative path, its
// decoded frontmatter, and its content body (everything after the closing
// frontmatter marker).
type artifactRecord struct {
	Path        string
	Frontmatter protocol.ArtifactFrontmatter
	Content     []byte
}

// ---------------------------------------------------------------------------
// virgil.init
// ---------------------------------------------------------------------------

// Init validates, recovers or atomically publishes virgil.json for
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

	if cfg, found, loadErr := loadExistingConfig(root, resolvedTarget, canonicalizer, schema, validateJSON); loadErr != nil {
		return protocol.OperationResult{}, loadErr
	} else if found {
		result, replayErr := replayInitResult(request, cfg, digest)
		return validateResult(schema, result, replayErr)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	createdAt := now.UTC().Format(time.RFC3339Nano)
	resolved := resolvedContext(request, resolvedTarget)
	cfg, cfgBytes, err := buildConfig(request, digest, createdAt, resolved)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "cannot encode virgil.json", err)
	}

	// AGENTS.md is written before virgil.json: virgil.json's existence is the
	// idempotency signal for Init (loadExistingConfig above), so if it were
	// written first and the process crashed before AGENTS.md landed, a later
	// replay would never backfill AGENTS.md. Writing AGENTS.md first and
	// tolerating its own publishError (already exists from a prior partial
	// init) keeps both files reachable from any crash point.
	agentsBytes := []byte(agentsTemplate)
	if err := publishAgents(root, agentsBytes); err != nil {
		var publicationError *publishError
		if errors.As(err, &publicationError) {
			// AGENTS.md already exists (e.g., previous partial init) — acceptable, continue.
		} else {
			return protocol.OperationResult{}, err
		}
	}

	result := initSuccessResult(request, cfg, cfgBytes, agentsBytes)
	if err := validateConfigPublication(schema, cfgBytes, result); err != nil {
		return protocol.OperationResult{}, err
	}
	if err := publishConfig(root, cfgBytes); err != nil {
		var publicationError *publishError
		if errors.As(err, &publicationError) {
			cfg, found, loadErr := loadExistingConfig(root, resolvedTarget, canonicalizer, schema, validateJSON)
			if loadErr != nil {
				return protocol.OperationResult{}, loadErr
			}
			if found {
				replayed, replayErr := replayInitResult(request, cfg, digest)
				return validateResult(schema, replayed, replayErr)
			}
			return protocol.OperationResult{}, typedError("ATOMICITY_UNSUPPORTED", virgilConfigFile, "cannot atomically publish virgil.json", publicationError.Cause)
		}
		return protocol.OperationResult{}, err
	}

	return result, nil
}

func buildConfig(request protocol.OperationRequest, digest, createdAt string, resolved protocol.Context) (protocol.VirgilConfig, []byte, error) {
	cfg := protocol.VirgilConfig{
		SchemaVersion:   configSchemaVersion,
		ProtocolVersion: request.ProtocolVersion,
		ProjectID:       request.ProjectRef.ProjectID,
		DogmaRef:        resolved.DogmaRef,
		Adapter:         resolved.ArtifactStoreRef.Adapter,
		ManagedRoot:     managedRoot + "/",
		CreatedAt:       createdAt,
		CreatedBy:       request.Actor,
		Idempotency: protocol.IdempotencyRecord{
			Key:               request.IdempotencyKey,
			RequestDigest:     digest,
			OriginalRequestID: request.RequestID,
		},
		OriginalRequest: request,
		ResolvedContext: resolved,
	}
	cfgBytes, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return protocol.VirgilConfig{}, nil, err
	}
	cfgBytes = append(cfgBytes, '\n')
	return cfg, cfgBytes, nil
}

func initSuccessResult(request protocol.OperationRequest, cfg protocol.VirgilConfig, cfgBytes, agentsBytes []byte) protocol.OperationResult {
	cfgResource := withDigest(protocol.ResourceRef{URI: virgilConfigFile}, cfgBytes)
	agentsResource := withDigest(protocol.ResourceRef{URI: agentsFile}, agentsBytes)
	resolved := cfg.ResolvedContext
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
		Events:           []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{
			writeEffect(request, "virgil-config", cfgResource, cfgResource, len(cfgBytes)),
			writeEffect(request, "agents-doc", agentsResource, agentsResource, len(agentsBytes)),
		},
		Next: protocol.NextAction{
			Operation: "virgil.new",
			Condition: "project is initialized and ready for a change",
		},
		Diagnostics: []protocol.Diagnostic{},
	}
}

func replayInitResult(request protocol.OperationRequest, cfg protocol.VirgilConfig, digest string) (protocol.OperationResult, error) {
	if cfg.ProjectID != request.ProjectRef.ProjectID || cfg.OriginalRequest.Operation != request.Operation || cfg.Idempotency.Key != request.IdempotencyKey {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.ProjectRef.ProjectID, "project is already initialized by a different intention", nil)
	}
	if cfg.Idempotency.RequestDigest != digest {
		return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different request digest", nil)
	}
	resolved := cfg.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:     request.ProtocolVersion,
		Operation:           request.Operation,
		RequestID:           request.RequestID,
		IdempotencyKey:      request.IdempotencyKey,
		ReplayedFromRequest: cfg.Idempotency.OriginalRequestID,
		Status:              "success",
		RequestedContext:    protocol.ContextFromRequest(request),
		ResolvedContext:     &resolved,
		DerivedStep:         "idea",
		Artifacts:           []protocol.ObjectPointer{},
		Briefs:              []protocol.ObjectPointer{},
		Events:              []protocol.ObjectPointer{},
		Effects:             []protocol.EffectRecord{},
		Next: protocol.NextAction{
			Operation: "virgil.new",
			Condition: "project is initialized and ready for a change",
		},
		Diagnostics: []protocol.Diagnostic{},
	}, nil
}

func validateInit(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.init" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs Init accepts only the current virgil.init protocol", nil)
	}
	if err := validateCommonRequestShape(request); err != nil {
		return err
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

// loadExistingConfig reads and validates virgil.json at the target root, if
// it exists. It re-validates the embedded OriginalRequest against the init
// contract and cross-checks every field that must agree with it, so a
// tampered or partially-written virgil.json fails closed as CORRUPT_LEDGER
// rather than being trusted.
func loadExistingConfig(root *os.Root, resolvedTarget string, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.VirgilConfig, bool, error) {
	info, statErr := root.Lstat(virgilConfigFile)
	if errors.Is(statErr, fs.ErrNotExist) {
		return protocol.VirgilConfig{}, false, nil
	}
	if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "virgil.json is not a regular file", statErr)
	}
	raw, err := root.ReadFile(virgilConfigFile)
	if err != nil {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "cannot read virgil.json", err)
	}
	if err := schema.Validate(schemaVirgilConfig, raw); err != nil {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "virgil.json violates its bundled schema", err)
	}
	var cfg protocol.VirgilConfig
	if err := decodeSingleJSON(raw, &cfg, validateJSON); err != nil {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "virgil.json is not valid JSON", err)
	}

	validationClock := ClockFunc(func() time.Time { return time.Unix(1, 0).UTC() })
	if err := validateInit(cfg.OriginalRequest, resolvedTarget, validationClock, canonicalizer, validateJSON); err != nil {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "original request no longer satisfies the init contract", err)
	}
	durableDigest, digestErr := requestDigest(cfg.OriginalRequest, canonicalizer)
	if digestErr != nil {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "cannot re-canonicalize original request", digestErr)
	}
	expectedResolved := protocol.ContextFromRequest(cfg.OriginalRequest)
	expectedResolved.ProjectRef.Target.CanonicalPath = resolvedTarget
	if cfg.SchemaVersion != configSchemaVersion || cfg.ProtocolVersion != protocol.Version ||
		cfg.ProjectID == "" || cfg.ProjectID != cfg.OriginalRequest.ProjectRef.ProjectID || cfg.ManagedRoot != managedRoot+"/" ||
		cfg.Idempotency.RequestDigest != durableDigest ||
		cfg.Idempotency.Key != cfg.OriginalRequest.IdempotencyKey ||
		cfg.Idempotency.OriginalRequestID != cfg.OriginalRequest.RequestID ||
		!reflect.DeepEqual(cfg.ResolvedContext, expectedResolved) ||
		!reflect.DeepEqual(cfg.DogmaRef, cfg.ResolvedContext.DogmaRef) ||
		!reflect.DeepEqual(cfg.Adapter, cfg.ResolvedContext.ArtifactStoreRef.Adapter) ||
		!reflect.DeepEqual(cfg.CreatedBy, cfg.OriginalRequest.Actor) {
		return protocol.VirgilConfig{}, false, typedError("CORRUPT_LEDGER", virgilConfigFile, "virgil.json is internally inconsistent", nil)
	}
	if cfg.ActiveChange != nil {
		if err := validateActiveChangeConsistency(*cfg.ActiveChange, resolvedTarget, canonicalizer); err != nil {
			return protocol.VirgilConfig{}, false, err
		}
	}
	return cfg, true, nil
}

func validateActiveChangeConsistency(active protocol.ActiveChange, resolvedTarget string, canonicalizer Canonicalizer) error {
	durableDigest, err := requestDigest(active.OriginalRequest, canonicalizer)
	if err != nil {
		return typedError("CORRUPT_LEDGER", virgilConfigFile, "cannot re-canonicalize active change request", err)
	}
	expectedResolved := protocol.ContextFromRequest(active.OriginalRequest)
	expectedResolved.ProjectRef.Target.CanonicalPath = resolvedTarget
	expectedResolved.RunRef = active.ResolvedContext.RunRef
	if active.ChangeID == "" || active.Intention == "" || active.RunID == "" || active.CreatedAt == "" ||
		active.Idempotency.RequestDigest != durableDigest ||
		active.Idempotency.Key != active.OriginalRequest.IdempotencyKey ||
		active.Idempotency.OriginalRequestID != active.OriginalRequest.RequestID ||
		active.ResolvedContext.RunRef == nil || active.ResolvedContext.RunRef.ChangeID != active.ChangeID ||
		active.ResolvedContext.RunRef.RunID != active.RunID ||
		!reflect.DeepEqual(active.ResolvedContext, expectedResolved) {
		return typedError("CORRUPT_LEDGER", virgilConfigFile, "active_change is internally inconsistent", nil)
	}
	return nil
}

func publishConfig(root *os.Root, cfgBytes []byte) error {
	tempName := ".virgil-" + stableID("tmp", virgilConfigFile, fmt.Sprintf("%x", sha256.Sum256(cfgBytes)))
	if err := writeExclusive(root, tempName, cfgBytes); err != nil {
		return err
	}
	published := false
	defer func() {
		if !published {
			_ = root.Remove(tempName)
		}
	}()
	if err := root.Rename(tempName, virgilConfigFile); err != nil {
		return &publishError{Cause: err}
	}
	published = true
	return syncDirectory(root, ".")
}

// publishAgents durably publishes AGENTS.md using create-exclusive-and-
// rename, mirroring publishConfig. A pre-existing AGENTS.md (e.g., from a
// crashed prior init that wrote AGENTS.md but not virgil.json) is reported
// as a *publishError so Init can treat it as an acceptable no-op rather than
// failing closed.
func publishAgents(root *os.Root, content []byte) error {
	tempName := ".agents-" + stableID("tmp", agentsFile, fmt.Sprintf("%x", sha256.Sum256(content)))
	if err := writeExclusive(root, tempName, content); err != nil {
		var pathErr *os.PathError
		if errors.As(err, &pathErr) && errors.Is(pathErr.Err, fs.ErrExist) {
			return &publishError{Path: agentsFile, Cause: pathErr}
		}
		return err
	}
	published := false
	defer func() {
		if !published {
			_ = root.Remove(tempName)
		}
	}()
	if err := root.Rename(tempName, agentsFile); err != nil {
		return &publishError{Path: agentsFile, Cause: err}
	}
	published = true
	return syncDirectory(root, ".")
}

// rewriteConfig durably replaces an existing virgil.json using
// copy-rewrite-rename. Used by virgil.new to set active_change.
func rewriteConfig(root *os.Root, cfgBytes []byte) error {
	tempName := ".virgil-" + stableID("tmp", virgilConfigFile, fmt.Sprintf("%x", sha256.Sum256(cfgBytes)))
	if err := root.Remove(tempName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return typedError("ATOMICITY_UNSUPPORTED", tempName, "cannot clear crashed staging file", err)
	}
	if err := writeExclusive(root, tempName, cfgBytes); err != nil {
		return err
	}
	if err := root.Rename(tempName, virgilConfigFile); err != nil {
		_ = root.Remove(tempName)
		return typedError("ATOMICITY_UNSUPPORTED", virgilConfigFile, "cannot atomically replace virgil.json", err)
	}
	return syncDirectory(root, ".")
}

// ---------------------------------------------------------------------------
// virgil.new
// ---------------------------------------------------------------------------

// New validates, recovers or atomically publishes the active change for
// virgil.new. The project must already be initialized. targetRoot must be
// the explicit host binding for ProjectRef.
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

	cfg, found, loadErr := loadExistingConfig(root, resolvedTarget, canonicalizer, schema, validateJSON)
	if loadErr != nil {
		return protocol.OperationResult{}, loadErr
	}
	if !found {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "project is not initialized", nil)
	}
	if cfg.ActiveChange != nil {
		result, replayErr := replayOrBlockNewResult(request, cfg, digest, input)
		return validateResult(schema, result, replayErr)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	createdAt := now.UTC().Format(time.RFC3339Nano)
	resolved := resolvedNewContext(request, resolvedTarget, input)
	updatedCfg, cfgBytes, err := buildActiveChangePublication(cfg, request, input, digest, createdAt, resolved)
	if err != nil {
		return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "cannot encode active_change", err)
	}
	result := newSuccessResult(request, updatedCfg, cfgBytes)
	if err := validateConfigPublication(schema, cfgBytes, result); err != nil {
		return protocol.OperationResult{}, err
	}
	if err := rewriteConfig(root, cfgBytes); err != nil {
		reloaded, found, loadErr := loadExistingConfig(root, resolvedTarget, canonicalizer, schema, validateJSON)
		if loadErr != nil {
			return protocol.OperationResult{}, loadErr
		}
		if found && reloaded.ActiveChange != nil {
			replayed, replayErr := replayOrBlockNewResult(request, reloaded, digest, input)
			return validateResult(schema, replayed, replayErr)
		}
		return protocol.OperationResult{}, err
	}

	return result, nil
}

func replayOrBlockNewResult(request protocol.OperationRequest, cfg protocol.VirgilConfig, digest string, input NewInput) (protocol.OperationResult, error) {
	active := cfg.ActiveChange
	if active.ChangeID != input.ChangeID {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.ProjectRef.ProjectID, "a different change is already active for this project", nil)
	}
	if active.Idempotency.Key != request.IdempotencyKey {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.ProjectRef.ProjectID, "change already exists from a different intention", nil)
	}
	if active.Idempotency.RequestDigest != digest {
		return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different request digest", nil)
	}
	resolved := active.ResolvedContext
	return protocol.OperationResult{
		ProtocolVersion:     request.ProtocolVersion,
		Operation:           request.Operation,
		RequestID:           request.RequestID,
		IdempotencyKey:      request.IdempotencyKey,
		ReplayedFromRequest: active.Idempotency.OriginalRequestID,
		Status:              "success",
		RequestedContext:    protocol.ContextFromRequest(request),
		ResolvedContext:     &resolved,
		DerivedStep:         "idea",
		Artifacts:           []protocol.ObjectPointer{},
		Briefs:              []protocol.ObjectPointer{},
		Events:              []protocol.ObjectPointer{},
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

func buildActiveChangePublication(cfg protocol.VirgilConfig, request protocol.OperationRequest, input NewInput, digest, createdAt string, resolved protocol.Context) (protocol.VirgilConfig, []byte, error) {
	cfg.ActiveChange = &protocol.ActiveChange{
		ChangeID:   input.ChangeID,
		Intention:  input.Intent,
		RunID:      resolved.RunRef.RunID,
		CreatedAt:  createdAt,
		Provenance: input.Provenance,
		Idempotency: protocol.IdempotencyRecord{
			Key:               request.IdempotencyKey,
			RequestDigest:     digest,
			OriginalRequestID: request.RequestID,
		},
		OriginalRequest: request,
		ResolvedContext: resolved,
	}
	cfgBytes, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return protocol.VirgilConfig{}, nil, err
	}
	cfgBytes = append(cfgBytes, '\n')
	return cfg, cfgBytes, nil
}

func newSuccessResult(request protocol.OperationRequest, cfg protocol.VirgilConfig, cfgBytes []byte) protocol.OperationResult {
	cfgResource := withDigest(protocol.ResourceRef{URI: virgilConfigFile}, cfgBytes)
	resolved := cfg.ActiveChange.ResolvedContext
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
		Events:           []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{
			writeEffect(request, "virgil-config", cfgResource, cfgResource, len(cfgBytes)),
		},
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "change is created and ready for the first artifact",
		},
		Diagnostics: []protocol.Diagnostic{},
	}
}

func validateNew(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.new" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs New accepts only the current virgil.new protocol", nil)
	}
	if err := validateCommonRequestShape(request); err != nil {
		return err
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

// ---------------------------------------------------------------------------
// virgil.continue
// ---------------------------------------------------------------------------

// Continue validates, recovers or atomically advances the active change for
// virgil.continue. The project and the active change must already exist.
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

	cfg, found, loadErr := loadExistingConfig(root, resolvedTarget, canonicalizer, schema, validateJSON)
	if loadErr != nil {
		return protocol.OperationResult{}, loadErr
	}
	if !found {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "project is not initialized", nil)
	}
	if cfg.ActiveChange == nil {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "change does not exist", nil)
	}
	if cfg.ProjectID != request.ProjectRef.ProjectID {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "change belongs to a different project", nil)
	}
	if cfg.ActiveChange.ChangeID != input.ChangeID {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "change does not exist", nil)
	}
	if cfg.ActiveChange.ResolvedContext.RunRef == nil || *request.RunRef != *cfg.ActiveChange.ResolvedContext.RunRef {
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
		result, handlerErr = handleContentProposal(root, request, input, cfg, resolvedTarget, nowStr, schema, validateJSON)
	case "approval":
		switch input.Entry.Decision {
		case "approved":
			result, handlerErr = handleApprovalApproved(root, request, input, cfg, resolvedTarget, nowStr, schema, validateJSON)
		case "request_changes":
			result, handlerErr = handleRequestChanges(root, request, input, cfg, resolvedTarget, nowStr, schema, validateJSON)
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
	if err := validateCommonRequestShape(request); err != nil {
		return err
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

// ---------------------------------------------------------------------------
// Durable artifact state: docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md
// ---------------------------------------------------------------------------

// loadExistingState scans managed_root's per-change subdirectory for the
// fixed docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md filenames and parses
// whichever ones exist. Any other file under docs/ is pre-existing consumer
// content and is silently ignored: managed_root and corpus_root are the same
// tree, so unrecognized entries are not corruption.
func loadExistingState(root *os.Root, changeID string, schema SchemaValidator, validateJSON JSONValidator) (map[string]artifactRecord, error) {
	state := make(map[string]artifactRecord, len(artifactStepOrder))
	for _, kind := range artifactStepOrder {
		relative := path.Join(managedRoot, changeID, protocol.ArtifactDirName(kind), protocol.ArtifactFileName(kind))
		info, statErr := root.Lstat(relative)
		if errors.Is(statErr, fs.ErrNotExist) {
			continue
		}
		if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return nil, typedError("CORRUPT_LEDGER", relative, "artifact file is not a regular file", statErr)
		}
		raw, err := root.ReadFile(relative)
		if err != nil {
			return nil, typedError("CORRUPT_LEDGER", relative, "cannot read artifact file", err)
		}
		frontmatter, content, err := parseArtifactFrontmatter(raw)
		if err != nil {
			return nil, typedError("CORRUPT_LEDGER", relative, "artifact file frontmatter is malformed", err)
		}
		frontmatterBytes, err := json.Marshal(frontmatter)
		if err != nil {
			return nil, typedError("CORRUPT_LEDGER", relative, "cannot re-encode artifact frontmatter", err)
		}
		if err := schema.Validate(schemaArtifactFrontmatter, frontmatterBytes); err != nil {
			return nil, typedError("CORRUPT_LEDGER", relative, "artifact frontmatter violates its bundled schema", err)
		}
		if frontmatter.ArtifactKind != kind {
			return nil, typedError("CORRUPT_LEDGER", relative, "artifact frontmatter kind does not match its filename", nil)
		}
		wantDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(content))
		if frontmatter.ContentDigest != wantDigest {
			return nil, typedError("CORRUPT_LEDGER", relative, "artifact content does not match its frontmatter digest", nil)
		}
		state[kind] = artifactRecord{Path: relative, Frontmatter: frontmatter, Content: content}
	}
	return state, nil
}

// computeDerivedStep is always recomputed as a query over durable artifact
// files; it is never itself persisted. The first step in artifactStepOrder
// without an approved file is the derived_step.
func computeDerivedStep(state map[string]artifactRecord) string {
	for _, kind := range artifactStepOrder {
		record, found := state[kind]
		if !found || record.Frontmatter.Status != statusApproved {
			return kind
		}
	}
	return "complete"
}

// upstreamRefsFor links a freshly drafted artifact to the approved artifact
// of the immediately preceding step, when one exists.
func upstreamRefsFor(state map[string]artifactRecord, artifactKind string) []protocol.UpstreamRef {
	index := indexOf(artifactStepOrder, artifactKind)
	if index <= 0 {
		return []protocol.UpstreamRef{}
	}
	previousKind := artifactStepOrder[index-1]
	record, found := state[previousKind]
	if !found || record.Frontmatter.Status != statusApproved {
		return []protocol.UpstreamRef{}
	}
	return []protocol.UpstreamRef{{RevisionID: record.Frontmatter.Revision, ArtifactKind: previousKind}}
}

func nextRevision(current string) string {
	var number int
	if _, err := fmt.Sscanf(current, "rev-%d", &number); err != nil {
		return "rev-000001"
	}
	return fmt.Sprintf("rev-%06d", number+1)
}

// serializeArtifactFile renders frontmatter and content into the on-disk
// docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md representation: a "---json" / "---" delimited JSON
// block followed by the Markdown content body. JSON frontmatter (not YAML)
// is a deliberate choice: it lets the adapter reuse encoding/json instead of
// adding a YAML parsing dependency.
func serializeArtifactFile(frontmatter protocol.ArtifactFrontmatter, content []byte) ([]byte, error) {
	frontmatterBytes, err := json.MarshalIndent(frontmatter, "", "  ")
	if err != nil {
		return nil, err
	}
	var buffer bytes.Buffer
	buffer.WriteString(frontmatterOpen)
	buffer.Write(frontmatterBytes)
	buffer.WriteString(frontmatterClose)
	buffer.Write(content)
	return buffer.Bytes(), nil
}

// parseArtifactFrontmatter splits a docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md file into its decoded
// JSON frontmatter and its content body.
func parseArtifactFrontmatter(raw []byte) (protocol.ArtifactFrontmatter, []byte, error) {
	if !bytes.HasPrefix(raw, []byte(frontmatterOpen)) {
		return protocol.ArtifactFrontmatter{}, nil, fmt.Errorf("artifact file does not start with %q", frontmatterOpen)
	}
	rest := raw[len(frontmatterOpen):]
	closeIndex := bytes.Index(rest, []byte(frontmatterClose))
	if closeIndex < 0 {
		return protocol.ArtifactFrontmatter{}, nil, fmt.Errorf("artifact file has no closing frontmatter marker %q", frontmatterClose)
	}
	frontmatterBytes := rest[:closeIndex]
	content := rest[closeIndex+len(frontmatterClose):]
	var frontmatter protocol.ArtifactFrontmatter
	decoder := json.NewDecoder(bytes.NewReader(frontmatterBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&frontmatter); err != nil {
		return protocol.ArtifactFrontmatter{}, nil, fmt.Errorf("decode artifact frontmatter: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return protocol.ArtifactFrontmatter{}, nil, fmt.Errorf("artifact frontmatter contains multiple JSON values")
		}
		return protocol.ArtifactFrontmatter{}, nil, fmt.Errorf("artifact frontmatter is not well-formed JSON: %w", err)
	}
	return frontmatter, content, nil
}

// writeArtifactFile publishes a brand-new docs/{change_id}/{NN}-{kind}/{NN}-{kind}.md
// using create-exclusive-and-rename. The artifact's change_id subdirectory is
// derived from relative and created (with its full managed_root chain) if it
// does not already exist.
func writeArtifactFile(root *os.Root, relative string, frontmatter protocol.ArtifactFrontmatter, content []byte) ([]byte, error) {
	raw, err := serializeArtifactFile(frontmatter, content)
	if err != nil {
		return nil, typedError("INTERNAL_ERROR", relative, "cannot encode artifact file", err)
	}
	parentDir := path.Dir(relative)
	tempName := path.Join(parentDir, ".artifact-"+stableID("tmp", relative, fmt.Sprintf("%x", sha256.Sum256(raw))))
	if err := createDirectoryChain(root, parentDir); err != nil {
		return nil, err
	}
	if err := syncDirectoryChain(root, parentDir); err != nil {
		return nil, err
	}
	if err := writeExclusive(root, tempName, raw); err != nil {
		return nil, err
	}
	published := false
	defer func() {
		if !published {
			_ = root.Remove(tempName)
		}
	}()
	if err := root.Rename(tempName, relative); err != nil {
		return nil, typedError("ATOMICITY_UNSUPPORTED", relative, "cannot atomically publish artifact file", err)
	}
	published = true
	if err := syncDirectory(root, parentDir); err != nil {
		return nil, err
	}
	return raw, nil
}

// rewriteArtifactFile durably replaces an existing docs/{change_id}/{NN}-
// {kind}.md using copy-rewrite-rename. Used to redraft (after
// request_changes), approve or withdraw an artifact in place.
func rewriteArtifactFile(root *os.Root, relative string, frontmatter protocol.ArtifactFrontmatter, content []byte) ([]byte, error) {
	raw, err := serializeArtifactFile(frontmatter, content)
	if err != nil {
		return nil, typedError("INTERNAL_ERROR", relative, "cannot encode artifact file", err)
	}
	parentDir := path.Dir(relative)
	tempName := path.Join(parentDir, ".artifact-"+stableID("tmp", relative, fmt.Sprintf("%x", sha256.Sum256(raw))))
	if err := root.Remove(tempName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, typedError("ATOMICITY_UNSUPPORTED", tempName, "cannot clear crashed staging file", err)
	}
	if err := writeExclusive(root, tempName, raw); err != nil {
		return nil, err
	}
	if err := root.Rename(tempName, relative); err != nil {
		_ = root.Remove(tempName)
		return nil, typedError("ATOMICITY_UNSUPPORTED", relative, "cannot atomically replace artifact file", err)
	}
	if err := syncDirectory(root, parentDir); err != nil {
		return nil, err
	}
	return raw, nil
}

// handleContentProposal drafts or redrafts the artifact file for the current
// derived_step. A content_proposal with the same idempotency_key and content
// digest as an existing awaiting_approval draft is a durable, zero-write
// replay. A content_proposal for a kind whose file was withdrawn (after
// request_changes) reuses the same file, incrementing its revision.
func handleContentProposal(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, cfg protocol.VirgilConfig, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	state, err := loadExistingState(root, input.ChangeID, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	derivedStep := computeDerivedStep(state)
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

	relative := path.Join(managedRoot, input.ChangeID, protocol.ArtifactDirName(entry.ArtifactKind), protocol.ArtifactFileName(entry.ArtifactKind))
	existing, found := state[entry.ArtifactKind]

	replay := false
	var revision string
	if found {
		switch existing.Frontmatter.Status {
		case statusAwaitingApproval:
			if existing.Frontmatter.IdempotencyKey != request.IdempotencyKey {
				return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactKind, "a revision is already awaiting approval for this artifact kind", nil)
			}
			if existing.Frontmatter.ContentDigest != contentDigest {
				return protocol.OperationResult{}, typedError("IDEMPOTENCY_CONFLICT", request.IdempotencyKey, "idempotency key is already bound to a different content proposal", nil)
			}
			replay = true
			revision = existing.Frontmatter.Revision
		case statusWithdrawn:
			revision = nextRevision(existing.Frontmatter.Revision)
		default:
			return protocol.OperationResult{}, typedError("CORRUPT_LEDGER", relative, "artifact file is not eligible for a new content proposal", nil)
		}
	} else {
		revision = "rev-000001"
	}

	var raw []byte
	var effects []protocol.EffectRecord
	var replayedFrom string
	if replay {
		replayedFrom = existing.Frontmatter.RequestID
	} else {
		upstreamRefs := upstreamRefsFor(state, entry.ArtifactKind)
		frontmatter := protocol.ArtifactFrontmatter{
			Schema:          artifactFrontmatterSchema,
			ProtocolVersion: request.ProtocolVersion,
			ArtifactKind:    entry.ArtifactKind,
			ChangeID:        input.ChangeID,
			ProjectID:       request.ProjectRef.ProjectID,
			Status:          statusAwaitingApproval,
			Revision:        revision,
			UpstreamRefs:    upstreamRefs,
			ContentDigest:   contentDigest,
			IdempotencyKey:  request.IdempotencyKey,
			RequestID:       request.RequestID,
			CreatedAt:       nowStr,
			Provenance: protocol.SourceProvenance{
				Kind:       provenanceKindForActor(request.Actor),
				CapturedAt: nowStr,
				Source:     &protocol.ResourceRef{URI: entry.Content.URI, Digest: contentDigest},
			},
		}
		var writeErr error
		if found {
			raw, writeErr = rewriteArtifactFile(root, relative, frontmatter, contentBytes)
		} else {
			raw, writeErr = writeArtifactFile(root, relative, frontmatter, contentBytes)
		}
		if writeErr != nil {
			return protocol.OperationResult{}, writeErr
		}
		fileResource := withDigest(protocol.ResourceRef{URI: relative}, raw)
		effects = append(effects, writeEffect(request, "artifact-file", fileResource, fileResource, len(raw)))
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
			{ObjectID: revision, Kind: "revision", Revision: contentDigest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  []protocol.ObjectPointer{},
		Effects: effects,
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "approval required",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "APPROVAL_REQUIRED",
				Severity:   "info",
				Scope:      entry.ArtifactKind,
				Condition:  fmt.Sprintf("revision %s of %s is awaiting_approval", revision, entry.ArtifactKind),
				NextAction: "submit an approval entry for this revision before continuing",
			},
		},
	}
	if effects == nil {
		result.Effects = []protocol.EffectRecord{}
	}
	return result, nil
}

// handleApprovalApproved implements the approval entry with decision ==
// "approved": it rewrites the current derived_step's artifact file in place,
// setting status to approved.
func handleApprovalApproved(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, cfg protocol.VirgilConfig, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	state, err := loadExistingState(root, input.ChangeID, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	derivedStep := computeDerivedStep(state)
	if derivedStep == "complete" {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "all required artifacts already have an effective approved revision", nil)
	}
	if entry.ArtifactID != "" && entry.ArtifactID != derivedStep {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "artifact_id does not match the current derived step", nil)
	}

	record, found := state[derivedStep]
	if !found || record.Frontmatter.Status != statusAwaitingApproval {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", derivedStep, "no revision is awaiting approval for the current derived step", nil)
	}
	if entry.Revision != "" && entry.Revision != record.Frontmatter.Revision {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.Revision, "approval revision does not match the revision awaiting approval", nil)
	}

	approvedActor := request.Actor
	frontmatter := record.Frontmatter
	frontmatter.Status = statusApproved
	frontmatter.ApprovedBy = &approvedActor
	frontmatter.ApprovedAt = nowStr
	raw, err := rewriteArtifactFile(root, record.Path, frontmatter, record.Content)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	fileResource := withDigest(protocol.ResourceRef{URI: record.Path}, raw)

	newState := make(map[string]artifactRecord, len(state))
	for kind, value := range state {
		newState[kind] = value
	}
	newState[derivedStep] = artifactRecord{Path: record.Path, Frontmatter: frontmatter, Content: record.Content}
	newDerivedStep := computeDerivedStep(newState)

	next := protocol.NextAction{Operation: "virgil.continue", Condition: "next artifact step is ready to propose"}
	effects := []protocol.EffectRecord{writeEffect(request, "artifact-file", fileResource, fileResource, len(raw))}
	if newDerivedStep == "complete" {
		next = protocol.NextAction{Operation: "none", Condition: "all artifacts approved"}

		// The pipeline just reached completion: clear active_change so the
		// project's single change slot is free for a subsequent virgil.new.
		cfg.ActiveChange = nil
		cfgBytes, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "cannot encode virgil.json after completion", err)
		}
		cfgBytes = append(cfgBytes, '\n')
		if err := schema.Validate(schemaVirgilConfig, cfgBytes); err != nil {
			return protocol.OperationResult{}, typedError("INTERNAL_ERROR", request.Operation, "generated virgil.json violates its bundled schema", err)
		}
		if err := rewriteConfig(root, cfgBytes); err != nil {
			return protocol.OperationResult{}, err
		}
		cfgResource := withDigest(protocol.ResourceRef{URI: virgilConfigFile}, cfgBytes)
		effects = append(effects, writeEffect(request, "virgil-config", cfgResource, cfgResource, len(cfgBytes)))
	}

	resolved := resolvedContext(request, resolvedTarget)
	return protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      newDerivedStep,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: frontmatter.Revision, Kind: "revision", Revision: frontmatter.ContentDigest},
		},
		Briefs:      []protocol.ObjectPointer{},
		Events:      []protocol.ObjectPointer{},
		Effects:     effects,
		Next:        next,
		Diagnostics: []protocol.Diagnostic{},
	}, nil
}

// handleRequestChanges implements the approval entry with decision ==
// "request_changes": it withdraws the artifact file awaiting approval for
// the current, still-current derived step so a new content_proposal can
// redraft it.
func handleRequestChanges(root *os.Root, request protocol.OperationRequest, input protocol.ContinueInput, cfg protocol.VirgilConfig, resolvedTarget, nowStr string, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	entry := input.Entry

	state, err := loadExistingState(root, input.ChangeID, schema, validateJSON)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	derivedStep := computeDerivedStep(state)
	if derivedStep == "complete" {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "all required artifacts already have an effective approved revision", nil)
	}
	if entry.ArtifactID != "" && entry.ArtifactID != derivedStep {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.ArtifactID, "artifact_id does not match the current derived step", nil)
	}

	record, found := state[derivedStep]
	if !found || record.Frontmatter.Status != statusAwaitingApproval {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", derivedStep, "no revision is awaiting approval for the current derived step", nil)
	}
	if entry.Revision != "" && entry.Revision != record.Frontmatter.Revision {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", entry.Revision, "approval revision does not match the revision awaiting approval", nil)
	}

	frontmatter := record.Frontmatter
	frontmatter.Status = statusWithdrawn
	raw, err := rewriteArtifactFile(root, record.Path, frontmatter, record.Content)
	if err != nil {
		return protocol.OperationResult{}, err
	}
	fileResource := withDigest(protocol.ResourceRef{URI: record.Path}, raw)

	resolved := resolvedContext(request, resolvedTarget)
	return protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "needs_input",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		DerivedStep:      derivedStep,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: frontmatter.Revision, Kind: "revision", Revision: frontmatter.ContentDigest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{writeEffect(request, "artifact-file", fileResource, fileResource, len(raw))},
		Next: protocol.NextAction{
			Operation: "virgil.continue",
			Condition: "revision withdrawn; new content proposal required",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "REVISION_WITHDRAWN",
				Severity:   "info",
				Scope:      derivedStep,
				Condition:  fmt.Sprintf("revision %s of %s was withdrawn for requested changes", frontmatter.Revision, derivedStep),
				NextAction: "submit a new content_proposal for " + derivedStep,
			},
		},
	}, nil
}

// ---------------------------------------------------------------------------
// Shared validation and low-level filesystem plumbing
// ---------------------------------------------------------------------------

// validateCommonRequestShape checks the identity, dogma, adapter and policy
// fields shared by virgil.init, virgil.new and virgil.continue requests.
func validateCommonRequestShape(request protocol.OperationRequest) error {
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
	if request.ArtifactStoreRef.Namespace != managedRoot {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace must be exactly docs", nil)
	}
	if !allowedByWritePolicy(request.ArtifactStoreRef.Namespace, request.ArtifactStoreRef.Policy.WriteAllowlist) {
		return typedError("STORE_POLICY_VIOLATION", request.ArtifactStoreRef.Namespace, "namespace is outside the effective write allowlist", nil)
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
	Path  string
	Cause error
}

func (err *publishError) Error() string {
	return "atomic publication failed: " + err.Cause.Error()
}
func (err *publishError) Unwrap() error { return err.Cause }

func resolvedContext(request protocol.OperationRequest, resolvedTarget string) protocol.Context {
	context := protocol.ContextFromRequest(request)
	context.ProjectRef.Target.CanonicalPath = resolvedTarget
	return context
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

func validateConfigPublication(schema SchemaValidator, cfgBytes []byte, result protocol.OperationResult) error {
	if err := schema.Validate(schemaVirgilConfig, cfgBytes); err != nil {
		return typedError("INTERNAL_ERROR", result.Operation, "generated virgil.json violates its bundled schema", err)
	}
	_, err := validateResult(schema, result, nil)
	return err
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
		namespace == managedRoot
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
