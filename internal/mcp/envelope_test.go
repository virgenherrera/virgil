package mcp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

func TestBuildInit_SchemaValidation(t *testing.T) {
	targetRoot := t.TempDir()

	registry, err := contracts.NewRegistry()
	if err != nil {
		t.Fatalf("create contract registry: %v", err)
	}

	builder := NewBuilder(targetRoot)
	fixedTime := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	builder.WithClock(func() time.Time { return fixedTime })

	envelope, err := builder.BuildInit("test-project")
	if err != nil {
		t.Fatalf("BuildInit: %v", err)
	}

	// Verify envelope structure.
	if envelope.Kind != "invoke" {
		t.Errorf("envelope.Kind = %q, want %q", envelope.Kind, "invoke")
	}
	if envelope.RuntimeProtocol == "" {
		t.Error("envelope.RuntimeProtocol is empty")
	}
	if envelope.ProcessID == "" {
		t.Error("envelope.ProcessID is empty")
	}

	// Validate the embedded request against the operation-request schema.
	if err := registry.Validate(contracts.SchemaOperationRequest, envelope.Request); err != nil {
		t.Fatalf("request schema validation: %v", err)
	}

	// Verify the request can be decoded.
	request, err := protocol.DecodeOperationRequest(envelope.Request)
	if err != nil {
		t.Fatalf("decode request: %v", err)
	}
	if request.Operation != "virgil.init" {
		t.Errorf("request.Operation = %q, want %q", request.Operation, "virgil.init")
	}
	if request.ProjectRef.ProjectID != "test-project" {
		t.Errorf("request.ProjectRef.ProjectID = %q, want %q", request.ProjectRef.ProjectID, "test-project")
	}

	// Verify input contains project_id matching ProjectRef.
	var input struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(request.Input, &input); err != nil {
		t.Fatalf("unmarshal init input: %v", err)
	}
	if input.ProjectID != "test-project" {
		t.Errorf("input.project_id = %q, want %q", input.ProjectID, "test-project")
	}

	// Verify binding coherence.
	if envelope.Bindings.Target.URI != request.ProjectRef.Target.URI {
		t.Errorf("target binding URI mismatch: binding=%q, request=%q",
			envelope.Bindings.Target.URI, request.ProjectRef.Target.URI)
	}
	if envelope.Bindings.Target.Root != targetRoot {
		t.Errorf("target binding root = %q, want %q", envelope.Bindings.Target.Root, targetRoot)
	}
	if len(envelope.Bindings.Resources) != 1 {
		t.Fatalf("expected exactly 1 resource binding, got %d", len(envelope.Bindings.Resources))
	}

	// Verify cross-reference coherence (mirrors validateBindings).
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID {
		t.Error("ProjectRef.ProjectID != ArtifactStoreRef.ProjectID")
	}
	if request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID {
		t.Error("ProjectRef.DogmaRefID != DogmaRef.DogmaID")
	}
	if request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		t.Error("ProjectRef.ArtifactStoreRefID != ArtifactStoreRef.StoreRefID")
	}
}

func TestBuildNew_SchemaValidation(t *testing.T) {
	targetRoot := t.TempDir()

	registry, err := contracts.NewRegistry()
	if err != nil {
		t.Fatalf("create contract registry: %v", err)
	}

	// Initialize the project so BuildNew can read state.
	builder := NewBuilder(targetRoot)
	fixedTime := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	builder.WithClock(func() time.Time { return fixedTime })

	initEnvelope, err := builder.BuildInit("test-project")
	if err != nil {
		t.Fatalf("BuildInit: %v", err)
	}

	// Write a minimal virgil.json so LoadState succeeds.
	writeTestConfig(t, targetRoot, initEnvelope)

	// Build the virgil.new envelope.
	newEnvelope, err := builder.BuildNew("my-change", "Add a feature")
	if err != nil {
		t.Fatalf("BuildNew: %v", err)
	}

	if newEnvelope.Kind != "invoke" {
		t.Errorf("envelope.Kind = %q, want %q", newEnvelope.Kind, "invoke")
	}

	// Validate the embedded request against the operation-request schema.
	if err := registry.Validate(contracts.SchemaOperationRequest, newEnvelope.Request); err != nil {
		t.Fatalf("request schema validation: %v", err)
	}

	request, err := protocol.DecodeOperationRequest(newEnvelope.Request)
	if err != nil {
		t.Fatalf("decode request: %v", err)
	}
	if request.Operation != "virgil.new" {
		t.Errorf("request.Operation = %q, want %q", request.Operation, "virgil.new")
	}
	if request.RunRef != nil {
		t.Error("virgil.new must not have a run_ref")
	}
}

func TestGeneratedIDs_AreUnique(t *testing.T) {
	targetRoot := t.TempDir()
	builder := NewBuilder(targetRoot)

	envelope1, err := builder.BuildInit("project-a")
	if err != nil {
		t.Fatalf("BuildInit 1: %v", err)
	}
	envelope2, err := builder.BuildInit("project-b")
	if err != nil {
		t.Fatalf("BuildInit 2: %v", err)
	}

	if envelope1.ProcessID == envelope2.ProcessID {
		t.Errorf("process IDs should be unique, both are %q", envelope1.ProcessID)
	}

	req1, err := protocol.DecodeOperationRequest(envelope1.Request)
	if err != nil {
		t.Fatalf("decode request 1: %v", err)
	}
	req2, err := protocol.DecodeOperationRequest(envelope2.Request)
	if err != nil {
		t.Fatalf("decode request 2: %v", err)
	}

	if req1.RequestID == req2.RequestID {
		t.Errorf("request IDs should be unique, both are %q", req1.RequestID)
	}
	if req1.IdempotencyKey == req2.IdempotencyKey {
		t.Errorf("idempotency keys should be unique, both are %q", req1.IdempotencyKey)
	}
}

func TestShortUUID_Length(t *testing.T) {
	id := shortUUID()
	if len(id) != 16 {
		t.Errorf("shortUUID() length = %d, want 16", len(id))
	}
	for _, c := range id {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("shortUUID() contains non-hex character %q", string(c))
		}
	}
}

// writeTestConfig creates a minimal virgil.json at targetRoot so that
// LoadState returns an initialized project state. This avoids importing
// the runtime package to actually run virgil.init.
func writeTestConfig(t *testing.T, targetRoot string, envelope wire.InvokeEnvelope) {
	t.Helper()

	request, err := protocol.DecodeOperationRequest(envelope.Request)
	if err != nil {
		t.Fatalf("decode init request for test config: %v", err)
	}

	cfg := protocol.VirgilConfig{
		SchemaVersion:   "virgil.dev/config/v1alpha1",
		ProtocolVersion: protocol.Version,
		ProjectID:       request.ProjectRef.ProjectID,
		DogmaRef:        request.DogmaRef,
		Adapter:         request.ArtifactStoreRef.Adapter,
		ManagedRoot:     "docs/",
		CreatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
		CreatedBy:       request.Actor,
		Idempotency: protocol.IdempotencyRecord{
			Key:               request.IdempotencyKey,
			RequestDigest:     "sha256:0000000000000000000000000000000000000000000000000000000000000000",
			OriginalRequestID: request.RequestID,
		},
		OriginalRequest: request,
		ResolvedContext: protocol.Context{
			DogmaRef:         request.DogmaRef,
			ProjectRef:       request.ProjectRef,
			ArtifactStoreRef: request.ArtifactStoreRef,
			Host:             request.Host,
		},
	}

	cfgBytes, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		t.Fatalf("marshal test config: %v", err)
	}
	cfgBytes = append(cfgBytes, '\n')

	configPath := filepath.Join(targetRoot, protocol.VirgilConfigFile)
	if err := os.WriteFile(configPath, cfgBytes, 0o600); err != nil {
		t.Fatalf("write test config: %v", err)
	}
}
