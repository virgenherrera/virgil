package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/virgenherrera/virgil/internal/protocol"
)

func validateFixtureSemantics(fixture protocol.ScenarioFixture, script protocol.ActorScript, fixtureRaw []byte) error {
	if err := validateIdentityCoherence(fixture); err != nil {
		return err
	}
	if err := validateActorActions(fixture, script, fixtureRaw); err != nil {
		return err
	}
	stepPositions, err := validateInteractionOrder(fixture.ExpectedInteraction)
	if err != nil {
		return err
	}
	if err := validateExpectationBounds(fixture); err != nil {
		return err
	}
	if err := validateCheckpoints(fixture.ExpectedCheckpoints, stepPositions); err != nil {
		return err
	}
	return nil
}

func validateIdentityCoherence(fixture protocol.ScenarioFixture) error {
	request := fixture.InitialRequest
	if !reflect.DeepEqual(fixture.TargetRepo, request.ProjectRef.Target) {
		return fmt.Errorf("target_repo and ProjectRef target differ")
	}
	if request.ProjectRef.ProjectID != request.ArtifactStoreRef.ProjectID ||
		request.ProjectRef.DogmaRefID != request.DogmaRef.DogmaID ||
		request.ProjectRef.ArtifactStoreRefID != request.ArtifactStoreRef.StoreRefID {
		return fmt.Errorf("request identity references are incoherent")
	}
	var input struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(request.Input, &input); err != nil {
		return fmt.Errorf("decode fixture input identity: %w", err)
	}
	if input.ProjectID != request.ProjectRef.ProjectID {
		return fmt.Errorf("input project_id differs from ProjectRef")
	}
	if !reflect.DeepEqual(request.ArtifactStoreRef, fixture.AdapterProfile.ArtifactStore) {
		return fmt.Errorf("request and adapter profile artifact stores differ")
	}
	if !reflect.DeepEqual(request.Host, fixture.AdapterProfile.Host) ||
		!reflect.DeepEqual(request.Host, fixture.RuntimeCapabilities) {
		return fmt.Errorf("request, adapter profile, and runtime host capabilities differ")
	}
	if request.Operation != "virgil.init" || fixture.ActorProfile.Mode != "scripted" ||
		!adapterIs(fixture.ActorProfile.Component.Adapter, "scripted-actor", "v1alpha1") ||
		!adapterIs(fixture.AdapterProfile.Host.Adapter, "generic-host", "v1alpha1") ||
		!adapterIs(fixture.AdapterProfile.ArtifactStore.Adapter, "repo-docs", "v1alpha1") ||
		!adapterIs(fixture.AdapterProfile.Isolation.Adapter, "process-isolation", "v1alpha1") ||
		!adapterIs(fixture.AdapterProfile.ModelProvider.Adapter, "replay-model", "v1alpha1") {
		return fmt.Errorf("fixture declares incompatible T0 adapters")
	}
	return nil
}

func adapterIs(adapter protocol.AdapterRef, id, version string) bool {
	return adapter.AdapterID == id && adapter.AdapterVersion == version
}

func validateActorActions(fixture protocol.ScenarioFixture, script protocol.ActorScript, fixtureRaw []byte) error {
	var rawFixture struct {
		InitialRequest json.RawMessage `json:"initial_request"`
	}
	if err := json.Unmarshal(fixtureRaw, &rawFixture); err != nil {
		return fmt.Errorf("decode raw initial_request: %w", err)
	}
	initialRequest, err := compactJSON(rawFixture.InitialRequest)
	if err != nil {
		return fmt.Errorf("compact initial_request: %w", err)
	}

	actionIDs := make(map[string]actionReference, len(script.Actions))
	sequences := make(map[int]struct{}, len(script.Actions))
	previousSequence := -1
	firstInvokeSeen := false
	retryCount := 0
	for index, action := range script.Actions {
		if _, duplicate := actionIDs[action.ActionID]; duplicate {
			return fmt.Errorf("duplicate ActorScript action_id %q", action.ActionID)
		}
		if _, duplicate := sequences[action.Sequence]; duplicate {
			return fmt.Errorf("duplicate ActorScript sequence %d", action.Sequence)
		}
		if index > 0 && action.Sequence <= previousSequence {
			return fmt.Errorf("ActorScript sequences are not strictly increasing")
		}
		sequences[action.Sequence] = struct{}{}
		previousSequence = action.Sequence

		if action.Kind == "invoke" && !firstInvokeSeen {
			firstInvokeSeen = true
			invocation, err := compactJSON(action.OperationRequest)
			if err != nil {
				return fmt.Errorf("compact first invoke request: %w", err)
			}
			if !bytes.Equal(initialRequest, invocation) {
				return fmt.Errorf("first invoke does not byte-match compact initial_request")
			}
		}
		if action.Kind == "retry" {
			retryCount++
			referenced, ok := actionIDs[action.RetriesActionID]
			if !ok || referenced.Action.Kind != "invoke" || referenced.Index >= index {
				return fmt.Errorf("retry %q does not reference an earlier invoke", action.ActionID)
			}
			if action.ProcessID == referenced.Action.ProcessID {
				return fmt.Errorf("retry %q does not change process_id", action.ActionID)
			}
			if !hasRestartBeforeRetry(script.Actions, referenced.Index, index, action.ProcessID) {
				return fmt.Errorf("retry %q has no intervening restart_process for its process_id", action.ActionID)
			}
			if err := validateRetryRequest(referenced.Action.OperationRequest, action.OperationRequest); err != nil {
				return fmt.Errorf("retry %q: %w", action.ActionID, err)
			}
		}
		actionIDs[action.ActionID] = actionReference{Action: action, Index: index}
	}
	if !firstInvokeSeen {
		return fmt.Errorf("ActorScript has no invoke")
	}
	if retryCount > fixture.ExpectedInteraction.MaxRetries {
		return fmt.Errorf("ActorScript retries exceed expected max_retries")
	}
	return nil
}

func hasRestartBeforeRetry(actions []protocol.ActorAction, invokeIndex, retryIndex int, processID string) bool {
	for index := invokeIndex + 1; index < retryIndex; index++ {
		if actions[index].Kind == "restart_process" && actions[index].ProcessID == processID {
			return true
		}
	}
	return false
}

type actionReference struct {
	Action protocol.ActorAction
	Index  int
}

func validateRetryRequest(originalRaw, retryRaw json.RawMessage) error {
	var original map[string]any
	var retry map[string]any
	if err := json.Unmarshal(originalRaw, &original); err != nil {
		return fmt.Errorf("decode referenced invoke: %w", err)
	}
	if err := json.Unmarshal(retryRaw, &retry); err != nil {
		return fmt.Errorf("decode retry request: %w", err)
	}
	originalID, _ := original["request_id"].(string)
	retryID, _ := retry["request_id"].(string)
	if originalID == "" || retryID == "" || originalID == retryID {
		return fmt.Errorf("retry request_id must be new")
	}
	if original["idempotency_key"] != retry["idempotency_key"] {
		return fmt.Errorf("retry changes idempotency_key")
	}
	delete(original, "request_id")
	delete(retry, "request_id")
	if !reflect.DeepEqual(original, retry) {
		return fmt.Errorf("retry content differs beyond request_id")
	}
	return nil
}

func compactJSON(raw []byte) ([]byte, error) {
	var compacted bytes.Buffer
	if err := json.Compact(&compacted, raw); err != nil {
		return nil, err
	}
	return compacted.Bytes(), nil
}

func validateInteractionOrder(interaction protocol.ExpectedInteraction) (map[string]int, error) {
	positions := make(map[string]int, len(interaction.RequiredSteps))
	adjacency := make(map[string][]string, len(interaction.RequiredSteps))
	indegree := make(map[string]int, len(interaction.RequiredSteps))
	for index, step := range interaction.RequiredSteps {
		if _, duplicate := positions[step.StepID]; duplicate {
			return nil, fmt.Errorf("duplicate interaction step_id %q", step.StepID)
		}
		positions[step.StepID] = index
		indegree[step.StepID] = 0
	}
	for _, constraint := range interaction.OrderConstraints {
		if _, ok := positions[constraint.Before]; !ok {
			return nil, fmt.Errorf("order constraint references missing before step %q", constraint.Before)
		}
		if _, ok := positions[constraint.After]; !ok {
			return nil, fmt.Errorf("order constraint references missing after step %q", constraint.After)
		}
		adjacency[constraint.Before] = append(adjacency[constraint.Before], constraint.After)
		indegree[constraint.After]++
	}
	queue := make([]string, 0, len(indegree))
	for stepID, count := range indegree {
		if count == 0 {
			queue = append(queue, stepID)
		}
	}
	visited := 0
	for len(queue) > 0 {
		stepID := queue[0]
		queue = queue[1:]
		visited++
		for _, successor := range adjacency[stepID] {
			indegree[successor]--
			if indegree[successor] == 0 {
				queue = append(queue, successor)
			}
		}
	}
	if visited != len(indegree) {
		return nil, fmt.Errorf("interaction order constraints contain a cycle")
	}
	return positions, nil
}

func validateExpectationBounds(fixture protocol.ScenarioFixture) error {
	groups := [][]protocol.ObjectExpectation{
		fixture.ExpectedEvents,
		fixture.ExpectedArtifacts,
		fixture.ExpectedEffects,
	}
	for _, checkpoint := range fixture.ExpectedCheckpoints {
		groups = append(groups, checkpoint.ExpectedEvents, checkpoint.ExpectedArtifacts)
	}
	for _, expectations := range groups {
		for _, expectation := range expectations {
			if expectation.MinCount > expectation.MaxCount {
				return fmt.Errorf("expectation %q has min_count greater than max_count", expectation.Kind)
			}
		}
	}
	return nil
}

func validateCheckpoints(checkpoints []protocol.CheckpointExpectation, stepPositions map[string]int) error {
	checkpointPositions := make(map[string]int, len(checkpoints))
	previousStepPosition := -1
	for index, checkpoint := range checkpoints {
		if _, duplicate := checkpointPositions[checkpoint.CheckpointID]; duplicate {
			return fmt.Errorf("duplicate checkpoint_id %q", checkpoint.CheckpointID)
		}
		stepPosition, ok := stepPositions[checkpoint.AfterStep]
		if !ok {
			return fmt.Errorf("checkpoint %q references missing step %q", checkpoint.CheckpointID, checkpoint.AfterStep)
		}
		if index > 0 && stepPosition <= previousStepPosition {
			return fmt.Errorf("checkpoints are not ordered by after_step")
		}
		if checkpoint.RelativeTo != "fixture_baseline" {
			referencedPosition, ok := checkpointPositions[checkpoint.RelativeTo]
			if !ok || referencedPosition >= index {
				return fmt.Errorf("checkpoint %q relative_to is not baseline or an earlier checkpoint", checkpoint.CheckpointID)
			}
		}
		checkpointPositions[checkpoint.CheckpointID] = index
		previousStepPosition = stepPosition
	}
	return nil
}
