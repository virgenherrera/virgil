package evidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/gowebpki/jcs"
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
)

const (
	traceSchemaVersion  = "virgil.dev/agent-interaction-trace/v1alpha1"
	bundleSchemaVersion = "virgil.dev/evidence-bundle/v1alpha1"
)

type traceView struct {
	SchemaVersion string           `json:"schema_version"`
	Protocol      string           `json:"protocol_version"`
	TraceID       string           `json:"trace_id"`
	Fixture       fixtureReference `json:"fixture"`
	Layer         string           `json:"layer"`
	StartedAt     string           `json:"started_at"`
	EndedAt       string           `json:"ended_at"`
	Entries       []traceEntryView `json:"entries"`
	Outcome       outcome          `json:"outcome"`
}

type traceEntryView struct {
	ProcessID string `json:"process_id"`
}

type observedRoot struct {
	Kind         string `json:"kind"`
	URI          string `json:"uri"`
	ResolvedPath string `json:"resolved_path"`
	ScopePath    string `json:"scope_path"`
}

type processView struct {
	ProcessID string `json:"process_id"`
	PID       int    `json:"pid"`
	Fresh     bool   `json:"fresh_process"`
	StartedAt string `json:"started_at"`
	EndedAt   string `json:"ended_at"`
}

type intervalView struct {
	Before ImmutableReference `json:"before_snapshot"`
	After  ImmutableReference `json:"after_snapshot"`
	Diff   ImmutableReference `json:"diff"`
}

type checkpointView struct {
	CheckpointID string       `json:"checkpoint_id"`
	AfterStep    string       `json:"after_step"`
	RelativeTo   string       `json:"relative_to"`
	CapturedAt   string       `json:"captured_at"`
	Target       intervalView `json:"target"`
	Store        intervalView `json:"store"`
}

type reportView struct {
	SchemaVersion string           `json:"schema_version"`
	Protocol      string           `json:"protocol_version"`
	ReportID      string           `json:"report_id"`
	Fixture       fixtureReference `json:"fixture"`
	TargetRoot    observedRoot     `json:"target_root"`
	StoreRoot     observedRoot     `json:"store_root"`
	StartedAt     string           `json:"started_at"`
	EndedAt       string           `json:"ended_at"`
	Processes     []processView    `json:"processes"`
	Checkpoints   []checkpointView `json:"checkpoints"`
	Checks        []checkResult    `json:"checks"`
	Outcome       outcome          `json:"outcome"`
}

type snapshotView struct {
	SnapshotID   string       `json:"snapshot_id"`
	Root         observedRoot `json:"root"`
	CheckpointID string       `json:"checkpoint_id"`
	Entries      []entryView  `json:"entries"`
}

type nodeStateView struct {
	Type   string `json:"type"`
	Mode   string `json:"mode"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type entryView struct {
	Path string `json:"path"`
	nodeStateView
}

type changeView struct {
	Path       string         `json:"path"`
	ChangeType string         `json:"change_type"`
	Before     *nodeStateView `json:"before"`
	After      *nodeStateView `json:"after"`
}

type diffView struct {
	DiffID         string       `json:"diff_id"`
	Root           observedRoot `json:"root"`
	FromCheckpoint string       `json:"from_checkpoint"`
	ToCheckpoint   string       `json:"to_checkpoint"`
	Changes        []changeView `json:"changes"`
}

type eventPointerView struct {
	EventID    string             `json:"event_id"`
	Kind       string             `json:"kind"`
	LineNumber int                `json:"line_number"`
	Resource   ImmutableReference `json:"resource"`
}

type idempotencyView struct {
	Key               string `json:"key"`
	RequestDigest     string `json:"request_digest"`
	OriginalRequestID string `json:"original_request_id"`
}

type projectResourceView struct {
	Role     string             `json:"role"`
	Resource ImmutableReference `json:"resource"`
}

type projectStateView struct {
	ProjectRef      protocol.ProjectRef       `json:"project_ref"`
	Operation       string                    `json:"operation"`
	State           string                    `json:"state"`
	Idempotency     idempotencyView           `json:"idempotency"`
	OriginalRequest protocol.OperationRequest `json:"original_request"`
	ResolvedContext protocol.Context          `json:"resolved_context"`
	Event           eventPointerView          `json:"event"`
	Resources       []projectResourceView     `json:"resources"`
}

type eventView struct {
	EventID          string                    `json:"event_id"`
	Kind             string                    `json:"kind"`
	ProjectID        string                    `json:"project_id"`
	Operation        string                    `json:"operation"`
	IdempotencyKey   string                    `json:"idempotency_key"`
	RequestDigest    string                    `json:"request_digest"`
	RequestID        string                    `json:"request_id"`
	Actor            protocol.ActorRef         `json:"actor"`
	DogmaRef         protocol.DogmaRef         `json:"dogma_ref"`
	ProjectRef       protocol.ProjectRef       `json:"project_ref"`
	ArtifactStoreRef protocol.ArtifactStoreRef `json:"artifact_store_ref"`
}

type preparedDocument struct {
	id        string
	content   []byte
	reference ImmutableReference
	root      observedRoot
	snapshot  *snapshotView
	diff      *diffView
}

func (publisher *Publisher) prepare(input Input) (preparedBundle, error) {
	if publisher == nil {
		return preparedBundle{}, fmt.Errorf("publisher is required")
	}
	if err := validateID(input.BundleID, "bundle_id"); err != nil {
		return preparedBundle{}, err
	}
	layout, err := publisher.PlanLayout(input.BundleID)
	if err != nil {
		return preparedBundle{}, err
	}

	fixture, fixtureRef, err := publisher.validateFixture(input.Fixture)
	if err != nil {
		return preparedBundle{}, err
	}
	if err := validateImmutableReference(input.SourceRevision, "source_revision", true); err != nil {
		return preparedBundle{}, err
	}
	if err := validateEnvironment(input.Environment); err != nil {
		return preparedBundle{}, err
	}

	traceBytes, trace, err := publisher.prepareTrace(input.Trace, fixtureRef, fixture.Layer)
	if err != nil {
		return preparedBundle{}, err
	}
	traceRef := Reference(layout.Trace, trace.TraceID, traceBytes)

	snapshots, snapshotFiles, err := publisher.prepareSnapshots(layout, input.Snapshots)
	if err != nil {
		return preparedBundle{}, err
	}
	diffs, diffFiles, err := publisher.prepareDiffs(layout, input.Diffs)
	if err != nil {
		return preparedBundle{}, err
	}

	eventRecords, err := validateNDJSON(publisher.registry, contracts.SchemaProjectInitialized, input.EventLog)
	if err != nil {
		return preparedBundle{}, fmt.Errorf("event log: %w", err)
	}
	eventBytes := bytes.Clone(input.EventLog)
	eventRef := Reference(layout.EventLog, fixture.FixtureRevision, eventBytes)

	var stateRef *ImmutableReference
	if len(input.ProjectState) > 0 {
		if err := validateJSON(publisher.registry, contracts.SchemaProjectState, input.ProjectState); err != nil {
			return preparedBundle{}, fmt.Errorf("project state: %w", err)
		}
		reference := Reference(layout.ProjectState, fixture.FixtureRevision, input.ProjectState)
		stateRef = &reference
	}
	requiresProjectAuthority := false
	for _, expectation := range fixture.ExpectedEvents {
		if expectation.Kind == "project_initialized" && expectation.MinCount > 0 {
			requiresProjectAuthority = true
		}
	}
	if requiresProjectAuthority != (stateRef != nil) {
		return preparedBundle{}, fmt.Errorf("project state presence does not match fixture event authority")
	}
	if err := crossCheckProjectAuthority(fixture, publisher.targetRoot, input.ProjectState, eventRecords, eventBytes); err != nil {
		return preparedBundle{}, err
	}

	reportBytes, report, err := publisher.prepareReport(input.RunnerReport, fixtureRef)
	if err != nil {
		return preparedBundle{}, err
	}
	reportRef := Reference(layout.RunnerReport, report.ReportID, reportBytes)
	if err := publisher.crossCheckObservation(fixture, report, trace, snapshots, diffs, input.FinalTargetDiffID, input.FinalStoreDiffID); err != nil {
		return preparedBundle{}, err
	}

	targetDiff, ok := diffs[input.FinalTargetDiffID]
	if !ok {
		return preparedBundle{}, fmt.Errorf("final target diff %q is not supplied", input.FinalTargetDiffID)
	}
	storeDiff, ok := diffs[input.FinalStoreDiffID]
	if !ok {
		return preparedBundle{}, fmt.Errorf("final store diff %q is not supplied", input.FinalStoreDiffID)
	}

	contents := []bundleContent{
		content("trace", contracts.SchemaAgentInteractionTrace, mediaJSON, traceRef),
		content("event_log", contracts.SchemaProjectInitialized, mediaNDJSON, eventRef),
	}
	if stateRef != nil {
		contents = append(contents, content("project_state", contracts.SchemaProjectState, mediaJSON, *stateRef))
	}
	for _, id := range sortedDocumentIDs(snapshots) {
		contents = append(contents, content("filesystem_snapshot", contracts.SchemaFilesystemSnapshot, mediaJSON, snapshots[id].reference))
	}
	for _, id := range sortedDocumentIDs(diffs) {
		contents = append(contents, content("filesystem_diff", contracts.SchemaFilesystemDiff, mediaJSON, diffs[id].reference))
	}
	contents = append(contents, content("runner_report", contracts.SchemaRunnerObservation, mediaJSON, reportRef))

	manifestValue := manifest{
		SchemaVersion:       bundleSchemaVersion,
		ProtocolVersion:     protocol.Version,
		BundleID:            input.BundleID,
		Layer:               fixture.Layer,
		Fixture:             fixtureRef,
		SourceRevision:      input.SourceRevision,
		TargetBaseline:      fixture.TargetRepo,
		AdapterProfile:      fixture.AdapterProfile,
		RuntimeCapabilities: fixture.RuntimeCapabilities,
		Environment:         bytes.Clone(input.Environment),
		Trace:               traceRef,
		RunnerReport:        reportRef,
		Contents:            contents,
		Diffs: diffSet{
			Target: targetDiff.reference,
			Store:  storeDiff.reference,
		},
		Checks:  report.Checks,
		Outcome: report.Outcome,
		SecretRedaction: secretRedaction{
			Status:    "passed",
			Mechanism: "allowlisted-json-secret-scan/v1",
			Findings:  []string{},
		},
		PublishedAtomically: true,
		PublishedAt:         publisher.publishedAt.Format(time.RFC3339Nano),
		Integrity:           integrity{Canonicalization: "RFC8785"},
	}
	manifestRaw, err := json.Marshal(manifestValue)
	if err != nil {
		return preparedBundle{}, fmt.Errorf("serialize evidence manifest: %w", err)
	}
	manifestBytes, err := sealIntegrity(manifestRaw)
	if err != nil {
		return preparedBundle{}, fmt.Errorf("seal evidence manifest: %w", err)
	}
	if err := publisher.registry.Validate(contracts.SchemaEvidenceBundle, manifestBytes); err != nil {
		return preparedBundle{}, fmt.Errorf("evidence manifest: %w", err)
	}

	files := []preparedFile{
		{relative: traceFile, content: traceBytes},
		{relative: eventLogFile, content: eventBytes},
	}
	if stateRef != nil {
		files = append(files, preparedFile{relative: projectStateFile, content: bytes.Clone(input.ProjectState)})
	}
	files = append(files, snapshotFiles...)
	files = append(files, diffFiles...)
	files = append(files, preparedFile{relative: runnerReportFile, content: reportBytes})
	if err := publisher.scanAll(files, manifestBytes, eventRecords); err != nil {
		return preparedBundle{}, err
	}
	return preparedBundle{layout: layout, files: files, manifest: manifestBytes}, nil
}

func (publisher *Publisher) validateFixture(raw []byte) (protocol.ScenarioFixture, fixtureReference, error) {
	if err := validateJSON(publisher.registry, contracts.SchemaScenarioFixture, raw); err != nil {
		return protocol.ScenarioFixture{}, fixtureReference{}, fmt.Errorf("fixture: %w", err)
	}
	fixture, err := protocol.DecodeScenarioFixture(raw)
	if err != nil {
		return protocol.ScenarioFixture{}, fixtureReference{}, err
	}
	if fixture.Layer != "T0" || fixture.ProtocolVersion != protocol.Version {
		return protocol.ScenarioFixture{}, fixtureReference{}, fmt.Errorf("fixture must use T0 and the current planning protocol")
	}
	request := fixture.InitialRequest
	if !reflect.DeepEqual(fixture.TargetRepo, request.ProjectRef.Target) ||
		request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID ||
		!reflect.DeepEqual(request.ArtifactStoreRef, fixture.AdapterProfile.ArtifactStore) ||
		!reflect.DeepEqual(request.Host, fixture.AdapterProfile.Host) ||
		!reflect.DeepEqual(request.Host, fixture.RuntimeCapabilities) ||
		request.ProjectRef.Target.URI == request.DogmaRef.Source.URI {
		return protocol.ScenarioFixture{}, fixtureReference{}, fmt.Errorf("fixture identity and adapter references are incoherent")
	}
	namespace := fixture.AdapterProfile.ArtifactStore.Namespace
	if namespace == "" || strings.Contains(namespace, "\\") || path.IsAbs(namespace) || path.Clean(namespace) != namespace || namespace == ".." || strings.HasPrefix(namespace, "../") {
		return protocol.ScenarioFixture{}, fixtureReference{}, fmt.Errorf("fixture artifact store namespace is not a safe relative path")
	}
	reference := fixtureReference{
		FixtureID:       fixture.FixtureID,
		FixtureRevision: fixture.FixtureRevision,
		Digest:          digest(raw),
	}
	return fixture, reference, nil
}

func (publisher *Publisher) prepareTrace(raw []byte, fixture fixtureReference, layer string) ([]byte, traceView, error) {
	sealed, err := sealIntegrity(raw)
	if err != nil {
		return nil, traceView{}, fmt.Errorf("trace: %w", err)
	}
	if err := validateJSON(publisher.registry, contracts.SchemaAgentInteractionTrace, sealed); err != nil {
		return nil, traceView{}, fmt.Errorf("trace: %w", err)
	}
	var trace traceView
	if err := json.Unmarshal(sealed, &trace); err != nil {
		return nil, traceView{}, fmt.Errorf("decode trace view: %w", err)
	}
	if trace.SchemaVersion != traceSchemaVersion || trace.Protocol != protocol.Version || trace.Layer != layer || trace.Fixture != fixture {
		return nil, traceView{}, fmt.Errorf("trace identity does not match fixture")
	}
	if err := validateInterval(trace.StartedAt, trace.EndedAt, publisher.publishedAt, "trace"); err != nil {
		return nil, traceView{}, err
	}
	return sealed, trace, nil
}

func (publisher *Publisher) prepareReport(raw []byte, fixture fixtureReference) ([]byte, reportView, error) {
	sealed, err := sealIntegrity(raw)
	if err != nil {
		return nil, reportView{}, fmt.Errorf("runner report: %w", err)
	}
	if err := validateJSON(publisher.registry, contracts.SchemaRunnerObservation, sealed); err != nil {
		return nil, reportView{}, fmt.Errorf("runner report: %w", err)
	}
	var report reportView
	if err := json.Unmarshal(sealed, &report); err != nil {
		return nil, reportView{}, fmt.Errorf("decode runner report view: %w", err)
	}
	if report.Protocol != protocol.Version || report.Fixture != fixture {
		return nil, reportView{}, fmt.Errorf("runner report identity does not match fixture")
	}
	if err := validateInterval(report.StartedAt, report.EndedAt, publisher.publishedAt, "runner report"); err != nil {
		return nil, reportView{}, err
	}
	if err := validateProcesses(report.Processes, publisher.publishedAt); err != nil {
		return nil, reportView{}, err
	}
	reportStart, _ := time.Parse(time.RFC3339Nano, report.StartedAt)
	reportEnd, _ := time.Parse(time.RFC3339Nano, report.EndedAt)
	for _, process := range report.Processes {
		processStart, _ := time.Parse(time.RFC3339Nano, process.StartedAt)
		processEnd, _ := time.Parse(time.RFC3339Nano, process.EndedAt)
		if processStart.Before(reportStart) || processEnd.After(reportEnd) {
			return nil, reportView{}, fmt.Errorf("process %q falls outside runner report interval", process.ProcessID)
		}
	}
	if err := validateChecks(report.Checks, report.Outcome); err != nil {
		return nil, reportView{}, err
	}
	return sealed, report, nil
}

func (publisher *Publisher) prepareSnapshots(layout Layout, documents []Document) (map[string]preparedDocument, []preparedFile, error) {
	prepared := make(map[string]preparedDocument, len(documents))
	ordered := append([]Document(nil), documents...)
	sort.Slice(ordered, func(left, right int) bool { return ordered[left].ID < ordered[right].ID })
	files := make([]preparedFile, 0, len(ordered))
	for _, document := range ordered {
		if err := validateID(document.ID, "snapshot_id"); err != nil {
			return nil, nil, err
		}
		if _, duplicate := prepared[document.ID]; duplicate {
			return nil, nil, fmt.Errorf("duplicate snapshot_id %q", document.ID)
		}
		if err := validateJSON(publisher.registry, contracts.SchemaFilesystemSnapshot, document.Bytes); err != nil {
			return nil, nil, fmt.Errorf("snapshot %s: %w", document.ID, err)
		}
		var snapshot snapshotView
		if err := json.Unmarshal(document.Bytes, &snapshot); err != nil {
			return nil, nil, err
		}
		if snapshot.SnapshotID != document.ID {
			return nil, nil, fmt.Errorf("snapshot document %q identifies %q", document.ID, snapshot.SnapshotID)
		}
		if err := validateSnapshotEntries(snapshot); err != nil {
			return nil, nil, fmt.Errorf("snapshot %s: %w", document.ID, err)
		}
		uri, err := layout.Snapshot(document.ID)
		if err != nil {
			return nil, nil, err
		}
		contentBytes := bytes.Clone(document.Bytes)
		prepared[document.ID] = preparedDocument{
			id:        document.ID,
			content:   contentBytes,
			reference: Reference(uri, document.ID, contentBytes),
			root:      snapshot.Root,
			snapshot:  &snapshot,
		}
		files = append(files, preparedFile{relative: filepath.ToSlash(filepath.Join("snapshots", document.ID+".json")), content: contentBytes})
	}
	return prepared, files, nil
}

func (publisher *Publisher) prepareDiffs(layout Layout, documents []Document) (map[string]preparedDocument, []preparedFile, error) {
	prepared := make(map[string]preparedDocument, len(documents))
	ordered := append([]Document(nil), documents...)
	sort.Slice(ordered, func(left, right int) bool { return ordered[left].ID < ordered[right].ID })
	files := make([]preparedFile, 0, len(ordered))
	for _, document := range ordered {
		if err := validateID(document.ID, "diff_id"); err != nil {
			return nil, nil, err
		}
		if _, duplicate := prepared[document.ID]; duplicate {
			return nil, nil, fmt.Errorf("duplicate diff_id %q", document.ID)
		}
		if err := validateJSON(publisher.registry, contracts.SchemaFilesystemDiff, document.Bytes); err != nil {
			return nil, nil, fmt.Errorf("diff %s: %w", document.ID, err)
		}
		var difference diffView
		if err := json.Unmarshal(document.Bytes, &difference); err != nil {
			return nil, nil, err
		}
		if difference.DiffID != document.ID {
			return nil, nil, fmt.Errorf("diff document %q identifies %q", document.ID, difference.DiffID)
		}
		if err := validateDiffChanges(difference); err != nil {
			return nil, nil, fmt.Errorf("diff %s: %w", document.ID, err)
		}
		uri, err := layout.Diff(document.ID)
		if err != nil {
			return nil, nil, err
		}
		contentBytes := bytes.Clone(document.Bytes)
		prepared[document.ID] = preparedDocument{
			id:        document.ID,
			content:   contentBytes,
			reference: Reference(uri, document.ID, contentBytes),
			root:      difference.Root,
			diff:      &difference,
		}
		files = append(files, preparedFile{relative: filepath.ToSlash(filepath.Join("diffs", document.ID+".json")), content: contentBytes})
	}
	return prepared, files, nil
}

func (publisher *Publisher) crossCheckObservation(
	fixture protocol.ScenarioFixture,
	report reportView,
	trace traceView,
	snapshots map[string]preparedDocument,
	diffs map[string]preparedDocument,
	finalTargetDiffID string,
	finalStoreDiffID string,
) error {
	if !reflect.DeepEqual(report.Outcome, trace.Outcome) {
		return fmt.Errorf("trace and runner report outcomes differ")
	}
	traceStart, _ := time.Parse(time.RFC3339Nano, trace.StartedAt)
	traceEnd, _ := time.Parse(time.RFC3339Nano, trace.EndedAt)
	reportStart, _ := time.Parse(time.RFC3339Nano, report.StartedAt)
	reportEnd, _ := time.Parse(time.RFC3339Nano, report.EndedAt)
	if traceStart.Before(reportStart) || traceEnd.After(reportEnd) {
		return fmt.Errorf("trace interval falls outside runner report interval")
	}
	if err := crossCheckProcessIdentities(trace.Entries, report.Processes); err != nil {
		return err
	}
	if report.TargetRoot.Kind != "target" || report.TargetRoot.URI != fixture.TargetRepo.URI ||
		report.TargetRoot.ScopePath != "/" || filepath.Clean(report.TargetRoot.ResolvedPath) != publisher.targetRoot {
		return fmt.Errorf("runner report target root does not match explicit target root")
	}
	expectedStorePath := filepath.Join(publisher.targetRoot, filepath.FromSlash(fixture.AdapterProfile.ArtifactStore.Namespace))
	expectedStoreScope := "/" + fixture.AdapterProfile.ArtifactStore.Namespace
	if report.StoreRoot.Kind != "store" || report.StoreRoot.URI != fixture.TargetRepo.URI ||
		filepath.Clean(report.StoreRoot.ResolvedPath) != expectedStorePath || report.StoreRoot.ScopePath != expectedStoreScope {
		return fmt.Errorf("runner report store root is not inside explicit target root")
	}
	if len(report.Checkpoints) != len(fixture.ExpectedCheckpoints) {
		return fmt.Errorf("runner report checkpoint count differs from fixture")
	}

	usedSnapshots := make(map[string]struct{})
	usedDiffs := make(map[string]struct{})
	checkpointPositions := make(map[string]int, len(report.Checkpoints))
	for index, checkpoint := range report.Checkpoints {
		expectedCheckpoint := fixture.ExpectedCheckpoints[index]
		if checkpoint.CheckpointID != expectedCheckpoint.CheckpointID || checkpoint.AfterStep != expectedCheckpoint.AfterStep || checkpoint.RelativeTo != expectedCheckpoint.RelativeTo {
			return fmt.Errorf("runner checkpoint %d differs from fixture contract", index)
		}
		if _, duplicate := checkpointPositions[checkpoint.CheckpointID]; duplicate {
			return fmt.Errorf("duplicate runner checkpoint %q", checkpoint.CheckpointID)
		}
		if checkpoint.RelativeTo != "fixture_baseline" {
			position, ok := checkpointPositions[checkpoint.RelativeTo]
			if !ok || position >= index {
				return fmt.Errorf("checkpoint %q does not reference an earlier state", checkpoint.CheckpointID)
			}
		}
		if err := validateTimestamp(checkpoint.CapturedAt, publisher.publishedAt, "checkpoint "+checkpoint.CheckpointID); err != nil {
			return err
		}
		capturedAt, _ := time.Parse(time.RFC3339Nano, checkpoint.CapturedAt)
		if capturedAt.Before(reportStart) || capturedAt.After(reportEnd) {
			return fmt.Errorf("checkpoint %q falls outside runner report interval", checkpoint.CheckpointID)
		}
		if err := crossCheckInterval(checkpoint.Target, "target", report.TargetRoot, checkpoint, snapshots, diffs, usedSnapshots, usedDiffs); err != nil {
			return err
		}
		if err := crossCheckInterval(checkpoint.Store, "store", report.StoreRoot, checkpoint, snapshots, diffs, usedSnapshots, usedDiffs); err != nil {
			return err
		}
		checkpointPositions[checkpoint.CheckpointID] = index
	}
	if len(report.Checkpoints) == 0 {
		return fmt.Errorf("runner report has no checkpoints")
	}
	lastCheckpoint := report.Checkpoints[len(report.Checkpoints)-1].CheckpointID
	if err := crossCheckFinalDiff(finalTargetDiffID, "target", report.TargetRoot, lastCheckpoint, snapshots, diffs, usedDiffs); err != nil {
		return err
	}
	if err := crossCheckFinalDiff(finalStoreDiffID, "store", report.StoreRoot, lastCheckpoint, snapshots, diffs, usedDiffs); err != nil {
		return err
	}
	if len(usedSnapshots) != len(snapshots) {
		return fmt.Errorf("supplied snapshots and runner checkpoint references differ")
	}
	if len(usedDiffs) != len(diffs) {
		return fmt.Errorf("supplied diffs and runner/final references differ")
	}
	return nil
}

func crossCheckInterval(
	interval intervalView,
	kind string,
	root observedRoot,
	checkpoint checkpointView,
	snapshots map[string]preparedDocument,
	diffs map[string]preparedDocument,
	usedSnapshots map[string]struct{},
	usedDiffs map[string]struct{},
) error {
	before, err := findDocumentByReference(snapshots, interval.Before)
	if err != nil {
		return fmt.Errorf("checkpoint %s %s before snapshot: %w", checkpoint.CheckpointID, kind, err)
	}
	after, err := findDocumentByReference(snapshots, interval.After)
	if err != nil {
		return fmt.Errorf("checkpoint %s %s after snapshot: %w", checkpoint.CheckpointID, kind, err)
	}
	difference, err := findDocumentByReference(diffs, interval.Diff)
	if err != nil {
		return fmt.Errorf("checkpoint %s %s diff: %w", checkpoint.CheckpointID, kind, err)
	}
	if before.snapshot == nil || after.snapshot == nil || difference.diff == nil ||
		!reflect.DeepEqual(before.root, root) || !reflect.DeepEqual(after.root, root) || !reflect.DeepEqual(difference.root, root) ||
		before.snapshot.CheckpointID != checkpoint.RelativeTo || after.snapshot.CheckpointID != checkpoint.CheckpointID ||
		difference.diff.FromCheckpoint != checkpoint.RelativeTo || difference.diff.ToCheckpoint != checkpoint.CheckpointID {
		return fmt.Errorf("checkpoint %s %s resources do not describe its interval and root", checkpoint.CheckpointID, kind)
	}
	if err := validateObservedDiff(*before.snapshot, *after.snapshot, *difference.diff); err != nil {
		return fmt.Errorf("checkpoint %s %s diff does not match its snapshots: %w", checkpoint.CheckpointID, kind, err)
	}
	usedSnapshots[before.id] = struct{}{}
	usedSnapshots[after.id] = struct{}{}
	usedDiffs[difference.id] = struct{}{}
	return nil
}

func crossCheckFinalDiff(
	id, kind string,
	root observedRoot,
	lastCheckpoint string,
	snapshots map[string]preparedDocument,
	diffs map[string]preparedDocument,
	used map[string]struct{},
) error {
	document, ok := diffs[id]
	if !ok || document.diff == nil {
		return fmt.Errorf("final %s diff %q is not supplied", kind, id)
	}
	if document.root.Kind != kind || !reflect.DeepEqual(document.root, root) || document.diff.FromCheckpoint != "fixture_baseline" || document.diff.ToCheckpoint != lastCheckpoint {
		return fmt.Errorf("final %s diff does not cover fixture_baseline through the last checkpoint", kind)
	}
	before, err := findSnapshotByRootCheckpoint(snapshots, root, "fixture_baseline")
	if err != nil {
		return fmt.Errorf("final %s diff baseline: %w", kind, err)
	}
	after, err := findSnapshotByRootCheckpoint(snapshots, root, lastCheckpoint)
	if err != nil {
		return fmt.Errorf("final %s diff last checkpoint: %w", kind, err)
	}
	if err := validateObservedDiff(*before.snapshot, *after.snapshot, *document.diff); err != nil {
		return fmt.Errorf("final %s diff does not match its snapshots: %w", kind, err)
	}
	used[id] = struct{}{}
	return nil
}

func findSnapshotByRootCheckpoint(documents map[string]preparedDocument, root observedRoot, checkpointID string) (preparedDocument, error) {
	var found preparedDocument
	count := 0
	for _, document := range documents {
		if document.snapshot != nil && document.snapshot.CheckpointID == checkpointID && reflect.DeepEqual(document.root, root) {
			found = document
			count++
		}
	}
	if count != 1 {
		return preparedDocument{}, fmt.Errorf("found %d snapshots for checkpoint %q and root %q", count, checkpointID, root.Kind)
	}
	return found, nil
}

func validateObservedDiff(before snapshotView, after snapshotView, difference diffView) error {
	beforeEntries := make(map[string]nodeStateView, len(before.Entries))
	afterEntries := make(map[string]nodeStateView, len(after.Entries))
	paths := make(map[string]struct{}, len(before.Entries)+len(after.Entries))
	for _, entry := range before.Entries {
		beforeEntries[entry.Path] = entry.nodeStateView
		paths[entry.Path] = struct{}{}
	}
	for _, entry := range after.Entries {
		afterEntries[entry.Path] = entry.nodeStateView
		paths[entry.Path] = struct{}{}
	}
	ordered := make([]string, 0, len(paths))
	for entryPath := range paths {
		ordered = append(ordered, entryPath)
	}
	sort.Strings(ordered)
	expected := make([]changeView, 0, len(ordered))
	for _, entryPath := range ordered {
		beforeState, beforeFound := beforeEntries[entryPath]
		afterState, afterFound := afterEntries[entryPath]
		if beforeFound && afterFound && reflect.DeepEqual(beforeState, afterState) {
			continue
		}
		change := changeView{Path: entryPath}
		switch {
		case !beforeFound:
			state := afterState
			change.ChangeType, change.After = "added", &state
		case !afterFound:
			state := beforeState
			change.ChangeType, change.Before = "deleted", &state
		default:
			beforeCopy, afterCopy := beforeState, afterState
			change.ChangeType, change.Before, change.After = "modified", &beforeCopy, &afterCopy
		}
		expected = append(expected, change)
	}
	if !reflect.DeepEqual(difference.Changes, expected) {
		return fmt.Errorf("changes are not the exact snapshot delta")
	}
	return nil
}

func validateSnapshotEntries(snapshot snapshotView) error {
	paths := make(map[string]struct{}, len(snapshot.Entries))
	previous := ""
	for index, entry := range snapshot.Entries {
		if _, duplicate := paths[entry.Path]; duplicate {
			return fmt.Errorf("duplicate path %q", entry.Path)
		}
		if index > 0 && entry.Path <= previous {
			return fmt.Errorf("entries must be sorted by canonical path")
		}
		if err := validateSHA256(entry.SHA256, "entry sha256"); err != nil {
			return err
		}
		paths[entry.Path] = struct{}{}
		previous = entry.Path
	}
	return nil
}

func validateDiffChanges(difference diffView) error {
	paths := make(map[string]struct{}, len(difference.Changes))
	previous := ""
	for index, change := range difference.Changes {
		if _, duplicate := paths[change.Path]; duplicate {
			return fmt.Errorf("duplicate changed path %q", change.Path)
		}
		if index > 0 && change.Path <= previous {
			return fmt.Errorf("changes must be sorted by canonical path")
		}
		if change.Before != nil {
			if err := validateSHA256(change.Before.SHA256, "before sha256"); err != nil {
				return err
			}
		}
		if change.After != nil {
			if err := validateSHA256(change.After.SHA256, "after sha256"); err != nil {
				return err
			}
		}
		if change.ChangeType == "modified" && reflect.DeepEqual(change.Before, change.After) {
			return fmt.Errorf("modified path %q has identical before and after state", change.Path)
		}
		paths[change.Path] = struct{}{}
		previous = change.Path
	}
	return nil
}

func findDocumentByReference(documents map[string]preparedDocument, reference ImmutableReference) (preparedDocument, error) {
	if err := validateImmutableReference(reference, "runner resource", false); err != nil {
		return preparedDocument{}, err
	}
	for _, document := range documents {
		if document.reference == reference {
			return document, nil
		}
	}
	return preparedDocument{}, fmt.Errorf("reference %q/%q is not an exact supplied resource", reference.URI, reference.Digest)
}

func crossCheckProjectAuthority(fixture protocol.ScenarioFixture, targetRoot string, stateRaw []byte, records [][]byte, eventBytes []byte) error {
	if len(stateRaw) == 0 {
		if len(records) != 0 {
			return fmt.Errorf("event log without project state is not valid T0 init authority")
		}
		return nil
	}
	if len(records) != 1 {
		return fmt.Errorf("project state requires exactly one project_initialized event")
	}
	var state projectStateView
	if err := json.Unmarshal(stateRaw, &state); err != nil {
		return fmt.Errorf("decode project state authority: %w", err)
	}
	var event eventView
	if err := json.Unmarshal(records[0], &event); err != nil {
		return fmt.Errorf("decode project event authority: %w", err)
	}
	requestDigest, err := canonicalRequestDigest(state.OriginalRequest)
	if err != nil {
		return err
	}
	if state.State != "initialized" || state.Operation != "virgil.init" ||
		state.Idempotency.Key != state.OriginalRequest.IdempotencyKey ||
		state.Idempotency.OriginalRequestID != state.OriginalRequest.RequestID ||
		state.Idempotency.RequestDigest != requestDigest ||
		event.RequestDigest != requestDigest || event.RequestID != state.OriginalRequest.RequestID ||
		event.IdempotencyKey != state.OriginalRequest.IdempotencyKey ||
		state.Event.EventID != event.EventID || state.Event.Kind != event.Kind || state.Event.LineNumber != 1 ||
		state.Event.Resource.Digest != digest(eventBytes) {
		return fmt.Errorf("project state and event log idempotency authority differ")
	}
	expectedContext := protocol.ContextFromRequest(fixture.InitialRequest)
	expectedContext.ProjectRef.Target.CanonicalPath = targetRoot
	if !reflect.DeepEqual(state.OriginalRequest, fixture.InitialRequest) ||
		!reflect.DeepEqual(state.ResolvedContext, expectedContext) ||
		!reflect.DeepEqual(state.ProjectRef, expectedContext.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ProjectRef, event.ProjectRef) ||
		!reflect.DeepEqual(state.ResolvedContext.DogmaRef, event.DogmaRef) ||
		!reflect.DeepEqual(state.ResolvedContext.ArtifactStoreRef, event.ArtifactStoreRef) ||
		!reflect.DeepEqual(state.OriginalRequest.Actor, event.Actor) || event.ProjectID != state.ProjectRef.ProjectID {
		return fmt.Errorf("project state, fixture and event identities differ")
	}
	roles := make(map[string]ImmutableReference, len(state.Resources))
	for _, resource := range state.Resources {
		roles[resource.Role] = resource.Resource
	}
	if len(roles) != 2 || roles["event_log"].Digest != digest(eventBytes) || roles["dogma"].Digest != state.ResolvedContext.DogmaRef.Digest {
		return fmt.Errorf("project state resources do not bind dogma and event log authority")
	}
	return nil
}

func canonicalRequestDigest(request protocol.OperationRequest) (string, error) {
	raw, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	object, err := decodeObject(raw)
	if err != nil {
		return "", err
	}
	delete(object, "request_id")
	projected, err := json.Marshal(object)
	if err != nil {
		return "", err
	}
	canonical, err := jcs.Transform(projected)
	if err != nil {
		return "", fmt.Errorf("canonicalize original request with RFC8785: %w", err)
	}
	return digest(canonical), nil
}

func validateEnvironment(raw []byte) error {
	if len(raw) == 0 || len(raw) > maxResourceBytes {
		return fmt.Errorf("environment snapshot is empty or too large")
	}
	var environment environmentSnapshot
	if err := decodeStrict(raw, &environment); err != nil {
		return fmt.Errorf("environment snapshot: %w", err)
	}
	if environment.OS == "" || environment.Architecture == "" || environment.NetworkProfile == "" {
		return fmt.Errorf("environment snapshot identity is incomplete")
	}
	if environment.ImageDigest != "" {
		if err := validateSHA256(environment.ImageDigest, "environment image_digest"); err != nil {
			return err
		}
	}
	return nil
}

func validateImmutableReference(reference ImmutableReference, field string, requireRevision bool) error {
	if reference.URI == "" {
		return fmt.Errorf("%s requires URI", field)
	}
	if requireRevision && reference.Revision == "" {
		return fmt.Errorf("%s requires revision", field)
	}
	return validateSHA256(reference.Digest, field+" digest")
}

func validateInterval(startRaw, endRaw string, publishedAt time.Time, label string) error {
	start, err := time.Parse(time.RFC3339Nano, startRaw)
	if err != nil {
		return fmt.Errorf("%s started_at is invalid: %w", label, err)
	}
	end, err := time.Parse(time.RFC3339Nano, endRaw)
	if err != nil {
		return fmt.Errorf("%s ended_at is invalid: %w", label, err)
	}
	if end.Before(start) || end.After(publishedAt) {
		return fmt.Errorf("%s timestamps are not ordered before published_at", label)
	}
	return nil
}

func validateTimestamp(raw string, upperBound time.Time, label string) error {
	timestamp, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return fmt.Errorf("%s timestamp is invalid: %w", label, err)
	}
	if timestamp.After(upperBound) {
		return fmt.Errorf("%s timestamp is after published_at", label)
	}
	return nil
}

func validateProcesses(processes []processView, publishedAt time.Time) error {
	ids := make(map[string]struct{}, len(processes))
	pids := make(map[int]string, len(processes))
	for _, process := range processes {
		if _, duplicate := ids[process.ProcessID]; duplicate {
			return fmt.Errorf("duplicate runner process_id %q", process.ProcessID)
		}
		if previous, duplicate := pids[process.PID]; duplicate {
			return fmt.Errorf("fresh processes %q and %q reused PID %d", previous, process.ProcessID, process.PID)
		}
		if !process.Fresh {
			return fmt.Errorf("runner process %q is not fresh", process.ProcessID)
		}
		if err := validateInterval(process.StartedAt, process.EndedAt, publishedAt, "process "+process.ProcessID); err != nil {
			return err
		}
		ids[process.ProcessID] = struct{}{}
		pids[process.PID] = process.ProcessID
	}
	return nil
}

func crossCheckProcessIdentities(entries []traceEntryView, processes []processView) error {
	traceProcesses := make(map[string]struct{})
	for _, entry := range entries {
		traceProcesses[entry.ProcessID] = struct{}{}
	}
	reportProcesses := make(map[string]struct{}, len(processes))
	for _, process := range processes {
		reportProcesses[process.ProcessID] = struct{}{}
	}
	if !reflect.DeepEqual(traceProcesses, reportProcesses) {
		return fmt.Errorf("trace and runner report process identities differ")
	}
	return nil
}

func validateChecks(checks []checkResult, result outcome) error {
	ids := make(map[string]struct{}, len(checks))
	failed := false
	for _, check := range checks {
		if _, duplicate := ids[check.CheckID]; duplicate {
			return fmt.Errorf("duplicate evidence check %q", check.CheckID)
		}
		if check.Status == "failed" || check.Status == "skipped" {
			failed = true
		}
		ids[check.CheckID] = struct{}{}
	}
	if result.Status == "passed" && failed {
		return fmt.Errorf("passed outcome contains failed or skipped checks")
	}
	if result.Status == "failed" && !failed {
		return fmt.Errorf("failed outcome has no failed or skipped check")
	}
	return nil
}

func content(role, schemaID, mediaType string, reference ImmutableReference) bundleContent {
	return bundleContent{Role: role, SchemaID: schemaID, MediaType: mediaType, Resource: reference}
}

func sortedDocumentIDs(documents map[string]preparedDocument) []string {
	ids := make([]string, 0, len(documents))
	for id := range documents {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (publisher *Publisher) scanAll(files []preparedFile, manifestBytes []byte, eventRecords [][]byte) error {
	for _, file := range files {
		if file.relative == eventLogFile {
			if err := scanNDJSONSecrets(file.relative, eventRecords, publisher.secretPolicy); err != nil {
				return err
			}
			continue
		}
		if err := scanJSONSecrets(file.relative, file.content, publisher.secretPolicy); err != nil {
			return err
		}
	}
	if err := scanJSONSecrets(manifestFile, manifestBytes, publisher.secretPolicy); err != nil {
		return err
	}
	return nil
}

func pathWithin(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return relative != "." && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
