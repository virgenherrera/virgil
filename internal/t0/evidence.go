package t0

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/evidence"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

const (
	traceSchemaVersion    = "virgil.dev/agent-interaction-trace/v1alpha1"
	reportSchemaVersion   = "virgil.dev/runner-observation-report/v1alpha1"
	snapshotSchemaVersion = "virgil.dev/filesystem-snapshot/v1alpha1"
	diffSchemaVersion     = "virgil.dev/filesystem-diff/v1alpha1"
)

type processCapture struct {
	Stdout streamCapture
	Stderr streamCapture
}

type streamCapture struct {
	ByteCount int64  `json:"byte_count"`
	SHA256    string `json:"sha256"`
	Truncated bool   `json:"truncated"`
	Redacted  bool   `json:"redacted"`
}

func captureProcessStreams(stdout, stderr []byte, stdoutTruncated, stderrTruncated bool) processCapture {
	return processCapture{
		Stdout: streamCapture{ByteCount: int64(len(stdout)), SHA256: sha256Digest(stdout), Truncated: stdoutTruncated, Redacted: false},
		Stderr: streamCapture{ByteCount: int64(len(stderr)), SHA256: sha256Digest(stderr), Truncated: stderrTruncated, Redacted: false},
	}
}

type evidenceFixtureRef struct {
	FixtureID       string `json:"fixture_id"`
	FixtureRevision string `json:"fixture_revision"`
	Digest          string `json:"digest"`
}

type evidenceOutcome struct {
	Status       string `json:"status"`
	FailureClass string `json:"failure_class,omitempty"`
	Reason       string `json:"reason"`
}

type evidenceIntegrity struct {
	Digest           string `json:"digest,omitempty"`
	Canonicalization string `json:"canonicalization"`
}

type traceDocument struct {
	SchemaVersion       string                  `json:"schema_version"`
	ProtocolVersion     string                  `json:"protocol_version"`
	TraceID             string                  `json:"trace_id"`
	Fixture             evidenceFixtureRef      `json:"fixture"`
	Layer               string                  `json:"layer"`
	AdapterProfile      protocol.AdapterProfile `json:"adapter_profile"`
	RuntimeCapabilities protocol.HostRef        `json:"runtime_capabilities"`
	StartedAt           string                  `json:"started_at"`
	EndedAt             string                  `json:"ended_at"`
	Entries             []traceEntry            `json:"entries"`
	Outcome             evidenceOutcome         `json:"outcome"`
	Integrity           evidenceIntegrity       `json:"integrity"`
}

type traceEntry struct {
	EntryID          string                     `json:"entry_id"`
	Sequence         int                        `json:"sequence"`
	Timestamp        string                     `json:"timestamp"`
	Kind             string                     `json:"kind"`
	ProcessID        string                     `json:"process_id"`
	Actor            protocol.ActorRef          `json:"actor"`
	CorrelationID    string                     `json:"correlation_id"`
	CausationID      string                     `json:"causation_id"`
	OperationRequest *protocol.OperationRequest `json:"operation_request,omitempty"`
	OperationResult  *protocol.OperationResult  `json:"operation_result,omitempty"`
	Effect           *protocol.EffectRecord     `json:"effect,omitempty"`
	Payload          map[string]any             `json:"payload,omitempty"`
	Evidence         []protocol.ResourceRef     `json:"evidence"`
}

type observedRootDocument struct {
	Kind         string `json:"kind"`
	URI          string `json:"uri"`
	ResolvedPath string `json:"resolved_path"`
	ScopePath    string `json:"scope_path"`
}

type nodeStateDocument struct {
	Type   string `json:"type"`
	Mode   string `json:"mode"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type snapshotEntryDocument struct {
	Path string `json:"path"`
	nodeStateDocument
}

type snapshotDocument struct {
	SchemaVersion   string                  `json:"schema_version"`
	ProtocolVersion string                  `json:"protocol_version"`
	SnapshotID      string                  `json:"snapshot_id"`
	Root            observedRootDocument    `json:"root"`
	CheckpointID    string                  `json:"checkpoint_id"`
	CapturedAt      string                  `json:"captured_at"`
	Entries         []snapshotEntryDocument `json:"entries"`
}

type changeDocument struct {
	Path       string             `json:"path"`
	ChangeType string             `json:"change_type"`
	Before     *nodeStateDocument `json:"before"`
	After      *nodeStateDocument `json:"after"`
}

type diffDocument struct {
	SchemaVersion   string               `json:"schema_version"`
	ProtocolVersion string               `json:"protocol_version"`
	DiffID          string               `json:"diff_id"`
	Root            observedRootDocument `json:"root"`
	FromCheckpoint  string               `json:"from_checkpoint"`
	ToCheckpoint    string               `json:"to_checkpoint"`
	Changes         []changeDocument     `json:"changes"`
}

type intervalDocument struct {
	Before evidence.ImmutableReference `json:"before_snapshot"`
	After  evidence.ImmutableReference `json:"after_snapshot"`
	Diff   evidence.ImmutableReference `json:"diff"`
}

type checkpointDocument struct {
	CheckpointID string           `json:"checkpoint_id"`
	AfterStep    string           `json:"after_step"`
	RelativeTo   string           `json:"relative_to"`
	CapturedAt   string           `json:"captured_at"`
	Target       intervalDocument `json:"target"`
	Store        intervalDocument `json:"store"`
}

type processDocument struct {
	ProcessID    string                      `json:"process_id"`
	PID          int                         `json:"pid"`
	FreshProcess bool                        `json:"fresh_process"`
	Executable   evidence.ImmutableReference `json:"executable"`
	ActionIDs    []string                    `json:"action_ids"`
	RequestIDs   []string                    `json:"request_ids"`
	StartedAt    string                      `json:"started_at"`
	EndedAt      string                      `json:"ended_at"`
	ExitCode     int                         `json:"exit_code"`
	Stdout       streamCapture               `json:"stdout"`
	Stderr       streamCapture               `json:"stderr"`
}

type reportCheckDocument struct {
	CheckID string `json:"check_id"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
}

type reportDocument struct {
	SchemaVersion   string                `json:"schema_version"`
	ProtocolVersion string                `json:"protocol_version"`
	ReportID        string                `json:"report_id"`
	Fixture         evidenceFixtureRef    `json:"fixture"`
	TargetRoot      observedRootDocument  `json:"target_root"`
	StoreRoot       observedRootDocument  `json:"store_root"`
	StartedAt       string                `json:"started_at"`
	EndedAt         string                `json:"ended_at"`
	Processes       []processDocument     `json:"processes"`
	Checkpoints     []checkpointDocument  `json:"checkpoints"`
	Checks          []reportCheckDocument `json:"checks"`
	Outcome         evidenceOutcome       `json:"outcome"`
	Integrity       evidenceIntegrity     `json:"integrity"`
}

type documentSet struct {
	snapshots     map[string]evidence.Document
	snapshotRefs  map[string]evidence.ImmutableReference
	diffs         map[string]evidence.Document
	diffRefs      map[string]evidence.ImmutableReference
	checkpoints   []checkpointDocument
	finalTargetID string
	finalStoreID  string
}

func (runner *Runner) publishScenarioEvidence(
	envelope wire.RunT0Envelope,
	fixture contracts.Fixture,
	targetRoot string,
	baseline checkpointCapture,
	executions []operationExecution,
	checks []wire.CheckResult,
) (wire.EvidenceReference, error) {
	publishedAt, err := time.Parse(time.RFC3339, envelope.Clock.Now)
	if err != nil {
		return wire.EvidenceReference{}, fmt.Errorf("parse explicit evidence clock: %w", err)
	}
	publisher, err := evidence.NewPublisher(runner.registry, envelope.EvidenceRoot, targetRoot, publishedAt, evidence.SecretPolicy{})
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	bundleID := deterministicBundleID(fixture, envelope.Clock.Now)
	layout, err := publisher.PlanLayout(bundleID)
	if err != nil {
		return wire.EvidenceReference{}, err
	}

	resolvedTarget, err := filepath.EvalSymlinks(targetRoot)
	if err != nil {
		return wire.EvidenceReference{}, fmt.Errorf("resolve evidence target: %w", err)
	}
	targetObservation := observedRootDocument{Kind: "target", URI: fixture.Definition.TargetRepo.URI, ResolvedPath: resolvedTarget, ScopePath: "/"}
	storeObservation := observedRootDocument{
		Kind:         "store",
		URI:          fixture.Definition.TargetRepo.URI,
		ResolvedPath: filepath.Join(resolvedTarget, filepath.FromSlash(fixture.Definition.AdapterProfile.ArtifactStore.Namespace)),
		ScopePath:    "/" + fixture.Definition.AdapterProfile.ArtifactStore.Namespace,
	}
	documents, err := prepareObservationDocuments(layout, fixture, publishedAt, targetObservation, storeObservation, baseline, executions)
	if err != nil {
		return wire.EvidenceReference{}, err
	}

	fixtureReference := evidenceFixtureRef{
		FixtureID:       fixture.Definition.FixtureID,
		FixtureRevision: fixture.Definition.FixtureRevision,
		Digest:          sha256Digest(fixture.DefinitionRaw),
	}
	traceEntries, err := observedTraceEntries(fixture, executions, publishedAt)
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	traceBytes, err := json.Marshal(traceDocument{
		SchemaVersion:       traceSchemaVersion,
		ProtocolVersion:     protocol.Version,
		TraceID:             "trace-" + fixture.Definition.FixtureID,
		Fixture:             fixtureReference,
		Layer:               fixture.Definition.Layer,
		AdapterProfile:      fixture.Definition.AdapterProfile,
		RuntimeCapabilities: fixture.Definition.RuntimeCapabilities,
		StartedAt:           publishedAt.UTC().Format(time.RFC3339Nano),
		EndedAt:             publishedAt.UTC().Format(time.RFC3339Nano),
		Entries:             traceEntries,
		Outcome:             passedEvidenceOutcome(),
		Integrity:           evidenceIntegrity{Canonicalization: "RFC8785"},
	})
	if err != nil {
		return wire.EvidenceReference{}, fmt.Errorf("encode interaction trace: %w", err)
	}

	executableReference, err := observedExecutableReference()
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	processes, err := observedProcesses(fixture, executions, executableReference, publishedAt)
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	reportChecks, err := observedReportChecks(checks)
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	reportBytes, err := json.Marshal(reportDocument{
		SchemaVersion:   reportSchemaVersion,
		ProtocolVersion: protocol.Version,
		ReportID:        "report-" + fixture.Definition.FixtureID,
		Fixture:         fixtureReference,
		TargetRoot:      targetObservation,
		StoreRoot:       storeObservation,
		StartedAt:       publishedAt.UTC().Format(time.RFC3339Nano),
		EndedAt:         publishedAt.UTC().Format(time.RFC3339Nano),
		Processes:       processes,
		Checkpoints:     documents.checkpoints,
		Checks:          reportChecks,
		Outcome:         passedEvidenceOutcome(),
		Integrity:       evidenceIntegrity{Canonicalization: "RFC8785"},
	})
	if err != nil {
		return wire.EvidenceReference{}, fmt.Errorf("encode runner observation report: %w", err)
	}

	eventLog, projectState, err := observedProjectAuthority(targetRoot, fixture.Definition.AdapterProfile.ArtifactStore.Namespace)
	if err != nil {
		return wire.EvidenceReference{}, err
	}
	environment, err := json.Marshal(map[string]any{
		"os":              runtimeOS(),
		"architecture":    runtimeArchitecture(),
		"isolation":       fixture.Definition.AdapterProfile.Isolation,
		"network_profile": "disabled",
	})
	if err != nil {
		return wire.EvidenceReference{}, fmt.Errorf("encode environment snapshot: %w", err)
	}

	return publisher.Publish(evidence.Input{
		BundleID:          bundleID,
		Fixture:           fixture.DefinitionRaw,
		SourceRevision:    executableReference,
		Environment:       environment,
		Trace:             traceBytes,
		RunnerReport:      reportBytes,
		Snapshots:         sortedDocuments(documents.snapshots),
		Diffs:             sortedDocuments(documents.diffs),
		FinalTargetDiffID: documents.finalTargetID,
		FinalStoreDiffID:  documents.finalStoreID,
		EventLog:          eventLog,
		ProjectState:      projectState,
	})
}

func deterministicBundleID(fixture contracts.Fixture, timestamp string) string {
	seed := fixture.Definition.FixtureID + "\x00" + fixture.Definition.FixtureRevision + "\x00" + timestamp
	digest := sha256.Sum256([]byte(seed))
	return fmt.Sprintf("%s-%x", fixture.Definition.FixtureID, digest[:8])
}

func passedEvidenceOutcome() evidenceOutcome {
	return evidenceOutcome{Status: "passed", Reason: "all required T0 observations and oracles passed"}
}

func prepareObservationDocuments(
	layout evidence.Layout,
	fixture contracts.Fixture,
	capturedAt time.Time,
	targetRoot observedRootDocument,
	storeRoot observedRootDocument,
	baseline checkpointCapture,
	executions []operationExecution,
) (documentSet, error) {
	set := documentSet{
		snapshots:    make(map[string]evidence.Document),
		snapshotRefs: make(map[string]evidence.ImmutableReference),
		diffs:        make(map[string]evidence.Document),
		diffRefs:     make(map[string]evidence.ImmutableReference),
	}
	captures := map[string]checkpointCapture{"fixture_baseline": baseline}
	byStep := make(map[string]operationExecution, len(executions))
	for _, execution := range executions {
		byStep[execution.StepID] = execution
	}
	if err := set.addSnapshot(layout, fixture.Definition.FixtureID, "target", targetRoot, "fixture_baseline", capturedAt, baseline.Target); err != nil {
		return documentSet{}, err
	}
	if err := set.addSnapshot(layout, fixture.Definition.FixtureID, "store", storeRoot, "fixture_baseline", capturedAt, baseline.Store); err != nil {
		return documentSet{}, err
	}

	for _, expectation := range fixture.Definition.ExpectedCheckpoints {
		execution, ok := byStep[expectation.AfterStep]
		if !ok {
			return documentSet{}, fmt.Errorf("evidence checkpoint %q has no execution", expectation.CheckpointID)
		}
		before, ok := captures[expectation.RelativeTo]
		if !ok {
			return documentSet{}, fmt.Errorf("evidence checkpoint %q has no reference %q", expectation.CheckpointID, expectation.RelativeTo)
		}
		after := execution.Checkpoint
		if err := set.addSnapshot(layout, fixture.Definition.FixtureID, "target", targetRoot, expectation.CheckpointID, capturedAt, after.Target); err != nil {
			return documentSet{}, err
		}
		if err := set.addSnapshot(layout, fixture.Definition.FixtureID, "store", storeRoot, expectation.CheckpointID, capturedAt, after.Store); err != nil {
			return documentSet{}, err
		}
		targetDiffID, err := set.addDiff(layout, fixture.Definition.FixtureID, "target", targetRoot, expectation.RelativeTo, expectation.CheckpointID, before.Target, after.Target)
		if err != nil {
			return documentSet{}, err
		}
		storeDiffID, err := set.addDiff(layout, fixture.Definition.FixtureID, "store", storeRoot, expectation.RelativeTo, expectation.CheckpointID, before.Store, after.Store)
		if err != nil {
			return documentSet{}, err
		}
		set.checkpoints = append(set.checkpoints, checkpointDocument{
			CheckpointID: expectation.CheckpointID,
			AfterStep:    expectation.AfterStep,
			RelativeTo:   expectation.RelativeTo,
			CapturedAt:   capturedAt.UTC().Format(time.RFC3339Nano),
			Target: intervalDocument{
				Before: set.snapshotRefs[snapshotID(fixture.Definition.FixtureID, "target", expectation.RelativeTo)],
				After:  set.snapshotRefs[snapshotID(fixture.Definition.FixtureID, "target", expectation.CheckpointID)],
				Diff:   set.diffRefs[targetDiffID],
			},
			Store: intervalDocument{
				Before: set.snapshotRefs[snapshotID(fixture.Definition.FixtureID, "store", expectation.RelativeTo)],
				After:  set.snapshotRefs[snapshotID(fixture.Definition.FixtureID, "store", expectation.CheckpointID)],
				Diff:   set.diffRefs[storeDiffID],
			},
		})
		captures[expectation.CheckpointID] = after
	}
	if len(fixture.Definition.ExpectedCheckpoints) == 0 {
		return documentSet{}, fmt.Errorf("fixture has no evidence checkpoints")
	}
	lastID := fixture.Definition.ExpectedCheckpoints[len(fixture.Definition.ExpectedCheckpoints)-1].CheckpointID
	last := captures[lastID]
	var err error
	set.finalTargetID, err = set.addDiff(layout, fixture.Definition.FixtureID, "target", targetRoot, "fixture_baseline", lastID, baseline.Target, last.Target)
	if err != nil {
		return documentSet{}, err
	}
	set.finalStoreID, err = set.addDiff(layout, fixture.Definition.FixtureID, "store", storeRoot, "fixture_baseline", lastID, baseline.Store, last.Store)
	if err != nil {
		return documentSet{}, err
	}
	return set, nil
}

func (set *documentSet) addSnapshot(layout evidence.Layout, fixtureID, kind string, root observedRootDocument, checkpointID string, capturedAt time.Time, snapshot map[string]snapshotEntry) error {
	id := snapshotID(fixtureID, kind, checkpointID)
	entries := make([]snapshotEntryDocument, 0, len(snapshot))
	paths := sortedSnapshotPaths(snapshot)
	for _, entryPath := range paths {
		entries = append(entries, snapshotEntryDocument{Path: canonicalObservedPath(entryPath), nodeStateDocument: nodeState(snapshot[entryPath])})
	}
	raw, err := json.Marshal(snapshotDocument{
		SchemaVersion: snapshotSchemaVersion, ProtocolVersion: protocol.Version, SnapshotID: id,
		Root: root, CheckpointID: checkpointID, CapturedAt: capturedAt.UTC().Format(time.RFC3339Nano), Entries: entries,
	})
	if err != nil {
		return fmt.Errorf("encode snapshot %s: %w", id, err)
	}
	uri, err := layout.Snapshot(id)
	if err != nil {
		return err
	}
	set.snapshots[id] = evidence.Document{ID: id, Bytes: raw}
	set.snapshotRefs[id] = evidence.Reference(uri, id, raw)
	return nil
}

func (set *documentSet) addDiff(layout evidence.Layout, fixtureID, kind string, root observedRootDocument, from, to string, before, after map[string]snapshotEntry) (string, error) {
	id := diffID(fixtureID, kind, from, to)
	if _, exists := set.diffs[id]; exists {
		return id, nil
	}
	raw, err := json.Marshal(diffDocument{
		SchemaVersion: diffSchemaVersion, ProtocolVersion: protocol.Version, DiffID: id, Root: root,
		FromCheckpoint: from, ToCheckpoint: to, Changes: observedChanges(before, after),
	})
	if err != nil {
		return "", fmt.Errorf("encode diff %s: %w", id, err)
	}
	uri, err := layout.Diff(id)
	if err != nil {
		return "", err
	}
	set.diffs[id] = evidence.Document{ID: id, Bytes: raw}
	set.diffRefs[id] = evidence.Reference(uri, id, raw)
	return id, nil
}

func snapshotID(fixtureID, kind, checkpoint string) string {
	return fixtureID + "-" + kind + "-" + checkpoint
}

func diffID(fixtureID, kind, from, to string) string {
	return fixtureID + "-" + kind + "-" + from + "-to-" + to
}

func canonicalObservedPath(relative string) string {
	return "/" + strings.TrimPrefix(filepath.ToSlash(relative), "/")
}

func sortedSnapshotPaths(snapshot map[string]snapshotEntry) []string {
	paths := make([]string, 0, len(snapshot))
	for entryPath := range snapshot {
		paths = append(paths, entryPath)
	}
	sort.Strings(paths)
	return paths
}

func nodeState(entry snapshotEntry) nodeStateDocument {
	kind := "file"
	if entry.Mode&os.ModeSymlink != 0 {
		kind = "symlink"
	}
	return nodeStateDocument{Type: kind, Mode: fmt.Sprintf("%04o", entry.Mode.Perm()), Size: entry.Size, SHA256: entry.Digest}
}

func observedChanges(before, after map[string]snapshotEntry) []changeDocument {
	pathSet := make(map[string]struct{}, len(before)+len(after))
	for entryPath := range before {
		pathSet[entryPath] = struct{}{}
	}
	for entryPath := range after {
		pathSet[entryPath] = struct{}{}
	}
	paths := make([]string, 0, len(pathSet))
	for entryPath := range pathSet {
		paths = append(paths, entryPath)
	}
	sort.Strings(paths)
	changes := make([]changeDocument, 0, len(paths))
	for _, entryPath := range paths {
		beforeEntry, beforeFound := before[entryPath]
		afterEntry, afterFound := after[entryPath]
		if beforeFound && afterFound && reflect.DeepEqual(beforeEntry, afterEntry) {
			continue
		}
		change := changeDocument{Path: canonicalObservedPath(entryPath)}
		switch {
		case !beforeFound:
			state := nodeState(afterEntry)
			change.ChangeType, change.After = "added", &state
		case !afterFound:
			state := nodeState(beforeEntry)
			change.ChangeType, change.Before = "deleted", &state
		default:
			beforeState, afterState := nodeState(beforeEntry), nodeState(afterEntry)
			change.ChangeType, change.Before, change.After = "modified", &beforeState, &afterState
		}
		changes = append(changes, change)
	}
	return changes
}

func observedTraceEntries(fixture contracts.Fixture, executions []operationExecution, timestamp time.Time) ([]traceEntry, error) {
	entries := make([]traceEntry, 0, len(fixture.Definition.ExpectedInteraction.RequiredSteps))
	usedEffects := make(map[string]struct{})
	previous := fixture.Definition.InitialRequest.RequestID
	for sequence, step := range fixture.Definition.ExpectedInteraction.RequiredSteps {
		entry := traceEntry{
			EntryID:       "entry-" + step.StepID,
			Sequence:      sequence,
			Timestamp:     timestamp.UTC().Format(time.RFC3339Nano),
			Kind:          step.Kind,
			ProcessID:     step.ProcessID,
			Actor:         fixture.Script.Actor,
			CorrelationID: fixture.Definition.FixtureID,
			CausationID:   previous,
			Evidence:      []protocol.ResourceRef{},
		}
		switch step.Kind {
		case "operation_requested":
			execution, ok := findExecution(executions, step.ProcessID, step.RequestID)
			if !ok {
				return nil, fmt.Errorf("trace request step %q has no observed execution", step.StepID)
			}
			request := execution.Request
			entry.OperationRequest = &request
		case "operation_decided":
			execution, ok := findExecution(executions, step.ProcessID, step.RequestID)
			if !ok {
				return nil, fmt.Errorf("trace result step %q has no observed execution", step.StepID)
			}
			result := execution.Child.Result
			entry.OperationResult = &result
		case "effect_observed":
			effect, ok := findObservedEffect(executions, step, usedEffects)
			if !ok {
				return nil, fmt.Errorf("trace effect step %q has no unique observed effect", step.StepID)
			}
			entry.Effect = &effect
		default:
			entry.Payload = map[string]any{"observed": true, "step_id": step.StepID}
			if step.RequestID != "" {
				entry.Payload["request_id"] = step.RequestID
			}
		}
		entries = append(entries, entry)
		previous = entry.EntryID
	}
	if err := validateTraceEntries(fixture, entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func findExecution(executions []operationExecution, processID, requestID string) (operationExecution, bool) {
	for _, execution := range executions {
		if execution.Action.ProcessID == processID && execution.Request.RequestID == requestID {
			return execution, true
		}
	}
	return operationExecution{}, false
}

func findObservedEffect(executions []operationExecution, step protocol.InteractionStep, used map[string]struct{}) (protocol.EffectRecord, bool) {
	for _, execution := range executions {
		if execution.Action.ProcessID != step.ProcessID {
			continue
		}
		for _, effect := range execution.Child.Result.Effects {
			if _, duplicate := used[effect.EffectID]; duplicate || effect.Kind != step.EffectKind || effect.PolicyDecision != step.PolicyDecision {
				continue
			}
			if step.Occurred != nil && effect.Occurred != *step.Occurred {
				continue
			}
			if step.ResourcePattern != "" && !matchFixtureResourcePattern(step.ResourcePattern, effect.Resource.URI) {
				continue
			}
			used[effect.EffectID] = struct{}{}
			return effect, true
		}
	}
	return protocol.EffectRecord{}, false
}

func validateTraceEntries(fixture contracts.Fixture, entries []traceEntry) error {
	steps := fixture.Definition.ExpectedInteraction.RequiredSteps
	if len(entries) != len(steps) {
		return fmt.Errorf("trace has %d entries, want %d required steps", len(entries), len(steps))
	}
	positions := make(map[string]int, len(entries))
	entryIDs := make(map[string]int, len(entries))
	for index, entry := range entries {
		step := steps[index]
		if entry.Sequence != index || entry.Kind != step.Kind || entry.ProcessID != step.ProcessID || entry.EntryID != "entry-"+step.StepID {
			return fmt.Errorf("trace entry %d does not match required step %q", index, step.StepID)
		}
		if entry.CausationID != fixture.Definition.InitialRequest.RequestID {
			if causeIndex, ok := entryIDs[entry.CausationID]; !ok || causeIndex >= index {
				return fmt.Errorf("trace entry %q has no earlier causation", entry.EntryID)
			}
		}
		positions[step.StepID] = index
		entryIDs[entry.EntryID] = index
	}
	for _, constraint := range fixture.Definition.ExpectedInteraction.OrderConstraints {
		if positions[constraint.Before] >= positions[constraint.After] {
			return fmt.Errorf("trace violates order %q before %q", constraint.Before, constraint.After)
		}
	}
	return nil
}

func observedExecutableReference() (evidence.ImmutableReference, error) {
	executable, err := os.Executable()
	if err != nil {
		return evidence.ImmutableReference{}, fmt.Errorf("resolve observed executable: %w", err)
	}
	content, err := os.ReadFile(executable)
	if err != nil {
		return evidence.ImmutableReference{}, fmt.Errorf("read observed executable: %w", err)
	}
	return evidence.Reference("virgil://runtime/executable", "runtime-v1alpha1", content), nil
}

func observedProcesses(fixture contracts.Fixture, executions []operationExecution, executable evidence.ImmutableReference, timestamp time.Time) ([]processDocument, error) {
	processes := make([]processDocument, 0, len(executions))
	for _, execution := range executions {
		actionIDs := make([]string, 0)
		requestIDs := make([]string, 0)
		for _, action := range fixture.Script.Actions {
			if action.ProcessID != execution.Action.ProcessID {
				continue
			}
			actionIDs = append(actionIDs, action.ActionID)
			if len(action.OperationRequest) != 0 {
				request, err := protocol.DecodeOperationRequest(action.OperationRequest)
				if err != nil {
					return nil, err
				}
				requestIDs = append(requestIDs, request.RequestID)
			}
		}
		when := timestamp.UTC().Format(time.RFC3339Nano)
		processes = append(processes, processDocument{
			ProcessID: execution.Process.ProcessID, PID: execution.Process.OSPID, FreshProcess: true,
			Executable: executable, ActionIDs: actionIDs, RequestIDs: requestIDs,
			StartedAt: when, EndedAt: when, ExitCode: execution.Process.ExitCode,
			Stdout: execution.Capture.Stdout, Stderr: execution.Capture.Stderr,
		})
	}
	return processes, nil
}

func observedReportChecks(checks []wire.CheckResult) ([]reportCheckDocument, error) {
	result := make([]reportCheckDocument, 0, len(checks))
	seen := make(map[string]struct{}, len(checks))
	for _, check := range checks {
		if check.CheckID == "" || check.Status != "passed" || check.Detail == "" {
			return nil, fmt.Errorf("non-passing check cannot certify evidence")
		}
		if _, duplicate := seen[check.CheckID]; duplicate {
			return nil, fmt.Errorf("duplicate evidence check %q", check.CheckID)
		}
		seen[check.CheckID] = struct{}{}
		result = append(result, reportCheckDocument{CheckID: check.CheckID, Status: check.Status, Reason: check.Detail})
	}
	return result, nil
}

func observedProjectAuthority(targetRoot, namespace string) ([]byte, []byte, error) {
	root, err := os.OpenRoot(targetRoot)
	if err != nil {
		return nil, nil, fmt.Errorf("open target root for authority observation: %w", err)
	}
	defer root.Close()
	namespacePath := filepath.ToSlash(namespace)
	events, eventFound, err := readObservedRegular(root, path.Join(namespacePath, protocol.RepoDocsEventsFile))
	if err != nil {
		return nil, nil, err
	}
	project, projectFound, err := readObservedRegular(root, path.Join(namespacePath, protocol.RepoDocsProjectFile))
	if err != nil {
		return nil, nil, err
	}
	if eventFound != projectFound {
		return nil, nil, fmt.Errorf("observed project authority is partial")
	}
	return events, project, nil
}

func readObservedRegular(root *os.Root, name string) ([]byte, bool, error) {
	info, err := root.Lstat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return []byte{}, false, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return nil, false, fmt.Errorf("observed authority %q is not a direct regular file", name)
	}
	content, err := root.ReadFile(name)
	if err != nil {
		return nil, false, err
	}
	return content, true, nil
}

func sortedDocuments(documents map[string]evidence.Document) []evidence.Document {
	ids := make([]string, 0, len(documents))
	for id := range documents {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]evidence.Document, 0, len(ids))
	for _, id := range ids {
		result = append(result, documents[id])
	}
	return result
}

func sha256Digest(content []byte) string {
	digest := sha256.Sum256(content)
	return fmt.Sprintf("sha256:%x", digest)
}

// Wrapped to keep environment capture allowlisted and make accidental ambient
// environment serialization impossible in the evidence path.
func runtimeOS() string           { return runtime.GOOS }
func runtimeArchitecture() string { return runtime.GOARCH }
