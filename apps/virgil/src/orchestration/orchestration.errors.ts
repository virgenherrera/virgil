import type { z } from 'zod';
import type { AgentState } from './agent-lifecycle.js';

export class TaskEnvelopeValidationError extends Error {
  constructor(message: string, public readonly issues: readonly z.core.$ZodIssue[]) {
    super(message);
    this.name = 'TaskEnvelopeValidationError';
  }
}

export class AgentLifecycleError extends Error {
  constructor(public readonly from: AgentState, public readonly to: AgentState, public readonly allowedTargets: readonly AgentState[]) {
    super(`Invalid agent transition: ${from} -> ${to}. Allowed from ${from}: [${allowedTargets.join(', ')}]`);
    this.name = 'AgentLifecycleError';
  }
}

export class DuplicateAgentError extends Error {
  constructor(public readonly agentName: string, public readonly sessionId: string) {
    super(`Agent "${agentName}" already exists in session ${sessionId}`);
    this.name = 'DuplicateAgentError';
  }
}

export class DependencyGraphError extends Error {
  constructor(message: string, public readonly involvedNodes: readonly string[]) {
    super(message);
    this.name = 'DependencyGraphError';
  }
}
