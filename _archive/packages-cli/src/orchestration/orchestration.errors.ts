import type { z } from 'zod';
import type { AgentState } from './agent-lifecycle.js';

/** Thrown when a task envelope fails Zod schema validation. */
export class TaskEnvelopeValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: readonly z.core.$ZodIssue[],
  ) {
    super(message);
    this.name = 'TaskEnvelopeValidationError';
  }
}

/** Thrown when an invalid agent lifecycle state transition is attempted. */
export class AgentLifecycleError extends Error {
  constructor(
    public readonly from: AgentState,
    public readonly to: AgentState,
    public readonly allowedTargets: readonly AgentState[],
  ) {
    super(
      `Invalid agent transition: ${from} -> ${to}. Allowed from ${from}: [${allowedTargets.join(', ')}]`,
    );
    this.name = 'AgentLifecycleError';
  }
}

/** Thrown when a duplicate agent name is registered within the same session. */
export class DuplicateAgentError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly sessionId: string,
  ) {
    super(`Agent "${agentName}" already exists in session ${sessionId}`);
    this.name = 'DuplicateAgentError';
  }
}

/** Thrown when the dependency graph contains a cycle or references a missing node. */
export class DependencyGraphError extends Error {
  constructor(
    message: string,
    public readonly involvedNodes: readonly string[],
  ) {
    super(message);
    this.name = 'DependencyGraphError';
  }
}
