import { NullExecutor } from '../../src/orchestration/null-executor.service.js';
import type { ExecutionRequest } from '../../src/orchestration/agent-executor.port.js';
import type { Ulid } from '../../src/shared/primitives.js';
import { createUlid } from '../../src/shared/primitives.js';
import { TaskEnvelopeSchema } from '../../src/orchestration/task-envelope.schema.js';

describe('NullExecutor', () => {
  let executor: NullExecutor;

  beforeEach(() => {
    executor = new NullExecutor();
  });

  function makeRequest(): ExecutionRequest {
    const envelope = TaskEnvelopeSchema.parse({
      name: 'test-agent',
      role: 'analysis',
      objective: 'Test objective',
      scope: ['scope-1'],
      deliverables: ['report.md'],
      acceptanceCriteria: ['Must produce report'],
      tier: 'worker' as const,
    });
    return { agentId: createUlid(), envelope, tier: 'worker' as const };
  }

  it('returns accepted response with result', async () => {
    const request = makeRequest();
    const response = await executor.execute(request);
    expect(response.accepted).toBe(true);
    expect(response.agentId).toBe(request.agentId);
    expect(response.result).toBeDefined();
    expect(response.result!.agentName).toBe('test-agent');
    expect(response.result!.deliverables).toEqual(['report.md']);
    expect(response.result!.metadata).toEqual({ executor: 'null' });
  });

  it('records calls', async () => {
    expect(executor.calls).toHaveLength(0);
    const request = makeRequest();
    await executor.execute(request);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]).toBe(request);
  });

  it('reset clears calls', async () => {
    await executor.execute(makeRequest());
    expect(executor.calls).toHaveLength(1);
    executor.reset();
    expect(executor.calls).toHaveLength(0);
  });
});
