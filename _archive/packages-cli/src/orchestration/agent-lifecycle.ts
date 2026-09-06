import type { Timestamp } from '../shared/primitives.js';
import { AgentLifecycleError } from './orchestration.errors.js';

/** Deterministic lifecycle states for an orchestrated agent (H10 D6). */
export enum AgentState {
  Created = 'created',
  Dispatched = 'dispatched',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Executing = 'executing',
  Completed = 'completed',
  Failed = 'failed',
  RevisionRequested = 'revision_requested',
  Verified = 'verified',
}

/**
 * Legal state transitions. Keyed by current state, each entry lists every
 * state it may legally move to. Terminal states have no outgoing edges.
 */
export const AGENT_TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  [AgentState.Created]: [AgentState.Dispatched],
  [AgentState.Dispatched]: [AgentState.Accepted, AgentState.Rejected],
  [AgentState.Accepted]: [AgentState.Executing],
  [AgentState.Rejected]: [],
  [AgentState.Executing]: [AgentState.Completed, AgentState.Failed],
  [AgentState.Completed]: [AgentState.Verified, AgentState.RevisionRequested],
  [AgentState.Failed]: [],
  [AgentState.RevisionRequested]: [AgentState.Executing],
  [AgentState.Verified]: [],
};

/** States from which no further transition is possible. */
export const TERMINAL_STATES: ReadonlySet<AgentState> = new Set([
  AgentState.Rejected,
  AgentState.Failed,
  AgentState.Verified,
]);

/** Returns whether transitioning from `from` to `to` is a legal FSM edge. */
export function isValidAgentTransition(
  from: AgentState,
  to: AgentState,
): boolean {
  return AGENT_TRANSITIONS[from].includes(to);
}

/** Throws {@link AgentLifecycleError} if the transition is not legal. */
export function assertValidAgentTransition(
  from: AgentState,
  to: AgentState,
): void {
  if (!isValidAgentTransition(from, to)) {
    throw new AgentLifecycleError(from, to, AGENT_TRANSITIONS[from]);
  }
}

/** Auditable record of a single state transition. */
export interface TransitionRecord {
  readonly from: AgentState;
  readonly to: AgentState;
  readonly timestamp: Timestamp;
  readonly event: string;
}
