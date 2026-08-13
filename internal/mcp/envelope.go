package mcp

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

// Builder constructs wire.InvokeEnvelope values from simple MCP tool
// parameters, filling in the 50+ field boilerplate required by the Virgil
// wire protocol. It does not perform I/O beyond writing seed files for
// content proposals.
type Builder struct {
	targetRoot string
	clock      func() time.Time
}

// NewBuilder creates an envelope builder rooted at targetRoot.
// If clock is nil, time.Now is used.
func NewBuilder(targetRoot string) *Builder {
	return &Builder{
		targetRoot: targetRoot,
		clock:      time.Now,
	}
}

// WithClock replaces the clock function for deterministic testing.
func (b *Builder) WithClock(clock func() time.Time) *Builder {
	b.clock = clock
	return b
}

// BuildInit constructs a wire.InvokeEnvelope for virgil.init.
func (b *Builder) BuildInit(projectID string) (wire.InvokeEnvelope, error) {
	if projectID == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("project_id is required")
	}

	input, err := json.Marshal(map[string]string{"project_id": projectID})
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal init input: %w", err)
	}

	request := b.baseRequest("virgil.init", projectID, input, nil)
	return b.buildEnvelope("init", request)
}

// BuildNew constructs a wire.InvokeEnvelope for virgil.new.
func (b *Builder) BuildNew(changeID, intent string) (wire.InvokeEnvelope, error) {
	if changeID == "" || intent == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("change_id and intent are required")
	}

	now := b.clock().UTC().Format(time.RFC3339Nano)
	input := map[string]any{
		"change_id": changeID,
		"intent":    intent,
		"provenance": map[string]string{
			"kind":        "external_system",
			"captured_at": now,
		},
	}
	inputBytes, err := json.Marshal(input)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal new input: %w", err)
	}

	// Load state to get projectID -- virgil.new requires an initialized project.
	state, err := LoadState(b.targetRoot)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("load state for virgil.new: %w", err)
	}
	if !state.Initialized {
		return wire.InvokeEnvelope{}, fmt.Errorf("project is not initialized at %s", b.targetRoot)
	}

	request := b.baseRequest("virgil.new", state.ProjectID, inputBytes, nil)
	return b.buildEnvelope("new", request)
}

// BuildPropose constructs a wire.InvokeEnvelope for virgil.continue with
// a content_proposal entry. It writes the markdown content to a seed file
// at seed/{change_id}/{artifact_kind}-proposal.md in the target root.
func (b *Builder) BuildPropose(state *ProjectState, artifactKind, content string) (wire.InvokeEnvelope, error) {
	if state == nil || state.ActiveChange == nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("no active change")
	}
	if artifactKind == "" || content == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("artifact_kind and content are required")
	}

	changeID := state.ActiveChange.ChangeID

	// Write the content to a seed file so the content_proposal entry can
	// reference it by URI.
	seedDir := filepath.Join(b.targetRoot, "seed", changeID)
	if err := os.MkdirAll(seedDir, 0o700); err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("create seed directory: %w", err)
	}
	seedFile := fmt.Sprintf("%s-proposal.md", artifactKind)
	seedPath := filepath.Join(seedDir, seedFile)
	if err := os.WriteFile(seedPath, []byte(content), 0o600); err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("write seed file: %w", err)
	}

	// Build the relative URI for the seed file.
	seedURI := fmt.Sprintf("seed/%s/%s", changeID, seedFile)
	contentDigest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(content)))

	input := protocol.ContinueInput{
		ChangeID: changeID,
		Entry: protocol.EntryUnion{
			Kind:         "content_proposal",
			ArtifactKind: artifactKind,
			Content: &protocol.ResourceRef{
				URI:    seedURI,
				Digest: contentDigest,
			},
		},
	}
	inputBytes, err := json.Marshal(input)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal propose input: %w", err)
	}

	runRef := &protocol.RunRef{
		RunID:     state.ActiveChange.RunID,
		ChangeID:  changeID,
		ProjectID: state.ProjectID,
		Baseline:  "baseline-v1",
	}

	request := b.baseRequest("virgil.continue", state.ProjectID, inputBytes, runRef)
	return b.buildEnvelope("propose", request)
}

// BuildApprove constructs a wire.InvokeEnvelope for virgil.continue with
// an approval entry. The artifact_id and revision are derived from the
// current ProjectState.
func (b *Builder) BuildApprove(state *ProjectState, rationale string) (wire.InvokeEnvelope, error) {
	if state == nil || state.ActiveChange == nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("no active change")
	}
	if rationale == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("rationale is required")
	}

	changeID := state.ActiveChange.ChangeID
	artifactID := state.ActiveChange.DerivedStep
	revision := state.ActiveChange.Revision
	if revision == "" {
		revision = "rev-000001"
	}

	input := protocol.ContinueInput{
		ChangeID: changeID,
		Entry: protocol.EntryUnion{
			Kind:       "approval",
			ArtifactID: artifactID,
			Revision:   revision,
			Decision:   "approved",
			Rationale:  rationale,
		},
	}
	inputBytes, err := json.Marshal(input)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal approve input: %w", err)
	}

	runRef := &protocol.RunRef{
		RunID:     state.ActiveChange.RunID,
		ChangeID:  changeID,
		ProjectID: state.ProjectID,
		Baseline:  "baseline-v1",
	}

	request := b.baseRequest("virgil.continue", state.ProjectID, inputBytes, runRef)
	return b.buildEnvelope("approve", request)
}

// baseRequest builds the shared protocol.OperationRequest structure that
// every envelope carries. All cross-reference constraints checked by
// validateBindings in internal/runtime are satisfied by construction.
func (b *Builder) baseRequest(operation, projectID string, input json.RawMessage, runRef *protocol.RunRef) protocol.OperationRequest {
	targetURI := "file://" + b.targetRoot
	storeRefID := "store-" + projectID

	return protocol.OperationRequest{
		ProtocolVersion: protocol.Version,
		Operation:       operation,
		RequestID:       "mcp-req-" + operation + "-" + shortUUID(),
		IdempotencyKey:  "mcp-idem-" + operation + "-" + shortUUID(),
		DogmaRef: protocol.DogmaRef{
			DogmaID: "virgil-dogma",
			Version: "fixture-v1",
			Digest:  virgil.FixtureDogmaV1Digest,
			Source: protocol.ResourceRef{
				URI:      virgil.FixtureDogmaV1URI,
				Revision: "fixture-v1",
				Digest:   virgil.FixtureDogmaV1Digest,
			},
			MethodPack: protocol.MethodPackRef{
				PackID:      "virgil",
				PackVersion: "fixture-v1",
			},
		},
		ProjectRef: protocol.ProjectRef{
			ProjectID: projectID,
			Target: protocol.TargetRef{
				URI:      targetURI,
				Baseline: "baseline-v1",
			},
			DogmaRefID:         "virgil-dogma",
			ArtifactStoreRefID: storeRefID,
		},
		ArtifactStoreRef: protocol.ArtifactStoreRef{
			StoreRefID: storeRefID,
			Adapter: protocol.AdapterRef{
				AdapterID:      "repo-docs",
				AdapterVersion: "v1alpha1",
			},
			ProjectID: projectID,
			Namespace: "docs",
			Policy: protocol.StorePolicy{
				PolicyVersion:  "repo-docs/v1alpha1",
				ReadAllowlist:  []string{"docs/**"},
				WriteAllowlist: []string{"docs/**"},
			},
		},
		Host: protocol.HostRef{
			Adapter: protocol.AdapterRef{
				AdapterID:      "generic-host",
				AdapterVersion: "v1alpha1",
			},
			Capabilities: protocol.Capabilities{
				Supported: []string{
					"operation.invoke",
					"effect.observe",
					"trace.emit",
					"fresh_process",
				},
				Guarantees: []string{
					"structured_envelope",
					"deterministic_replay",
				},
			},
		},
		RunRef: runRef,
		Actor: protocol.ActorRef{
			ActorID:   "mcp-agent",
			Kind:      "agent",
			Authority: []string{"virgil.operation.invoke"},
		},
		Input: input,
	}
}

// buildEnvelope wraps an OperationRequest in the full wire.InvokeEnvelope
// with the target binding, dogma resource binding, and clock.
func (b *Builder) buildEnvelope(operation string, request protocol.OperationRequest) (wire.InvokeEnvelope, error) {
	requestBytes, err := json.Marshal(request)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal operation request: %w", err)
	}

	now := b.clock().UTC().Format(time.RFC3339)

	return wire.InvokeEnvelope{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "invoke",
		ProcessID:       "mcp-" + shortUUID(),
		Request:         json.RawMessage(requestBytes),
		Bindings: wire.Bindings{
			Target: wire.TargetBinding{
				URI:  request.ProjectRef.Target.URI,
				Root: b.targetRoot,
			},
			Resources: []wire.ResourceBinding{
				{
					URI:     virgil.FixtureDogmaV1URI,
					Digest:  virgil.FixtureDogmaV1Digest,
					Content: virgil.FixtureDogmaV1,
				},
			},
		},
		Clock: wire.Clock{Now: now},
	}, nil
}

// shortUUID generates 8 random bytes and returns them as a 16-character
// hex string.
func shortUUID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		// crypto/rand should never fail on supported platforms.
		panic("crypto/rand: " + err.Error())
	}
	return hex.EncodeToString(buf[:])
}
