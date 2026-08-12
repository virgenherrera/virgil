package runtime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/wire"
)

func Invoke(registry *contracts.Registry, envelope wire.InvokeEnvelope) (wire.InvokeResult, error) {
	if err := registry.Validate(contracts.SchemaOperationRequest, envelope.Request); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("operation request contract: %w", err)
	}
	request, err := protocol.DecodeOperationRequest(envelope.Request)
	if err != nil {
		return wire.InvokeResult{}, err
	}
	if err := validateBindings(request, envelope.Bindings); err != nil {
		return wire.InvokeResult{}, err
	}

	context := protocol.ContextFromRequest(request)
	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "unsupported",
		RequestedContext: context,
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{},
		Effects:          []json.RawMessage{},
		Next: protocol.NextAction{
			Operation: "none",
			Condition: "the requested operation is not implemented in runtime Phase 1",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "CAPABILITY_UNSUPPORTED",
				Severity:   "error",
				Scope:      request.Operation,
				Condition:  "the operation handler is not implemented in runtime Phase 1",
				NextAction: "implement the operation before evaluating Production-Safe Green",
			},
		},
	}
	serialized, err := json.Marshal(result)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal unsupported OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, serialized); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("unsupported OperationResult violates contract: %w", err)
	}

	return wire.InvokeResult{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "invoke_result",
		ProcessID:       envelope.ProcessID,
		OSPID:           os.Getpid(),
		Result:          result,
		Observations:    []wire.Observation{},
	}, nil
}

func validateBindings(request protocol.OperationRequest, bindings wire.Bindings) error {
	if bindings.Target.URI != request.ProjectRef.Target.URI {
		return fmt.Errorf("target binding URI does not match ProjectRef")
	}
	if !filepath.IsAbs(bindings.Target.Root) {
		return fmt.Errorf("target binding root must be absolute")
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return fmt.Errorf("request references are not coherent")
	}

	foundDogma := false
	for _, resource := range bindings.Resources {
		if resource.URI != request.DogmaRef.Source.URI {
			continue
		}
		foundDogma = true
		if resource.URI != virgil.FixtureDogmaV1URI ||
			resource.Digest != request.DogmaRef.Source.Digest ||
			resource.Content != virgil.FixtureDogmaV1 {
			return fmt.Errorf("dogma resource binding does not match request")
		}
	}
	if !foundDogma {
		return fmt.Errorf("dogma resource binding is required")
	}
	return nil
}
