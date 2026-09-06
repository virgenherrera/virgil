import { Module } from '@nestjs/common';
import { HandoffProtocolModule } from '../handoff/handoff-protocol.module.js';
import { AgentFactory } from './agent-factory.service.js';
import { DependencyGraphService } from './dependency-graph.service.js';
import { ChildHandoffService } from './child-handoff.service.js';
import { ResultCollectorService } from './result-collector.service.js';
import { NullExecutor } from './null-executor.service.js';
import { AGENT_EXECUTOR_PORT } from './agent-executor.port.js';

@Module({
  imports: [HandoffProtocolModule],
  providers: [
    AgentFactory, DependencyGraphService, ChildHandoffService, ResultCollectorService, NullExecutor,
    { provide: AGENT_EXECUTOR_PORT, useExisting: NullExecutor },
  ],
  exports: [AgentFactory, DependencyGraphService, ChildHandoffService, ResultCollectorService, AGENT_EXECUTOR_PORT, NullExecutor],
})
export class OrchestrationModule {}
