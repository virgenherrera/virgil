import type { Ulid } from '../shared/primitives.js';
import type { ModelTier } from './orchestration.constants.js';
import type { TaskEnvelope } from './task-envelope.schema.js';
import type { AgentResult, RejectionResponse } from './agent-instance.js';

/** Request payload dispatched to an {@link AgentExecutor} (H10 D7). */
export interface ExecutionRequest {
  readonly agentId: Ulid;
  readonly envelope: TaskEnvelope;
  readonly tier: ModelTier;
}

/** Response returned by an {@link AgentExecutor} after processing. */
export interface ExecutionResponse {
  readonly agentId: Ulid;
  readonly accepted: boolean;
  readonly rejection?: RejectionResponse;
  readonly result?: AgentResult;
}

/**
 * DI token for the vendor-neutral agent execution port. Concrete executors
 * (H11 adapters) are swapped via NestJS provider registration without
 * modifying orchestration logic.
 */
export const AGENT_EXECUTOR_PORT = Symbol('AGENT_EXECUTOR_PORT');

/**
 * Vendor-neutral execution contract (H10 D7). The orchestration layer
 * dispatches agent envelopes through this port; concrete adapters translate
 * abstract capability requirements to specific provider implementations.
 */
export interface AgentExecutor {
  execute(request: ExecutionRequest): Promise<ExecutionResponse>;
}
