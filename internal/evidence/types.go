// Package evidence validates and atomically publishes T0 evidence bundles.
// It consumes only explicit roots, timestamps and identifiers; it never derives
// project identity from the current directory or ambient time.
package evidence

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"runtime"
	"time"

	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

const (
	manifestFile     = "manifest.json"
	traceFile        = "trace.json"
	runnerReportFile = "runner-report.json"
	eventLogFile     = "events.jsonl"
	projectStateFile = "project-state.json"

	mediaJSON   = "application/json"
	mediaNDJSON = "application/x-ndjson"

	maxResourceBytes = 32 << 20
)

var safeIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// ImmutableReference is the public immutable resource shape used by the
// evidence schemas.
type ImmutableReference struct {
	URI      string `json:"uri"`
	Revision string `json:"revision,omitempty"`
	Digest   string `json:"digest"`
}

// Document is a snapshot or diff document. ID must match snapshot_id or
// diff_id inside Bytes and is also used as its traversal-safe filename.
type Document struct {
	ID    string
	Bytes []byte
}

// SecretPolicy permits explicitly reviewed JSON pointers that would otherwise
// be rejected by the secret scanner. The default is an empty allowlist.
type SecretPolicy struct {
	AllowedJSONPointers []string
}

// StagingConflictError reports a pre-existing staging directory. Publication
// fails closed because this package cannot distinguish a live publisher from a
// crash remnant without an explicit ownership or lease protocol. It never
// deletes staging it did not create in the current Publish call.
type StagingConflictError struct {
	Path string
}

func (conflict *StagingConflictError) Error() string {
	return fmt.Sprintf("evidence staging directory %q already exists; manual reconciliation is required", conflict.Path)
}

// Input is the complete, already-observed material for one T0 evidence bundle.
// Trace and RunnerReport have their integrity fields recalculated by this
// package. Checks and outcome are read from RunnerReport and cross-checked with
// Trace; they are never accepted from a worker-specific pass flag.
type Input struct {
	BundleID string

	Fixture []byte

	SourceRevision ImmutableReference
	Environment    json.RawMessage

	Trace        []byte
	RunnerReport []byte
	Snapshots    []Document
	Diffs        []Document

	FinalTargetDiffID string
	FinalStoreDiffID  string

	EventLog     []byte
	ProjectState []byte
}

// Publisher owns the explicit publication boundary. PublishedAt is supplied
// by the caller's deterministic clock; Publish never calls time.Now.
type Publisher struct {
	registry     *contracts.Registry
	evidenceRoot string
	targetRoot   string
	publishedAt  time.Time
	secretPolicy SecretPolicy
}

// Layout exposes the deterministic final URIs so callers can construct the
// immutable references inside RunnerReport before publication.
type Layout struct {
	BundleRoot   string
	Manifest     string
	Trace        string
	RunnerReport string
	EventLog     string
	ProjectState string
}

// NewPublisher validates the explicit roots and deterministic clock. Both roots
// must already exist and must not overlap.
func NewPublisher(
	registry *contracts.Registry,
	evidenceRoot string,
	targetRoot string,
	publishedAt time.Time,
	secretPolicy SecretPolicy,
) (*Publisher, error) {
	if registry == nil {
		return nil, fmt.Errorf("evidence registry is required")
	}
	if !supportedUnix() {
		return nil, fmt.Errorf("evidence publication is unsupported on %s: Unix directory rename and fsync are required", runtime.GOOS)
	}
	if publishedAt.IsZero() {
		return nil, fmt.Errorf("explicit published timestamp is required")
	}
	resolvedEvidence, err := resolveRealDirectory(evidenceRoot, "evidence root")
	if err != nil {
		return nil, err
	}
	resolvedTarget, err := resolveRealDirectory(targetRoot, "target root")
	if err != nil {
		return nil, err
	}
	if pathsOverlap(resolvedEvidence, resolvedTarget) {
		return nil, fmt.Errorf("evidence root and target root must not overlap")
	}
	if err := validateSecretPolicy(secretPolicy); err != nil {
		return nil, err
	}
	return &Publisher{
		registry:     registry,
		evidenceRoot: resolvedEvidence,
		targetRoot:   resolvedTarget,
		publishedAt:  publishedAt.UTC(),
		secretPolicy: secretPolicy,
	}, nil
}

// PlanLayout returns deterministic final resource paths for bundleID. It does
// not create or modify the filesystem.
func (publisher *Publisher) PlanLayout(bundleID string) (Layout, error) {
	if publisher == nil {
		return Layout{}, fmt.Errorf("publisher is required")
	}
	if err := validateID(bundleID, "bundle_id"); err != nil {
		return Layout{}, err
	}
	root := filepath.Join(publisher.evidenceRoot, bundleID)
	return Layout{
		BundleRoot:   root,
		Manifest:     filepath.Join(root, manifestFile),
		Trace:        filepath.Join(root, traceFile),
		RunnerReport: filepath.Join(root, runnerReportFile),
		EventLog:     filepath.Join(root, eventLogFile),
		ProjectState: filepath.Join(root, projectStateFile),
	}, nil
}

// Snapshot returns the deterministic URI for a snapshot document.
func (layout Layout) Snapshot(id string) (string, error) {
	if err := validateID(id, "snapshot_id"); err != nil {
		return "", err
	}
	return filepath.Join(layout.BundleRoot, "snapshots", id+".json"), nil
}

// Diff returns the deterministic URI for a diff document.
func (layout Layout) Diff(id string) (string, error) {
	if err := validateID(id, "diff_id"); err != nil {
		return "", err
	}
	return filepath.Join(layout.BundleRoot, "diffs", id+".json"), nil
}

// Reference computes an immutable reference over the exact bytes supplied.
func Reference(uri, revision string, content []byte) ImmutableReference {
	return ImmutableReference{URI: uri, Revision: revision, Digest: digest(content)}
}

// Publish validates, cross-checks and atomically publishes one bundle. The
// returned reference points to manifest.json and is the only public authority.
// Crash recovery is intentionally not inferred: a pre-existing deterministic
// staging directory returns StagingConflictError and is left untouched.
func (publisher *Publisher) Publish(input Input) (wire.EvidenceReference, error) {
	prepared, err := publisher.prepare(input)
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	if err := publisher.publish(prepared); err != nil {
		return wire.EvidenceReference{}, err
	}
	return wire.EvidenceReference{URI: prepared.layout.Manifest, Digest: digest(prepared.manifest)}, nil
}

type preparedBundle struct {
	layout   Layout
	files    []preparedFile
	manifest []byte
}

type preparedFile struct {
	relative string
	content  []byte
}

type fixtureReference struct {
	FixtureID       string `json:"fixture_id"`
	FixtureRevision string `json:"fixture_revision"`
	Digest          string `json:"digest"`
}

type environmentSnapshot struct {
	OS             string                    `json:"os"`
	Architecture   string                    `json:"architecture"`
	Isolation      protocol.ComponentProfile `json:"isolation"`
	NetworkProfile string                    `json:"network_profile"`
	ImageDigest    string                    `json:"image_digest,omitempty"`
}

type checkResult struct {
	CheckID string `json:"check_id"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
}

type outcome struct {
	Status       string `json:"status"`
	FailureClass string `json:"failure_class,omitempty"`
	Reason       string `json:"reason"`
}

type bundleContent struct {
	Role      string             `json:"role"`
	SchemaID  string             `json:"schema_id"`
	MediaType string             `json:"media_type"`
	Resource  ImmutableReference `json:"resource"`
}

type manifest struct {
	SchemaVersion       string                  `json:"schema_version"`
	ProtocolVersion     string                  `json:"protocol_version"`
	BundleID            string                  `json:"bundle_id"`
	Layer               string                  `json:"layer"`
	Fixture             fixtureReference        `json:"fixture"`
	SourceRevision      ImmutableReference      `json:"source_revision"`
	TargetBaseline      protocol.TargetRef      `json:"target_baseline"`
	AdapterProfile      protocol.AdapterProfile `json:"adapter_profile"`
	RuntimeCapabilities protocol.HostRef        `json:"runtime_capabilities"`
	Environment         json.RawMessage         `json:"environment"`
	Trace               ImmutableReference      `json:"trace"`
	RunnerReport        ImmutableReference      `json:"runner_report"`
	Contents            []bundleContent         `json:"contents"`
	Diffs               diffSet                 `json:"diffs"`
	Checks              []checkResult           `json:"checks"`
	Outcome             outcome                 `json:"outcome"`
	SecretRedaction     secretRedaction         `json:"secret_redaction"`
	PublishedAtomically bool                    `json:"published_atomically"`
	PublishedAt         string                  `json:"published_at"`
	Integrity           integrity               `json:"integrity"`
}

type diffSet struct {
	Target ImmutableReference `json:"target"`
	Store  ImmutableReference `json:"store"`
}

type secretRedaction struct {
	Status    string   `json:"status"`
	Mechanism string   `json:"mechanism"`
	Findings  []string `json:"findings"`
}

type integrity struct {
	Digest           string `json:"digest,omitempty"`
	Canonicalization string `json:"canonicalization"`
}

func validateID(id, field string) error {
	if !safeIDPattern.MatchString(id) || id == "." || id == ".." {
		return fmt.Errorf("%s %q is not a safe deterministic identifier", field, id)
	}
	return nil
}
