import type { Timestamp } from '../shared/primitives.js';
import { AgentLifecycleError } from './orchestration.errors.js';

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

export const TERMINAL_STATES: ReadonlySet<AgentState> = new Set([AgentState.Rejected, AgentState.Failed, AgentState.Verified]);

export function isValidAgentTransition(from: AgentState, to: AgentState): boolean {
  return AGENT_TRANSITIONS[from].includes(to);
}

export function assertValidAgentTransition(from: AgentState, to: AgentState): void {
  if (!isValidAgentTransition(from, to)) {
    throw new AgentLifecycleError(from, to, AGENT_TRANSITIONS[from]);
  }
}

export interface TransitionRecord {
  readonly from: AgentState;
  readonly to: AgentState;
  readonly timestamp: Timestamp;
  readonly event: string;
}
