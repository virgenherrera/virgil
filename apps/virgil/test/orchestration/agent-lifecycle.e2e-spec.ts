import {
  AgentState,
  AGENT_TRANSITIONS,
  TERMINAL_STATES,
  isValidAgentTransition,
  assertValidAgentTransition,
} from '../../src/orchestration/agent-lifecycle.js';
import { AgentLifecycleError } from '../../src/orchestration/orchestration.errors.js';

describe('AgentLifecycle', () => {
  describe('valid transitions', () => {
    const validCases: [AgentState, AgentState][] = [
      [AgentState.Created, AgentState.Dispatched],
      [AgentState.Dispatched, AgentState.Accepted],
      [AgentState.Dispatched, AgentState.Rejected],
      [AgentState.Accepted, AgentState.Executing],
      [AgentState.Executing, AgentState.Completed],
      [AgentState.Executing, AgentState.Failed],
      [AgentState.Completed, AgentState.Verified],
      [AgentState.Completed, AgentState.RevisionRequested],
      [AgentState.RevisionRequested, AgentState.Executing],
    ];

    it.each(validCases)('%s -> %s is valid', (from, to) => {
      expect(isValidAgentTransition(from, to)).toBe(true);
    });

    it.each(validCases)('assertValidAgentTransition does not throw for %s -> %s', (from, to) => {
      expect(() => assertValidAgentTransition(from, to)).not.toThrow();
    });
  });

  describe('invalid transitions', () => {
    const invalidCases: [AgentState, AgentState][] = [
      [AgentState.Created, AgentState.Completed],
      [AgentState.Dispatched, AgentState.Executing],
      [AgentState.Accepted, AgentState.Completed],
      [AgentState.Rejected, AgentState.Executing],
      [AgentState.Failed, AgentState.Executing],
      [AgentState.Verified, AgentState.Executing],
    ];

    it.each(invalidCases)('%s -> %s is invalid', (from, to) => {
      expect(isValidAgentTransition(from, to)).toBe(false);
    });

    it.each(invalidCases)('assertValidAgentTransition throws AgentLifecycleError for %s -> %s', (from, to) => {
      expect(() => assertValidAgentTransition(from, to)).toThrow(AgentLifecycleError);
    });

    it('AgentLifecycleError contains transition details', () => {
      try {
        assertValidAgentTransition(AgentState.Created, AgentState.Completed);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentLifecycleError);
        const err = error as AgentLifecycleError;
        expect(err.from).toBe(AgentState.Created);
        expect(err.to).toBe(AgentState.Completed);
        expect(err.allowedTargets).toEqual([AgentState.Dispatched]);
        expect(err.message).toContain('created');
        expect(err.message).toContain('completed');
      }
    });
  });

  describe('terminal states', () => {
    it('TERMINAL_STATES contains Rejected, Failed, and Verified', () => {
      expect(TERMINAL_STATES.has(AgentState.Rejected)).toBe(true);
      expect(TERMINAL_STATES.has(AgentState.Failed)).toBe(true);
      expect(TERMINAL_STATES.has(AgentState.Verified)).toBe(true);
    });

    it('terminal states have no outgoing edges', () => {
      for (const state of TERMINAL_STATES) {
        expect(AGENT_TRANSITIONS[state]).toEqual([]);
      }
    });

    it('non-terminal states are not in TERMINAL_STATES', () => {
      expect(TERMINAL_STATES.has(AgentState.Created)).toBe(false);
      expect(TERMINAL_STATES.has(AgentState.Dispatched)).toBe(false);
      expect(TERMINAL_STATES.has(AgentState.Executing)).toBe(false);
    });
  });
});
