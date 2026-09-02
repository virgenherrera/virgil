import { Injectable } from '@nestjs/common';
import type {
  AgentExecutor,
  ExecutionRequest,
  ExecutionResponse,
} from './agent-executor.port.js';

/**
 * No-op executor that records dispatch calls without performing real work
 * (H10 D7). Used for testing and development; proves the {@link AgentExecutor}
 * port contract is exercisable without a concrete LLM adapter.
 */
@Injectable()
export class NullExecutor implements AgentExecutor {
  private readonly _calls: ExecutionRequest[] = [];

  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    this._calls.push(request);

    return {
      agentId: request.agentId,
      accepted: true,
      result: {
        agentName: request.envelope.name,
        deliverables: request.envelope.deliverables,
        evidence: [],
        metadata: { executor: 'null' },
      },
    };
  }

  get calls(): readonly ExecutionRequest[] {
    return this._calls;
  }

  reset(): void {
    this._calls.length = 0;
  }
}
