// Package repodocs implements the repository-backed project store used by
// virgil.init, virgil.write and virgil.transition. Callers must provide every
// identity boundary explicitly; the package never derives a target or
// project from the current directory.
//
// Layout: repo-docs keeps durable objects at the target root — virgil.json
// (the adapter control file, holding project identity), AGENTS.md (a
// generated guide for AI agents), and the project knowledge base under
// managed_root ("docs/"):
//
//	docs/idea.md                            — project vision
//	docs/requirements/{category}-{slug}.md  — functional/non-functional specs
//	docs/design/{category}-{slug}.md        — architecture, entities, contracts
//	docs/tasks/{slug}.md                    — work items with lifecycle state
//
// Each doc file has JSON frontmatter (DocFrontmatter). Tasks carry a status
// field with a state machine (backlog → refined → active → done → released)
// and refs linking to requirements, design docs, and implementing code.
// There is no project.json/events.jsonl ledger: git is the ledger.
package repodocs

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
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

	docFrontmatterSchema = "virgil.dev/doc/v1alpha1"

	schemaVirgilConfig    = "https://schemas.virgil.dev/planning-slice1/v1alpha1/virgil-config.schema.json"
	schemaDocFrontmatter  = "https://schemas.virgil.dev/planning-slice1/v1alpha1/doc-frontmatter.schema.json"
	schemaOperationResult = "https://schemas.virgil.dev/planning-slice1/v1alpha1/operation-result.schema.json"
	schemaEffectRecord    = "https://schemas.virgil.dev/planning-slice1/v1alpha1/effect-record.schema.json"

	// frontmatterOpen and frontmatterClose delimit the frontmatter fence used
	// for every new write. An HTML comment renders as invisible in GitHub and
	// VS Code's markdown preview, unlike a "---" fence, which both engines
	// interpret as (and render as a table for) YAML frontmatter even though
	// the body is JSON.
	frontmatterOpen  = "<!-- virgil:meta\n"
	frontmatterClose = "\n-->\n\n"

	// frontmatterOpenLegacyJSON and frontmatterOpenLegacyYAML are prior open
	// markers accepted on read only, so documents written before the
	// HTML-comment frontmatter migration continue to parse; all new writes
	// use frontmatterOpen. Both legacy formats share the same closing
	// delimiter, frontmatterCloseLegacy.
	frontmatterOpenLegacyJSON = "---json\n" // pre-rc.7
	frontmatterOpenLegacyYAML = "---\n"     // rc.7 (commit 9fe8805)
	frontmatterCloseLegacy    = "\n---\n\n"
)

// schemaInstallDir and schemaFileName mirror cmd/virgil/install.go's own
// constants of the same name: `virgil install` materializes the canonical
// virgil.json JSON Schema once, under the user's home directory, rather than
// per project. virgil.init points virgil.json's $schema at that shared,
// install-time path instead of writing its own per-project copy.
const (
	schemaInstallDir = ".virgil/schemas"
	schemaFileName   = "virgil-config.schema.json"
)

// installedSchemaPath resolves the absolute path virgil.init points
// virgil.json's $schema field at:
// {homeDir}/.virgil/schemas/virgil-config.schema.json. It fails closed
// (typed INTERNAL_ERROR) when the home directory cannot be resolved, since a
// virgil.json with no usable $schema pointer would silently degrade editor
// autocompletion instead of surfacing the problem.
func installedSchemaPath(operation string) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", typedError("INTERNAL_ERROR", operation, "cannot resolve home directory for the installed virgil.json schema", err)
	}
	return filepath.Join(homeDir, filepath.FromSlash(schemaInstallDir), schemaFileName), nil
}

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

// docRecord is a parsed doc file: its relative path, decoded frontmatter,
// and content body (everything after the closing frontmatter marker).
type docRecord struct {
	Path        string
	Frontmatter protocol.DocFrontmatter
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
		var typed *Error
		if errors.As(err, &typed) {
			return protocol.OperationResult{}, err
		}
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
	schemaPath, err := installedSchemaPath(request.Operation)
	if err != nil {
		return protocol.VirgilConfig{}, nil, err
	}
	cfg := protocol.VirgilConfig{
		Schema:          schemaPath,
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
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{
			writeEffect(request, "virgil-config", cfgResource, cfgResource, len(cfgBytes)),
			writeEffect(request, "agents-doc", agentsResource, agentsResource, len(agentsBytes)),
		},
		Next: protocol.NextAction{
			Operation: "virgil.write",
			Condition: "project is initialized and ready for content",
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
		Artifacts:           []protocol.ObjectPointer{},
		Briefs:              []protocol.ObjectPointer{},
		Events:              []protocol.ObjectPointer{},
		Effects:             []protocol.EffectRecord{},
		Next: protocol.NextAction{
			Operation: "virgil.write",
			Condition: "project is initialized and ready for content",
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
	return cfg, true, nil
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
// copy-rewrite-rename.
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
// virgil.write
// ---------------------------------------------------------------------------

// Write creates or updates a doc file in the project knowledge base.
// The project must already be initialized. targetRoot must be the explicit
// host binding for ProjectRef.
func Write(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	if err := validateWrite(request, targetRoot, clock, canonicalizer, validateJSON); err != nil {
		return protocol.OperationResult{}, err
	}

	var input protocol.WriteInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "write input is not valid JSON", err)
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
	if cfg.ProjectID != request.ProjectRef.ProjectID {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "request targets a different project", nil)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	nowStr := now.UTC().Format(time.RFC3339Nano)

	relative := docRelativePath(input.DocKind, input.Category, input.Slug)

	status := input.Status
	if input.DocKind == protocol.DocKindTask && status == "" {
		status = protocol.TaskStatusBacklog
	}

	// Callers (AI agents, via virgil_write) supply Markdown content freely and
	// cannot be relied on to end it with exactly one newline. Normalize here,
	// before the digest is computed, so the persisted file always satisfies
	// markdownlint's MD047 (single-trailing-newline) and the frontmatter's
	// ContentDigest always matches what loadExistingDoc reads back from disk.
	contentBytes := normalizeTrailingNewline([]byte(input.Content))
	contentDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(contentBytes))

	existing, existingFound, loadDocErr := loadExistingDoc(root, relative, schema, validateJSON)
	if loadDocErr != nil {
		return protocol.OperationResult{}, loadDocErr
	}

	var frontmatter protocol.DocFrontmatter
	if existingFound {
		frontmatter = existing.Frontmatter
		frontmatter.ContentDigest = contentDigest
		frontmatter.UpdatedAt = nowStr
		if status != "" {
			frontmatter.Status = status
		}
		if input.Refs != nil {
			frontmatter.Refs = input.Refs
		}
	} else {
		frontmatter = protocol.DocFrontmatter{
			Schema:          docFrontmatterSchema,
			ProtocolVersion: request.ProtocolVersion,
			DocKind:         input.DocKind,
			ProjectID:       request.ProjectRef.ProjectID,
			Slug:            input.Slug,
			Category:        input.Category,
			Status:          status,
			Refs:            input.Refs,
			ContentDigest:   contentDigest,
			CreatedAt:       nowStr,
			UpdatedAt:       nowStr,
		}
	}

	if input.DocKind == protocol.DocKindTask && frontmatter.Refs == nil {
		frontmatter.Refs = &protocol.TaskRefs{}
	}

	var raw []byte
	var writeErr error
	if existingFound {
		raw, writeErr = rewriteDocFile(root, relative, frontmatter, contentBytes)
	} else {
		raw, writeErr = writeDocFile(root, relative, frontmatter, contentBytes)
	}
	if writeErr != nil {
		return protocol.OperationResult{}, writeErr
	}

	// Navigation indexes are a convenience for humans and RAG-style readers
	// browsing docs/ directly; they are not part of the durable write
	// contract, so a failure here is logged and swallowed rather than
	// failing the virgil.write operation that already succeeded.
	regenerateIndexes(resolvedTarget)

	fileResource := withDigest(protocol.ResourceRef{URI: relative}, raw)
	resolved := resolvedContext(request, resolvedTarget)
	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: relative, Kind: input.DocKind, Revision: contentDigest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{writeEffect(request, "doc-file", fileResource, fileResource, len(raw))},
		Next: protocol.NextAction{
			Operation: "virgil.write",
			Condition: "document written; continue adding project content",
		},
		Diagnostics: []protocol.Diagnostic{},
	}
	return validateResult(schema, result, nil)
}

func validateWrite(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.write" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs Write accepts only the current virgil.write protocol", nil)
	}
	if err := validateCommonRequestShape(request); err != nil {
		return err
	}
	if err := validateJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "write input is ambiguous JSON", err)
	}
	var input protocol.WriteInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "write input cannot be decoded", err)
	}
	if !protocol.IsValidDocKind(input.DocKind) {
		return typedError("PRECONDITION_FAILED", request.Operation, "doc_kind must be one of: idea, requirement, design, task", nil)
	}
	if input.DocKind != protocol.DocKindIdea && input.Slug == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "slug is required for requirement, design and task documents", nil)
	}
	if input.DocKind == protocol.DocKindIdea && input.Slug != "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "slug is not applicable for idea documents", nil)
	}
	if input.Slug != "" && !safeRelativePath(input.Slug) {
		return typedError("STORE_POLICY_VIOLATION", input.Slug, "slug must be a safe relative path component", nil)
	}
	if input.Category != "" && !safeRelativePath(input.Category) {
		return typedError("STORE_POLICY_VIOLATION", input.Category, "category must be a safe relative path component", nil)
	}
	if input.Content == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "content is required", nil)
	}
	if input.Status != "" && !protocol.IsValidTaskStatus(input.Status) {
		return typedError("PRECONDITION_FAILED", request.Operation, "status must be a valid task status", nil)
	}
	if input.Status != "" && input.DocKind != protocol.DocKindTask {
		return typedError("PRECONDITION_FAILED", request.Operation, "status is only applicable to task documents", nil)
	}
	if input.Refs != nil && input.DocKind != protocol.DocKindTask {
		return typedError("PRECONDITION_FAILED", request.Operation, "refs are only applicable to task documents", nil)
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
// virgil.transition
// ---------------------------------------------------------------------------

// Transition changes the status of a task document following the state
// machine rules: backlog → refined → active → done → released.
// The project must already be initialized. targetRoot must be the explicit
// host binding for ProjectRef.
func Transition(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, schema SchemaValidator, validateJSON JSONValidator) (protocol.OperationResult, error) {
	if err := validateTransition(request, targetRoot, clock, canonicalizer, validateJSON); err != nil {
		return protocol.OperationResult{}, err
	}

	var input protocol.TransitionInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "transition input is not valid JSON", err)
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
	if cfg.ProjectID != request.ProjectRef.ProjectID {
		return protocol.OperationResult{}, typedError("IDENTITY_AMBIGUOUS", request.Operation, "request targets a different project", nil)
	}

	now := clock.Now()
	if now.IsZero() {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "clock must return a non-zero instant", nil)
	}
	nowStr := now.UTC().Format(time.RFC3339Nano)

	relative := path.Join(managedRoot, protocol.DocDir(protocol.DocKindTask), input.TaskSlug+".md")

	existing, existingFound, loadDocErr := loadExistingDoc(root, relative, schema, validateJSON)
	if loadDocErr != nil {
		return protocol.OperationResult{}, loadDocErr
	}
	if !existingFound {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "task does not exist: "+input.TaskSlug, nil)
	}
	if existing.Frontmatter.DocKind != protocol.DocKindTask {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation, "document is not a task", nil)
	}

	currentStatus := existing.Frontmatter.Status
	if !protocol.IsValidTransition(currentStatus, input.NewStatus) {
		return protocol.OperationResult{}, typedError("PRECONDITION_FAILED", request.Operation,
			fmt.Sprintf("transition from %q to %q is not allowed", currentStatus, input.NewStatus), nil)
	}

	frontmatter := existing.Frontmatter
	frontmatter.Status = input.NewStatus
	frontmatter.UpdatedAt = nowStr
	if input.RefsUpdate != nil {
		frontmatter.Refs = input.RefsUpdate
	}

	raw, writeErr := rewriteDocFile(root, relative, frontmatter, existing.Content)
	if writeErr != nil {
		return protocol.OperationResult{}, writeErr
	}

	// Indexes are regenerated after every doc mutation, not just virgil.write,
	// so navigation stays consistent regardless of which operation touched
	// docs/. Best-effort: any failure is logged and swallowed rather than
	// failing the virgil.transition operation that already succeeded.
	regenerateIndexes(resolvedTarget)

	fileResource := withDigest(protocol.ResourceRef{URI: relative}, raw)
	resolved := resolvedContext(request, resolvedTarget)
	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "success",
		RequestedContext: protocol.ContextFromRequest(request),
		ResolvedContext:  &resolved,
		Artifacts: []protocol.ObjectPointer{
			{ObjectID: relative, Kind: "task", Revision: frontmatter.ContentDigest},
		},
		Briefs:  []protocol.ObjectPointer{},
		Events:  []protocol.ObjectPointer{},
		Effects: []protocol.EffectRecord{writeEffect(request, "doc-file", fileResource, fileResource, len(raw))},
		Next: protocol.NextAction{
			Operation: "virgil.transition",
			Condition: fmt.Sprintf("task %s transitioned to %s", input.TaskSlug, input.NewStatus),
		},
		Diagnostics: []protocol.Diagnostic{},
	}
	return validateResult(schema, result, nil)
}

func validateTransition(request protocol.OperationRequest, targetRoot string, clock Clock, canonicalizer Canonicalizer, validateJSON JSONValidator) error {
	if request.ProtocolVersion != protocol.Version || request.Operation != "virgil.transition" {
		return typedError("PRECONDITION_FAILED", request.Operation, "repo-docs Transition accepts only the current virgil.transition protocol", nil)
	}
	if err := validateCommonRequestShape(request); err != nil {
		return err
	}
	if err := validateJSON(request.Input); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "transition input is ambiguous JSON", err)
	}
	var input protocol.TransitionInput
	if err := decodeSingleJSON(request.Input, &input, validateJSON); err != nil {
		return typedError("IDENTITY_AMBIGUOUS", request.Operation, "transition input cannot be decoded", err)
	}
	if input.TaskSlug == "" {
		return typedError("PRECONDITION_FAILED", request.Operation, "task_slug is required", nil)
	}
	if !safeRelativePath(input.TaskSlug) {
		return typedError("STORE_POLICY_VIOLATION", input.TaskSlug, "task_slug must be a safe relative path component", nil)
	}
	if !protocol.IsValidTaskStatus(input.NewStatus) {
		return typedError("PRECONDITION_FAILED", request.Operation, "new_status must be a valid task status", nil)
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
// Doc file I/O: docs/{dir}/{name}.md
// ---------------------------------------------------------------------------

func docRelativePath(docKind, category, slug string) string {
	dir := protocol.DocDir(docKind)
	filename := protocol.DocFileName(docKind, category, slug)
	if dir == "" {
		return path.Join(managedRoot, filename)
	}
	return path.Join(managedRoot, dir, filename)
}

// normalizeTrailingNewline trims any trailing newline characters from
// content and appends exactly one. Content is the final segment of every
// published doc file, so this is what makes the file as a whole end with a
// single trailing newline (markdownlint MD047) regardless of whether the
// caller's Markdown ended with no newline, one, or several blank lines.
func normalizeTrailingNewline(content []byte) []byte {
	trimmed := bytes.TrimRight(content, "\n")
	return append(trimmed, '\n')
}

// serializeDocFile renders frontmatter and content into the on-disk
// representation: an HTML-comment delimited JSON block followed by the
// Markdown content body.
func serializeDocFile(frontmatter protocol.DocFrontmatter, content []byte) ([]byte, error) {
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

// parseDocFrontmatter splits a doc file into its decoded JSON frontmatter
// and its content body. It accepts the current open marker plus two legacy
// open markers (pre-rc.7 "---json\n" and rc.7 "---\n") so documents written
// before the HTML-comment frontmatter migration continue to parse. None of
// the three markers is a prefix of another, so detection is unambiguous.
func parseDocFrontmatter(raw []byte) (protocol.DocFrontmatter, []byte, error) {
	var openMarker, closeMarker string
	switch {
	case bytes.HasPrefix(raw, []byte(frontmatterOpen)):
		openMarker, closeMarker = frontmatterOpen, frontmatterClose
	case bytes.HasPrefix(raw, []byte(frontmatterOpenLegacyJSON)):
		openMarker, closeMarker = frontmatterOpenLegacyJSON, frontmatterCloseLegacy
	case bytes.HasPrefix(raw, []byte(frontmatterOpenLegacyYAML)):
		openMarker, closeMarker = frontmatterOpenLegacyYAML, frontmatterCloseLegacy
	default:
		return protocol.DocFrontmatter{}, nil, fmt.Errorf("doc file does not start with %q", frontmatterOpen)
	}
	rest := raw[len(openMarker):]
	closeIndex := bytes.Index(rest, []byte(closeMarker))
	if closeIndex < 0 {
		return protocol.DocFrontmatter{}, nil, fmt.Errorf("doc file has no closing frontmatter marker %q", closeMarker)
	}
	frontmatterBytes := rest[:closeIndex]
	content := rest[closeIndex+len(closeMarker):]
	var frontmatter protocol.DocFrontmatter
	decoder := json.NewDecoder(bytes.NewReader(frontmatterBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&frontmatter); err != nil {
		return protocol.DocFrontmatter{}, nil, fmt.Errorf("decode doc frontmatter: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return protocol.DocFrontmatter{}, nil, fmt.Errorf("doc frontmatter contains multiple JSON values")
		}
		return protocol.DocFrontmatter{}, nil, fmt.Errorf("doc frontmatter is not well-formed JSON: %w", err)
	}
	return frontmatter, content, nil
}

// writeDocFile publishes a brand-new doc file using create-exclusive-and-
// rename. The doc's parent directory chain is created if it does not already
// exist.
func writeDocFile(root *os.Root, relative string, frontmatter protocol.DocFrontmatter, content []byte) ([]byte, error) {
	raw, err := serializeDocFile(frontmatter, content)
	if err != nil {
		return nil, typedError("INTERNAL_ERROR", relative, "cannot encode doc file", err)
	}
	parentDir := path.Dir(relative)
	tempName := path.Join(parentDir, ".doc-"+stableID("tmp", relative, fmt.Sprintf("%x", sha256.Sum256(raw))))
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
		return nil, typedError("ATOMICITY_UNSUPPORTED", relative, "cannot atomically publish doc file", err)
	}
	published = true
	if err := syncDirectory(root, parentDir); err != nil {
		return nil, err
	}
	return raw, nil
}

// rewriteDocFile durably replaces an existing doc file using
// copy-rewrite-rename.
func rewriteDocFile(root *os.Root, relative string, frontmatter protocol.DocFrontmatter, content []byte) ([]byte, error) {
	raw, err := serializeDocFile(frontmatter, content)
	if err != nil {
		return nil, typedError("INTERNAL_ERROR", relative, "cannot encode doc file", err)
	}
	parentDir := path.Dir(relative)
	tempName := path.Join(parentDir, ".doc-"+stableID("tmp", relative, fmt.Sprintf("%x", sha256.Sum256(raw))))
	if err := root.Remove(tempName); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, typedError("ATOMICITY_UNSUPPORTED", tempName, "cannot clear crashed staging file", err)
	}
	if err := writeExclusive(root, tempName, raw); err != nil {
		return nil, err
	}
	if err := root.Rename(tempName, relative); err != nil {
		_ = root.Remove(tempName)
		return nil, typedError("ATOMICITY_UNSUPPORTED", relative, "cannot atomically replace doc file", err)
	}
	if err := syncDirectory(root, parentDir); err != nil {
		return nil, err
	}
	return raw, nil
}

// loadExistingDoc reads and validates a single doc file from the target root.
func loadExistingDoc(root *os.Root, relative string, schema SchemaValidator, validateJSON JSONValidator) (docRecord, bool, error) {
	info, statErr := root.Lstat(relative)
	if errors.Is(statErr, fs.ErrNotExist) {
		return docRecord{}, false, nil
	}
	if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "doc file is not a regular file", statErr)
	}
	raw, err := root.ReadFile(relative)
	if err != nil {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "cannot read doc file", err)
	}
	frontmatter, content, err := parseDocFrontmatter(raw)
	if err != nil {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "doc file frontmatter is malformed", err)
	}
	frontmatterBytes, err := json.Marshal(frontmatter)
	if err != nil {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "cannot re-encode doc frontmatter", err)
	}
	if err := schema.Validate(schemaDocFrontmatter, frontmatterBytes); err != nil {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "doc frontmatter violates its bundled schema", err)
	}
	wantDigest := fmt.Sprintf("sha256:%x", sha256.Sum256(content))
	if frontmatter.ContentDigest != wantDigest {
		return docRecord{}, false, typedError("CORRUPT_LEDGER", relative, "doc content does not match its frontmatter digest", nil)
	}
	return docRecord{Path: relative, Frontmatter: frontmatter, Content: content}, true, nil
}

// ---------------------------------------------------------------------------
// Navigation index: docs/README.md
// ---------------------------------------------------------------------------

// indexFileName is the plain-markdown navigation file regenerated at
// docs/README.md after every successful virgil.write or virgil.transition.
// It carries no frontmatter and is always fully overwritten; it is a
// browsing convenience, not part of the knowledge base's durable content.
// Named README.md (not index.md) so GitHub and similar viewers auto-render
// it as the directory's landing page. There is exactly one index file — no
// regional README.md is generated inside docs/requirements/, docs/design/
// or docs/tasks/ — so the document map on docs/README.md is the single
// source of navigation truth.
const indexFileName = "README.md"

// navEntry is a single row rendered into a navigation index.
type navEntry struct {
	// FileName is the doc's file name relative to its own directory, e.g.
	// "idea.md" or "functional-user-auth.md".
	FileName string
	// Title is the doc's first "# Heading" line, or FileName without its
	// extension when the doc body has no heading.
	Title string
	// Status is the task's frontmatter status; empty for non-task kinds.
	Status string
}

// regenerateIndexes rescans docs/ after a successful virgil.write or
// virgil.transition and republishes docs/README.md. Index generation is
// best-effort: any failure is logged and swallowed so it never turns an
// already-successful operation into a failed one.
func regenerateIndexes(targetRoot string) {
	if err := writeNavigationIndexes(targetRoot); err != nil {
		log.Printf("virgil: failed to regenerate docs/README.md: %v", err)
	}
}

func writeNavigationIndexes(targetRoot string) error {
	root, _, err := openTargetRoot(targetRoot)
	if err != nil {
		return err
	}
	defer root.Close()

	var idea *navEntry
	byKind := map[string][]navEntry{
		protocol.DocKindRequirement: nil,
		protocol.DocKindDesign:      nil,
		protocol.DocKindTask:        nil,
	}

	walkErr := fs.WalkDir(root.FS(), managedRoot, func(name string, entry fs.DirEntry, entryErr error) error {
		if entryErr != nil {
			return entryErr
		}
		if entry.IsDir() {
			return nil
		}
		base := path.Base(name)
		if base == indexFileName || path.Ext(base) != ".md" {
			return nil
		}
		raw, readErr := root.ReadFile(name)
		if readErr != nil {
			return readErr
		}
		frontmatter, content, parseErr := parseDocFrontmatter(raw)
		if parseErr != nil {
			return parseErr
		}
		found := navEntry{
			FileName: base,
			Title:    docTitle(content, base),
			Status:   frontmatter.Status,
		}
		switch frontmatter.DocKind {
		case protocol.DocKindIdea:
			ideaCopy := found
			idea = &ideaCopy
		case protocol.DocKindRequirement, protocol.DocKindDesign, protocol.DocKindTask:
			byKind[frontmatter.DocKind] = append(byKind[frontmatter.DocKind], found)
		}
		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	for kind := range byKind {
		entries := byKind[kind]
		sort.Slice(entries, func(i, j int) bool { return entries[i].FileName < entries[j].FileName })
	}

	requirements := byKind[protocol.DocKindRequirement]
	design := byKind[protocol.DocKindDesign]
	tasks := byKind[protocol.DocKindTask]

	return writeGlobalIndex(root, idea, requirements, design, tasks)
}

// docTitle returns the text of the first "# Heading" line in content,
// falling back to fileName without its extension when the body has no
// top-level heading.
func docTitle(content []byte, fileName string) string {
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# ") {
			title := strings.TrimSpace(strings.TrimPrefix(trimmed, "# "))
			if title != "" {
				return title
			}
		}
	}
	return strings.TrimSuffix(fileName, ".md")
}

// renderIndexSection renders a "## Heading" block followed by its list
// items, or the bare heading when items is empty. It never emits more than
// one blank line, regardless of whether items is empty.
func renderIndexSection(level, heading string, items []string) string {
	block := level + " " + heading
	if len(items) > 0 {
		block += "\n\n" + strings.Join(items, "\n")
	}
	return block
}

// writeGlobalIndex publishes docs/README.md: a mermaid flowchart document
// map (omitted when the project has no documents at all, e.g. immediately
// after virgil.init) followed by sections listing every document grouped by
// kind.
func writeGlobalIndex(root *os.Root, idea *navEntry, requirements, design, tasks []navEntry) error {
	var ideaItems []string
	if idea != nil {
		ideaItems = []string{fmt.Sprintf("- [%s](idea.md)", idea.Title)}
	}
	requirementItems := make([]string, 0, len(requirements))
	for _, entry := range requirements {
		requirementItems = append(requirementItems, fmt.Sprintf("- [%s](requirements/%s)", entry.Title, entry.FileName))
	}
	designItems := make([]string, 0, len(design))
	for _, entry := range design {
		designItems = append(designItems, fmt.Sprintf("- [%s](design/%s)", entry.Title, entry.FileName))
	}
	taskItems := make([]string, 0, len(tasks))
	for _, entry := range tasks {
		taskItems = append(taskItems, fmt.Sprintf("- [%s](tasks/%s)", entry.Title, entry.FileName))
	}

	parts := []string{"# Project Documentation"}
	if documentMap := renderDocumentMap(idea, requirements, design, tasks); documentMap != "" {
		parts = append(parts, documentMap)
	} else {
		parts = append(parts, "No documents yet — use `virgil.write` to create your first document.")
	}
	parts = append(parts,
		renderIndexSection("##", "Idea", ideaItems),
		renderIndexSection("##", "Requirements", requirementItems),
		renderIndexSection("##", "Design", designItems),
		renderIndexSection("##", "Tasks", taskItems),
	)
	body := strings.Join(parts, "\n\n")
	return writeIndexFile(root, path.Join(managedRoot, indexFileName), normalizeTrailingNewline([]byte(body)))
}

// renderDocumentMap renders a fenced ```mermaid flowchart TD block showing
// how every existing document relates to the idea and its own kind
// category. It returns "" when the project has no documents at all (idea
// is nil and every kind slice is empty), so writeGlobalIndex can fall back
// to a plain placeholder message instead of an empty diagram. A kind with
// no documents yet is simply omitted from the diagram — there is no
// leaf-less "Requirements" node cluttering the map for a project that has
// never written a requirement.
func renderDocumentMap(idea *navEntry, requirements, design, tasks []navEntry) string {
	if idea == nil && len(requirements) == 0 && len(design) == 0 && len(tasks) == 0 {
		return ""
	}

	lines := []string{"```mermaid", "flowchart TD"}
	if idea != nil {
		lines = append(lines, fmt.Sprintf("    IDEA[%s]", mermaidLabel(idea.FileName)))
	}
	lines = append(lines, renderDocumentMapCategory(idea != nil, "REQ", "R", "Requirements", requirements)...)
	lines = append(lines, renderDocumentMapCategory(idea != nil, "DESIGN", "D", "Design", design)...)
	lines = append(lines, renderDocumentMapCategory(idea != nil, "TASKS", "T", "Tasks", tasks)...)
	lines = append(lines, "```")
	return strings.Join(lines, "\n")
}

// renderDocumentMapCategory renders the mermaid lines for a single kind
// category (Requirements, Design or Tasks): the category node itself
// (linked from IDEA when an idea document exists), followed by one leaf
// node per document of that kind. It returns nil when entries is empty, so
// a kind with no documents contributes no lines to the diagram at all.
func renderDocumentMapCategory(hasIdea bool, categoryID, nodePrefix, heading string, entries []navEntry) []string {
	if len(entries) == 0 {
		return nil
	}
	var lines []string
	if hasIdea {
		lines = append(lines, fmt.Sprintf("    IDEA --> %s[%s]", categoryID, heading))
	} else {
		lines = append(lines, fmt.Sprintf("    %s[%s]", categoryID, heading))
	}
	for _, entry := range entries {
		nodeID := mermaidNodeID(nodePrefix, strings.TrimSuffix(entry.FileName, ".md"))
		lines = append(lines, fmt.Sprintf("    %s --> %s[%s]", categoryID, nodeID, mermaidLabel(entry.FileName)))
	}
	return lines
}

// mermaidNodeID derives a mermaid-safe flowchart node ID from an arbitrary
// document slug: every rune outside [A-Za-z0-9] collapses to a single
// hyphen, and the result is prefixed with prefix (a fixed, already-safe
// per-kind letter: "R", "D" or "T") so two documents can never collide with
// each other or with the fixed category/idea node IDs, and so the ID always
// starts with a letter regardless of what the slug starts with.
func mermaidNodeID(prefix, raw string) string {
	var builder strings.Builder
	builder.WriteString(prefix)
	previousHyphen := false
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			builder.WriteRune(r)
			previousHyphen = false
		default:
			if !previousHyphen {
				builder.WriteRune('-')
				previousHyphen = true
			}
		}
	}
	return strings.TrimRight(builder.String(), "-")
}

// mermaidLabel renders text as a double-quoted mermaid node label so
// characters mermaid would otherwise treat as syntax (brackets, quotes,
// pipes) render as literal text instead of breaking the diagram.
func mermaidLabel(text string) string {
	return fmt.Sprintf("%q", text)
}

// writeIndexFile fully overwrites a navigation index file. Unlike
// writeDocFile/rewriteDocFile, no atomic rename dance is used: index files
// carry no idempotency guarantees and are regenerated in full on every
// virgil.write, so plain truncate-and-write is sufficient.
func writeIndexFile(root *os.Root, relative string, content []byte) error {
	return root.WriteFile(relative, content, 0o600)
}

// ---------------------------------------------------------------------------
// Shared validation and low-level filesystem plumbing
// ---------------------------------------------------------------------------

// validateCommonRequestShape checks the identity, dogma, adapter and policy
// fields shared by all Virgil operation requests.
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
