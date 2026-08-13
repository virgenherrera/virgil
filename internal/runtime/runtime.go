package runtime

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	virgil "github.com/virgenherrera/virgil"
	"github.com/virgenherrera/virgil/internal/contracts"
	"github.com/virgenherrera/virgil/internal/protocol"
	"github.com/virgenherrera/virgil/internal/repodocs"
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
	if request.Operation == "virgil.init" && !namespaceIsManaged(request) {
		return blockedStorePolicyResult(registry, envelope, request)
	}
	if request.Operation == "virgil.init" {
		return invokeRepoDocsInit(registry, envelope, request)
	}
	if request.Operation == "virgil.new" && !namespaceIsManaged(request) {
		return blockedStorePolicyResult(registry, envelope, request)
	}
	if request.Operation == "virgil.new" {
		return invokeRepoDocsNew(registry, envelope, request)
	}
	if request.Operation == "virgil.continue" && !namespaceIsManaged(request) {
		return blockedStorePolicyResult(registry, envelope, request)
	}
	if request.Operation == "virgil.continue" {
		return invokeRepoDocsContinue(registry, envelope, request)
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
		Effects:          []protocol.EffectRecord{},
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

func invokeRepoDocsInit(registry *contracts.Registry, envelope wire.InvokeEnvelope, request protocol.OperationRequest) (wire.InvokeResult, error) {
	now, err := time.Parse(time.RFC3339, envelope.Clock.Now)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("invoke clock violates runtime envelope: %w", err)
	}

	result, err := repodocs.Init(
		request,
		envelope.Bindings.Target.Root,
		repodocs.ClockFunc(func() time.Time { return now }),
		repodocs.JCSCanonicalizer{},
		registry,
		wire.ValidateUnambiguousJSON,
	)
	if err != nil {
		var adapterError *repodocs.Error
		if !errors.As(err, &adapterError) {
			return wire.InvokeResult{}, fmt.Errorf("repo-docs init failed without a protocol diagnostic: %w", err)
		}
		result = repoDocsErrorResult(request, adapterError)
	}

	serialized, err := json.Marshal(result)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal repo-docs OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, serialized); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("repo-docs OperationResult violates contract: %w", err)
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

func invokeRepoDocsNew(registry *contracts.Registry, envelope wire.InvokeEnvelope, request protocol.OperationRequest) (wire.InvokeResult, error) {
	now, err := time.Parse(time.RFC3339, envelope.Clock.Now)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("invoke clock violates runtime envelope: %w", err)
	}

	result, err := repodocs.New(
		request,
		envelope.Bindings.Target.Root,
		repodocs.ClockFunc(func() time.Time { return now }),
		repodocs.JCSCanonicalizer{},
		registry,
		wire.ValidateUnambiguousJSON,
	)
	if err != nil {
		var adapterError *repodocs.Error
		if !errors.As(err, &adapterError) {
			return wire.InvokeResult{}, fmt.Errorf("repo-docs new failed without a protocol diagnostic: %w", err)
		}
		result = repoDocsErrorResult(request, adapterError)
	}

	serialized, err := json.Marshal(result)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal repo-docs OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, serialized); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("repo-docs OperationResult violates contract: %w", err)
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

func invokeRepoDocsContinue(registry *contracts.Registry, envelope wire.InvokeEnvelope, request protocol.OperationRequest) (wire.InvokeResult, error) {
	now, err := time.Parse(time.RFC3339, envelope.Clock.Now)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("invoke clock violates runtime envelope: %w", err)
	}

	result, err := repodocs.Continue(
		request,
		envelope.Bindings.Target.Root,
		repodocs.ClockFunc(func() time.Time { return now }),
		repodocs.JCSCanonicalizer{},
		registry,
		wire.ValidateUnambiguousJSON,
	)
	if err != nil {
		var adapterError *repodocs.Error
		if !errors.As(err, &adapterError) {
			return wire.InvokeResult{}, fmt.Errorf("repo-docs continue failed without a protocol diagnostic: %w", err)
		}
		result = repoDocsErrorResult(request, adapterError)
	}

	serialized, err := json.Marshal(result)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal repo-docs OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, serialized); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("repo-docs OperationResult violates contract: %w", err)
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

func repoDocsErrorResult(request protocol.OperationRequest, adapterError *repodocs.Error) protocol.OperationResult {
	status := "error"
	nextAction := "inspect the repo-docs adapter failure and recover the durable authority before retrying"
	switch adapterError.Code {
	case "STORE_POLICY_VIOLATION":
		status = "blocked"
		nextAction = "select a repo-docs namespace and path below the effective managed write policy"
	case "IDEMPOTENCY_CONFLICT":
		status = "blocked"
		nextAction = "use a new idempotency key for the changed intent or replay the original request"
	case "PRECONDITION_FAILED", "IDENTITY_AMBIGUOUS", "METHOD_TARGET_COLLISION":
		status = "blocked"
		nextAction = "correct the explicit request identity or precondition before retrying"
	case "ATOMICITY_UNSUPPORTED":
		status = "unsupported"
		nextAction = "use a host filesystem that provides the required atomic publication guarantees"
	case "CAPABILITY_UNSUPPORTED":
		status = "unsupported"
		nextAction = "provide the required runtime, adapter, or canonicalization capability"
	case "CORRUPT_LEDGER":
		status = "error"
		nextAction = "repair or quarantine the corrupt durable authority before retrying"
	case "INTERNAL_ERROR":
		status = "error"
		nextAction = "inspect the runtime failure without treating partial state as authoritative"
	}

	scope := adapterError.Scope
	if scope == "" {
		scope = request.Operation
	}
	return protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           status,
		RequestedContext: protocol.ContextFromRequest(request),
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{},
		Effects:          []protocol.EffectRecord{},
		Next: protocol.NextAction{
			Operation: "none",
			Condition: adapterError.Condition,
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       adapterError.Code,
				Severity:   "error",
				Scope:      scope,
				Condition:  adapterError.Condition,
				NextAction: nextAction,
			},
		},
	}
}

func blockedStorePolicyResult(registry *contracts.Registry, envelope wire.InvokeEnvelope, request protocol.OperationRequest) (wire.InvokeResult, error) {
	context := protocol.ContextFromRequest(request)
	effect := protocol.EffectRecord{
		ProtocolVersion: request.ProtocolVersion,
		EffectID:        request.RequestID + ":artifact-store-write-denied",
		RequestID:       request.RequestID,
		CausationID:     request.RequestID,
		Kind:            "write",
		Resource: protocol.ResourceRef{
			URI: request.ArtifactStoreRef.Namespace,
		},
		Adapter:        request.ArtifactStoreRef.Adapter,
		Capability:     "artifact_store.write",
		PolicyDecision: "denied",
		Requested: map[string]any{
			"namespace": request.ArtifactStoreRef.Namespace,
			"operation": request.Operation,
		},
		Occurred: false,
		Observed: nil,
		Evidence: []protocol.ResourceRef{},
	}
	effectRaw, err := json.Marshal(effect)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal denied EffectRecord: %w", err)
	}
	if err := registry.Validate(contracts.SchemaEffectRecord, effectRaw); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("denied EffectRecord violates contract: %w", err)
	}

	result := protocol.OperationResult{
		ProtocolVersion:  request.ProtocolVersion,
		Operation:        request.Operation,
		RequestID:        request.RequestID,
		IdempotencyKey:   request.IdempotencyKey,
		Status:           "blocked",
		RequestedContext: context,
		Artifacts:        []protocol.ObjectPointer{},
		Briefs:           []protocol.ObjectPointer{},
		Events:           []protocol.ObjectPointer{},
		Effects:          []protocol.EffectRecord{effect},
		Next: protocol.NextAction{
			Operation: "none",
			Condition: "repo-docs namespace is outside the managed write policy",
		},
		Diagnostics: []protocol.Diagnostic{
			{
				Code:       "STORE_POLICY_VIOLATION",
				Severity:   "error",
				Scope:      request.ArtifactStoreRef.Namespace,
				Condition:  "artifact store namespace is outside docs/**",
				NextAction: "select a repo-docs namespace equal to docs",
			},
		},
	}
	serialized, err := json.Marshal(result)
	if err != nil {
		return wire.InvokeResult{}, fmt.Errorf("marshal blocked OperationResult: %w", err)
	}
	if err := registry.Validate(contracts.SchemaOperationResult, serialized); err != nil {
		return wire.InvokeResult{}, fmt.Errorf("blocked OperationResult violates contract: %w", err)
	}

	return wire.InvokeResult{
		RuntimeProtocol: wire.RuntimeProtocol,
		Kind:            "invoke_result",
		ProcessID:       envelope.ProcessID,
		OSPID:           os.Getpid(),
		Result:          result,
		Observations: []wire.Observation{
			{Kind: "policy_decision", Summary: "repo-docs write denied before filesystem effects"},
		},
	}, nil
}

func validateBindings(request protocol.OperationRequest, bindings wire.Bindings) error {
	if request.ProtocolVersion != protocol.Version {
		return fmt.Errorf("operation protocol version is unsupported")
	}
	if bindings.Target.URI != request.ProjectRef.Target.URI {
		return fmt.Errorf("target binding URI does not match ProjectRef")
	}
	if !filepath.IsAbs(bindings.Target.Root) {
		return fmt.Errorf("target binding root must be absolute")
	}
	targetInfo, err := os.Lstat(bindings.Target.Root)
	if err != nil || !targetInfo.IsDir() || targetInfo.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("target binding root must be an existing real directory")
	}
	if _, err := filepath.EvalSymlinks(bindings.Target.Root); err != nil {
		return fmt.Errorf("target binding root cannot be resolved")
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return fmt.Errorf("request references are not coherent")
	}
	if request.ProjectRef.Target.Baseline == "" || request.ProjectRef.Target.URI == request.DogmaRef.Source.URI {
		return fmt.Errorf("target baseline is missing or method source collides with target")
	}
	if request.ArtifactStoreRef.Adapter.AdapterID != "repo-docs" ||
		request.ArtifactStoreRef.Adapter.AdapterVersion != "v1alpha1" ||
		request.ArtifactStoreRef.Policy.PolicyVersion != "repo-docs/v1alpha1" {
		return fmt.Errorf("artifact store adapter is unsupported")
	}
	if request.Host.Adapter.AdapterID != "generic-host" || request.Host.Adapter.AdapterVersion != "v1alpha1" {
		return fmt.Errorf("host adapter is unsupported")
	}
	if request.Operation == "virgil.init" {
		var input struct {
			ProjectID string `json:"project_id"`
		}
		if err := json.Unmarshal(request.Input, &input); err != nil || input.ProjectID != request.ProjectRef.ProjectID {
			return fmt.Errorf("virgil.init input project_id is incoherent")
		}
	}
	if !hasCapability(request.Host.Capabilities.Supported, "operation.invoke") ||
		!hasCapability(request.Host.Capabilities.Supported, "effect.observe") {
		return fmt.Errorf("host lacks required invoke/effect observation capability")
	}

	if len(bindings.Resources) != 1 {
		return fmt.Errorf("exactly one dogma resource binding is required")
	}
	foundDogma := false
	for _, resource := range bindings.Resources {
		if resource.URI != request.DogmaRef.Source.URI {
			continue
		}
		foundDogma = true
		if resource.URI != virgil.FixtureDogmaV1URI ||
			resource.Digest != request.DogmaRef.Source.Digest ||
			request.DogmaRef.Digest != virgil.FixtureDogmaV1Digest ||
			resource.Content != virgil.FixtureDogmaV1 {
			return fmt.Errorf("dogma resource binding does not match request")
		}
		actualDigest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(resource.Content)))
		if resource.Digest != actualDigest {
			return fmt.Errorf("dogma resource binding digest is invalid")
		}
	}
	if !foundDogma {
		return fmt.Errorf("dogma resource binding is required")
	}
	return nil
}

func hasCapability(capabilities []string, required string) bool {
	for _, capability := range capabilities {
		if capability == required {
			return true
		}
	}
	return false
}

func namespaceIsManaged(request protocol.OperationRequest) bool {
	namespace, ok := cleanPolicyPath(request.ArtifactStoreRef.Namespace)
	if !ok {
		return false
	}
	if namespace != "docs" {
		return false
	}
	for _, pattern := range request.ArtifactStoreRef.Policy.WriteAllowlist {
		if matchPolicyPath(pattern, namespace) {
			return true
		}
	}
	return false
}

func cleanPolicyPath(value string) (string, bool) {
	if value == "" || strings.Contains(value, "\\") || path.IsAbs(value) {
		return "", false
	}
	cleaned := path.Clean(value)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || cleaned != value {
		return "", false
	}
	return cleaned, true
}

func matchPolicyPath(pattern, value string) bool {
	cleanedPattern, ok := cleanPolicyPath(pattern)
	if !ok {
		return false
	}
	return matchPolicySegments(strings.Split(cleanedPattern, "/"), strings.Split(value, "/"))
}

func matchPolicySegments(pattern, value []string) bool {
	if len(pattern) == 0 {
		return len(value) == 0
	}
	if pattern[0] == "**" {
		return matchPolicySegments(pattern[1:], value) || (len(value) > 0 && matchPolicySegments(pattern, value[1:]))
	}
	if len(value) == 0 || (pattern[0] != "*" && pattern[0] != value[0]) {
		return false
	}
	return matchPolicySegments(pattern[1:], value[1:])
}
