import { Test } from '@nestjs/testing';
import { OrchestrationModule } from '../../src/orchestration/orchestration.module.js';
import { AgentFactory } from '../../src/orchestration/agent-factory.service.js';
import { DependencyGraphService } from '../../src/orchestration/dependency-graph.service.js';
import { ChildHandoffService } from '../../src/orchestration/child-handoff.service.js';
import { ResultCollectorService } from '../../src/orchestration/result-collector.service.js';
import { AGENT_EXECUTOR_PORT } from '../../src/orchestration/agent-executor.port.js';
import { NullExecutor } from '../../src/orchestration/null-executor.service.js';

describe('OrchestrationModule', () => {
  it('compiles and provides all orchestration services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    }).compile();

    expect(moduleRef.get(AgentFactory)).toBeInstanceOf(AgentFactory);
    expect(moduleRef.get(DependencyGraphService)).toBeInstanceOf(DependencyGraphService);
    expect(moduleRef.get(ChildHandoffService)).toBeInstanceOf(ChildHandoffService);
    expect(moduleRef.get(ResultCollectorService)).toBeInstanceOf(ResultCollectorService);
    expect(moduleRef.get(NullExecutor)).toBeInstanceOf(NullExecutor);
  });

  it('provides AGENT_EXECUTOR_PORT bound to NullExecutor', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    }).compile();

    const executor = moduleRef.get(AGENT_EXECUTOR_PORT);
    const nullExecutor = moduleRef.get(NullExecutor);
    expect(executor).toBe(nullExecutor);
  });
});
