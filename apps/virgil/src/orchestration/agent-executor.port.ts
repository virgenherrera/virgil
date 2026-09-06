import type { Ulid } from '../shared/primitives.js';
import type { ModelTier } from './orchestration.constants.js';
import type { TaskEnvelope } from './task-envelope.schema.js';
import type { AgentResult, RejectionResponse } from './agent-instance.js';

export interface ExecutionRequest {
  readonly agentId: Ulid;
  readonly envelope: TaskEnvelope;
  readonly tier: ModelTier;
}

export interface ExecutionResponse {
  readonly agentId: Ulid;
  readonly accepted: boolean;
  readonly rejection?: RejectionResponse;
  readonly result?: AgentResult;
}

export const AGENT_EXECUTOR_PORT = Symbol('AGENT_EXECUTOR_PORT');

export interface AgentExecutor {
  execute(request: ExecutionRequest): Promise<ExecutionResponse>;
}
