import { Test, TestingModule } from '@nestjs/testing';
import { createUlid } from '../src/shared/primitives.js';
import { ProviderCapability } from '../src/shared/provider.types.js';
import { HandoffStatus } from '../src/shared/handoff.types.js';
import { HandoffProtocolEnvelopeSchema } from '../src/handoff/handoff-protocol.schema.js';
import {
  AgentFactory,
  AGENT_EXECUTOR_PORT,
  NullExecutor,
  ChildHandoffService,
  ResultCollectorService,
  DependencyGraphService,
  TaskEnvelopeSchema,
  OrchestrationModule,
  DISCOVERY,
  RESEARCH,
  REPOSITORY,
  ANALYSIS,
} from '../src/orchestration/index.js';
import type {
  AgentExecutor,
  TaskEnvelopeInput,
  TaskEnvelope,
  ChildHandoffInput,
} from '../src/orchestration/index.js';

function baseEnvelopeInput(
  overrides: Partial<TaskEnvelopeInput> = {},
): TaskEnvelopeInput {
  return {
    name: 'test-agent',
    role: DISCOVERY,
    objective: 'Test objective.',
    scope: ['Test scope'],
    deliverables: ['test-output'],
    acceptanceCriteria: ['Output produced'],
    tier: 'worker',
    ...overrides,
  };
}

function taskEnvelope(
  overrides: Partial<TaskEnvelopeInput> = {},
): TaskEnvelope {
  return TaskEnvelopeSchema.parse(baseEnvelopeInput(overrides));
}

function baseHandoffInput(): ChildHandoffInput {
  return {
    taskName: 'Implement user service',
    objective: 'Create the user service with CRUD operations.',
    acceptanceCriteria: ['CRUD operations work', 'Tests pass'],
    constraints: ['No external dependencies'],
    components: [
      { path: 'src/user/user.service.ts', description: 'Main service' },
    ],
    ragQueryHints: [
      { query: 'user service patterns', relevanceNote: 'NestJS patterns' },
    ],
    dependencies: [
      { type: 'handoff', id: 'H09', description: 'Handoff protocol' },
    ],
    risks: [{ description: 'Schema changes', mitigation: 'Use migrations' }],
    unresolvedQuestions: ['Should we add pagination?'],
    evidenceRequired: ['Test coverage report'],
    repoTargets: {
      workspaceId: 'virgil-workspace',
      packages: ['@virgil/cli'],
      branch: 'development',
    },
    source: {
      providerType: ProviderCapability.ISSUE,
      providerId: 'github-issues',
      sourceRef: 'US-1234',
      sourceUrl: 'https://example.com/issues/US-1234',
    },
  };
}

describe('Orchestration — Executor, Handoff & Results (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: AgentFactory;
  let executor: NullExecutor;
  let executorPort: AgentExecutor;
  let childHandoffService: ChildHandoffService;
  let resultCollector: ResultCollectorService;
  let dagService: DependencyGraphService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    }).compile();

    factory = moduleRef.get(AgentFactory);
    executor = moduleRef.get(NullExecutor);
    executorPort = moduleRef.get(AGENT_EXECUTOR_PORT);
    childHandoffService = moduleRef.get(ChildHandoffService);
    resultCollector = moduleRef.get(ResultCollectorService);
    dagService = moduleRef.get(DependencyGraphService);
  });

  afterEach(async () => {
    executor.reset();
    await moduleRef.close();
  });

  // -----------------------------------------------------------------------
  // D7 — Vendor-Neutral Execution Contract
  // -----------------------------------------------------------------------

  describe('Vendor-Neutral Execution (D7)', () => {
    it('resolves NullExecutor through the NestJS container', () => {
      expect(executor).toBeInstanceOf(NullExecutor);
    });

    it('resolves AGENT_EXECUTOR_PORT to NullExecutor by default', () => {
      expect(executorPort).toBe(executor);
    });

    it('NullExecutor records dispatch calls', async () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());

      await executor.execute({
        agentId: agent.id,
        envelope: agent.envelope,
        tier: agent.envelope.tier,
      });

      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].agentId).toBe(agent.id);
      expect(executor.calls[0].envelope.name).toBe('test-agent');
    });

    it('NullExecutor returns accepted response with synthetic result', async () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());

      const response = await executor.execute({
        agentId: agent.id,
        envelope: agent.envelope,
        tier: agent.envelope.tier,
      });

      expect(response.accepted).toBe(true);
      expect(response.agentId).toBe(agent.id);
      expect(response.result).toBeDefined();
      expect(response.result!.agentName).toBe('test-agent');
      expect(response.result!.deliverables).toEqual(['test-output']);
      expect(response.result!.metadata).toEqual({ executor: 'null' });
    });

    it('NullExecutor reset clears recorded calls', async () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());

      await executor.execute({
        agentId: agent.id,
        envelope: agent.envelope,
        tier: agent.envelope.tier,
      });
      expect(executor.calls).toHaveLength(1);

      executor.reset();
      expect(executor.calls).toHaveLength(0);
    });

    it('NullExecutor forwards model tier from envelope without interpretation', async () => {
      const sessionId = factory.createSession();
      const agent = factory.create(
        sessionId,
        baseEnvelopeInput({ name: 'pro-agent', tier: 'pro' }),
      );

      await executor.execute({
        agentId: agent.id,
        envelope: agent.envelope,
        tier: agent.envelope.tier,
      });

      expect(executor.calls[0].tier).toBe('pro');
    });

    it('executor port is injectable and replaceable via DI', async () => {
      // Build a separate module with a custom executor
      class CustomExecutor implements AgentExecutor {
        async execute() {
          return {
            agentId: '' as any,
            accepted: false,
            rejection: { reason: 'missing_access' as const },
          };
        }
      }

      const customModule = await Test.createTestingModule({
        imports: [OrchestrationModule],
      })
        .overrideProvider(AGENT_EXECUTOR_PORT)
        .useClass(CustomExecutor)
        .compile();

      const customExecutor =
        customModule.get<AgentExecutor>(AGENT_EXECUTOR_PORT);
      expect(customExecutor).toBeInstanceOf(CustomExecutor);

      const response = await customExecutor.execute({
        agentId: '' as any,
        envelope: taskEnvelope(),
        tier: 'worker',
      });
      expect(response.accepted).toBe(false);

      await customModule.close();
    });
  });

  // -----------------------------------------------------------------------
  // D8 — Child Handoff Generation
  // -----------------------------------------------------------------------

  describe('Child Handoff Generation (D8)', () => {
    it('resolves ChildHandoffService through the container', () => {
      expect(childHandoffService).toBeInstanceOf(ChildHandoffService);
    });

    it('generates a valid H09-conformant handoff envelope', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());

      expect(envelope.status).toBe(HandoffStatus.DRAFT);
      expect(envelope.title).toBe('Implement user service');
      expect(envelope.objective).toBe(
        'Create the user service with CRUD operations.',
      );
      expect(envelope.id).toBeDefined();
      expect(envelope.createdAt).toBeGreaterThan(0);
    });

    it('generated handoff validates against HandoffProtocolEnvelopeSchema', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(() => HandoffProtocolEnvelopeSchema.parse(envelope)).not.toThrow();
    });

    it('maps acceptance criteria with auto-generated ids', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(envelope.acceptanceCriteria).toHaveLength(2);
      expect(envelope.acceptanceCriteria[0].id).toBe('ac-1');
      expect(envelope.acceptanceCriteria[0].description).toBe(
        'CRUD operations work',
      );
      expect(envelope.acceptanceCriteria[1].id).toBe('ac-2');
    });

    it('maps components, constraints, and risks', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(envelope.components).toHaveLength(1);
      expect(envelope.components[0].path).toBe('src/user/user.service.ts');
      expect(envelope.constraints).toEqual(['No external dependencies']);
      expect(envelope.risks).toHaveLength(1);
      expect(envelope.risks[0].description).toBe('Schema changes');
      expect(envelope.risks[0].mitigation).toBe('Use migrations');
    });

    it('maps RAG query hints', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(envelope.ragQueryHints).toHaveLength(1);
      expect(envelope.ragQueryHints[0].query).toBe('user service patterns');
      expect(envelope.ragQueryHints[0].relevanceNote).toBe('NestJS patterns');
    });

    it('maps dependencies with type resolution', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(envelope.dependencies).toHaveLength(1);
      expect(envelope.dependencies[0].type).toBe('handoff');
      expect(envelope.dependencies[0].id).toBe('H09');
    });

    it('maps unresolved questions and evidence requirements', () => {
      const envelope = childHandoffService.generate(baseHandoffInput());
      expect(envelope.unresolvedQuestions).toEqual([
        'Should we add pagination?',
      ]);
      expect(envelope.verificationRequirements.evidenceRequired).toEqual([
        'Test coverage report',
      ]);
    });

    it('maps unknown dependency types to EXTERNAL', () => {
      const input = baseHandoffInput();
      const modified = {
        ...input,
        dependencies: [
          { type: 'custom-type', id: 'dep-1', description: 'Custom dep' },
        ],
      };
      const envelope = childHandoffService.generate(modified);
      expect(envelope.dependencies[0].type).toBe('external');
    });

    it('preserves parentId when provided', () => {
      const parentId = createUlid();
      const envelope = childHandoffService.generate({
        ...baseHandoffInput(),
        parentId,
      });
      expect(envelope.parentId).toBe(parentId);
    });
  });

  // -----------------------------------------------------------------------
  // D9 — Result Collection
  // -----------------------------------------------------------------------

  describe('Result Collection (D9)', () => {
    it('resolves ResultCollectorService through the container', () => {
      expect(resultCollector).toBeInstanceOf(ResultCollectorService);
    });

    it('validates a result that meets all envelope requirements', () => {
      const envelope = taskEnvelope({
        deliverables: ['report.json', 'summary.md'],
        evidenceRequired: ['test-log'],
      });

      const validation = resultCollector.validateResult(envelope, {
        agentName: 'test-agent',
        deliverables: ['report.json', 'summary.md'],
        evidence: ['test-log'],
        metadata: {},
      });

      expect(validation.valid).toBe(true);
      expect(validation.missingDeliverables).toEqual([]);
      expect(validation.missingEvidence).toEqual([]);
    });

    it('identifies missing deliverables', () => {
      const envelope = taskEnvelope({
        deliverables: ['report.json', 'summary.md'],
      });

      const validation = resultCollector.validateResult(envelope, {
        agentName: 'test-agent',
        deliverables: ['report.json'],
        evidence: [],
        metadata: {},
      });

      expect(validation.valid).toBe(false);
      expect(validation.missingDeliverables).toEqual(['summary.md']);
    });

    it('identifies missing evidence', () => {
      const envelope = taskEnvelope({
        evidenceRequired: ['coverage-report', 'lint-output'],
      });

      const validation = resultCollector.validateResult(envelope, {
        agentName: 'test-agent',
        deliverables: ['test-output'],
        evidence: ['coverage-report'],
        metadata: {},
      });

      expect(validation.valid).toBe(false);
      expect(validation.missingEvidence).toEqual(['lint-output']);
    });

    it('collects results into a structured OrchestrationReport', () => {
      const sessionId = factory.createSession();

      // Create and drive two agents to different terminal states
      factory.create(sessionId, baseEnvelopeInput({ name: 'agent-a' }));
      factory.dispatch(sessionId, 'agent-a');
      factory.accept(sessionId, 'agent-a');
      factory.beginExecution(sessionId, 'agent-a');
      factory.complete(sessionId, 'agent-a', {
        agentName: 'agent-a',
        deliverables: ['test-output'],
        evidence: [],
        metadata: {},
      });
      factory.verify(sessionId, 'agent-a');

      factory.create(sessionId, baseEnvelopeInput({ name: 'agent-b' }));
      factory.dispatch(sessionId, 'agent-b');
      factory.reject(sessionId, 'agent-b', {
        reason: 'insufficient_information',
      });

      const agents = factory.getSessionAgents(sessionId);
      const report = resultCollector.collectResults(sessionId, agents);

      expect(report.sessionId).toBe(sessionId);
      expect(report.totalDispatched).toBe(2);
      expect(report.accepted).toBe(1);
      expect(report.rejected).toBe(1);
      expect(report.verified).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.agents).toHaveLength(2);
      expect(report.timestamp).toBeGreaterThan(0);
    });

    it('reports failed agents and incomplete results as unresolved', () => {
      const sessionId = factory.createSession();

      factory.create(
        sessionId,
        baseEnvelopeInput({
          name: 'failing',
          deliverables: ['required-output'],
          evidenceRequired: ['required-evidence'],
        }),
      );
      factory.dispatch(sessionId, 'failing');
      factory.accept(sessionId, 'failing');
      factory.beginExecution(sessionId, 'failing');
      factory.fail(sessionId, 'failing', 'blocker');

      const agents = factory.getSessionAgents(sessionId);
      const report = resultCollector.collectResults(sessionId, agents);

      expect(report.failed).toBe(1);
      expect(report.unresolved.some((u) => u.includes('failed'))).toBe(true);
    });

    it('reports missing deliverables from completed agents as unresolved', () => {
      const sessionId = factory.createSession();

      factory.create(
        sessionId,
        baseEnvelopeInput({
          name: 'incomplete',
          deliverables: ['must-have-a', 'must-have-b'],
        }),
      );
      factory.dispatch(sessionId, 'incomplete');
      factory.accept(sessionId, 'incomplete');
      factory.beginExecution(sessionId, 'incomplete');
      factory.complete(sessionId, 'incomplete', {
        agentName: 'incomplete',
        deliverables: ['must-have-a'],
        evidence: [],
        metadata: {},
      });

      const agents = factory.getSessionAgents(sessionId);
      const report = resultCollector.collectResults(sessionId, agents);

      expect(report.unresolved.some((u) => u.includes('must-have-b'))).toBe(
        true,
      );
    });

    it('reports missing evidence from completed agents as unresolved', () => {
      const sessionId = factory.createSession();

      factory.create(
        sessionId,
        baseEnvelopeInput({
          name: 'missing-evidence',
          evidenceRequired: ['coverage-report', 'lint-log'],
        }),
      );
      factory.dispatch(sessionId, 'missing-evidence');
      factory.accept(sessionId, 'missing-evidence');
      factory.beginExecution(sessionId, 'missing-evidence');
      factory.complete(sessionId, 'missing-evidence', {
        agentName: 'missing-evidence',
        deliverables: ['test-output'],
        evidence: ['coverage-report'],
        metadata: {},
      });

      const agents = factory.getSessionAgents(sessionId);
      const report = resultCollector.collectResults(sessionId, agents);

      expect(report.unresolved.some((u) => u.includes('lint-log'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Integration — Full orchestration session
  // -----------------------------------------------------------------------

  describe('Full Orchestration Session (integration)', () => {
    it('runs a complete parallel discovery session through the DI graph', async () => {
      const sessionId = factory.createSession();

      // Create four independent discovery agents
      const agentNames = ['discovery', 'research', 'analysis', 'repository'];
      const envelopeInputs = agentNames.map((name) =>
        baseEnvelopeInput({
          name,
          role:
            name === 'discovery'
              ? DISCOVERY
              : name === 'research'
                ? RESEARCH
                : name === 'analysis'
                  ? ANALYSIS
                  : REPOSITORY,
        }),
      );

      for (const input of envelopeInputs) {
        factory.create(sessionId, input);
      }

      // Build DAG and verify single-wave parallel dispatch
      const envelopes = factory
        .getSessionAgents(sessionId)
        .map((a) => a.envelope);
      const graph = dagService.buildGraph(envelopes);
      const waves = dagService.getDispatchWaves(graph);
      expect(waves).toHaveLength(1);
      expect(waves[0]).toHaveLength(4);

      // Dispatch all agents in wave 0
      for (const name of agentNames) {
        factory.dispatch(sessionId, name);
      }

      // Execute through NullExecutor
      for (const name of agentNames) {
        const agent = factory.getAgent(sessionId, name)!;
        const response = await executor.execute({
          agentId: agent.id,
          envelope: agent.envelope,
          tier: agent.envelope.tier,
        });

        expect(response.accepted).toBe(true);

        factory.accept(sessionId, name);
        factory.beginExecution(sessionId, name);
        factory.complete(sessionId, name, response.result!);
        factory.verify(sessionId, name);
      }

      // Verify all calls were recorded
      expect(executor.calls).toHaveLength(4);

      // Collect results
      const agents = factory.getSessionAgents(sessionId);
      const report = resultCollector.collectResults(sessionId, agents);

      expect(report.totalDispatched).toBe(4);
      expect(report.verified).toBe(4);
      expect(report.failed).toBe(0);
      expect(report.rejected).toBe(0);
      expect(report.unresolved).toEqual([]);

      // Generate a child implementation handoff from the session
      const handoff = childHandoffService.generate({
        taskName: 'Implement feature US-1234',
        objective: 'Implement the feature based on discovery findings.',
        acceptanceCriteria: ['Feature works', 'Tests pass'],
        constraints: [],
        components: [{ path: 'src/feature.ts' }],
        ragQueryHints: [{ query: 'feature implementation patterns' }],
        dependencies: [],
        risks: [],
        unresolvedQuestions: [],
        evidenceRequired: ['Test coverage'],
        repoTargets: {
          workspaceId: 'virgil-workspace',
          packages: ['@virgil/cli'],
        },
        source: {
          providerType: ProviderCapability.ISSUE,
          providerId: 'github',
          sourceRef: 'US-1234',
        },
      });

      expect(handoff.status).toBe(HandoffStatus.DRAFT);
      expect(handoff.title).toBe('Implement feature US-1234');
      expect(() => HandoffProtocolEnvelopeSchema.parse(handoff)).not.toThrow();
    });
  });
});
