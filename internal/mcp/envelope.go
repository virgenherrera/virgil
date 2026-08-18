package mcp

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

// Builder constructs wire.InvokeEnvelope values from simple MCP tool
// parameters, filling in the 50+ field boilerplate required by the Virgil
// wire protocol. It does not perform I/O.
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

// BuildWrite constructs a wire.InvokeEnvelope for virgil.write.
func (b *Builder) BuildWrite(state *ProjectState, writeInput protocol.WriteInput) (wire.InvokeEnvelope, error) {
	if state == nil || !state.Initialized {
		return wire.InvokeEnvelope{}, fmt.Errorf("project is not initialized")
	}
	if writeInput.DocKind == "" || writeInput.Content == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("doc_kind and content are required")
	}

	inputBytes, err := json.Marshal(writeInput)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal write input: %w", err)
	}

	request := b.baseRequest("virgil.write", state.ProjectID, inputBytes, nil)
	return b.buildEnvelope("write", request)
}

// BuildTransition constructs a wire.InvokeEnvelope for virgil.transition.
func (b *Builder) BuildTransition(state *ProjectState, transInput protocol.TransitionInput) (wire.InvokeEnvelope, error) {
	if state == nil || !state.Initialized {
		return wire.InvokeEnvelope{}, fmt.Errorf("project is not initialized")
	}
	if transInput.TaskSlug == "" || transInput.NewStatus == "" {
		return wire.InvokeEnvelope{}, fmt.Errorf("task_slug and new_status are required")
	}

	inputBytes, err := json.Marshal(transInput)
	if err != nil {
		return wire.InvokeEnvelope{}, fmt.Errorf("marshal transition input: %w", err)
	}

	request := b.baseRequest("virgil.transition", state.ProjectID, inputBytes, nil)
	return b.buildEnvelope("transition", request)
}

// baseRequest builds the shared protocol.OperationRequest structure that
// every envelope carries. All cross-reference constraints checked by
// validateBindings in internal/runtime are satisfied by construction.
func (b *Builder) baseRequest(operation, projectID string, input json.RawMessage, runRef *protocol.RunRef) protocol.OperationRequest {
	targetURI := "file://" + b.targetRoot
	storeRefID := "store-" + projectID

	_ = sha256.Sum256(nil)

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
		panic("crypto/rand: " + err.Error())
	}
	return hex.EncodeToString(buf[:])
}
