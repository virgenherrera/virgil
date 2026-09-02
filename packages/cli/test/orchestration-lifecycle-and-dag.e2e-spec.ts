import { Test, TestingModule } from '@nestjs/testing';
import {
  AgentFactory,
  AgentState,
  AgentLifecycleError,
  TERMINAL_STATES,
  AGENT_TRANSITIONS,
  DependencyGraphService,
  DependencyGraphError,
  OrchestrationModule,
  DISCOVERY,
  RESEARCH,
  REPOSITORY,
  ANALYSIS,
  IMPLEMENTATION,
} from '../src/orchestration/index.js';
import type { TaskEnvelopeInput } from '../src/orchestration/index.js';

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

describe('Orchestration — Lifecycle FSM & DAG (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: AgentFactory;
  let dagService: DependencyGraphService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    }).compile();

    factory = moduleRef.get(AgentFactory);
    dagService = moduleRef.get(DependencyGraphService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // -----------------------------------------------------------------------
  // D6 — Agent Lifecycle State Machine
  // -----------------------------------------------------------------------

  describe('Agent Lifecycle FSM (D6)', () => {
    it('follows the happy path: Created -> Dispatched -> Accepted -> Executing -> Completed -> Verified', () => {
      const sessionId = factory.createSession();
      let agent = factory.create(sessionId, baseEnvelopeInput());
      expect(agent.state).toBe(AgentState.Created);

      agent = factory.dispatch(sessionId, 'test-agent');
      expect(agent.state).toBe(AgentState.Dispatched);

      agent = factory.accept(sessionId, 'test-agent');
      expect(agent.state).toBe(AgentState.Accepted);

      agent = factory.beginExecution(sessionId, 'test-agent');
      expect(agent.state).toBe(AgentState.Executing);

      agent = factory.complete(sessionId, 'test-agent', {
        agentName: 'test-agent',
        deliverables: ['test-output'],
        evidence: [],
        metadata: {},
      });
      expect(agent.state).toBe(AgentState.Completed);

      agent = factory.verify(sessionId, 'test-agent');
      expect(agent.state).toBe(AgentState.Verified);
    });

    it('records transitions with timestamps and events', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());
      factory.dispatch(sessionId, 'test-agent');
      const agent = factory.accept(sessionId, 'test-agent');

      expect(agent.transitions).toHaveLength(2);
      expect(agent.transitions[0].from).toBe(AgentState.Created);
      expect(agent.transitions[0].to).toBe(AgentState.Dispatched);
      expect(agent.transitions[0].event).toBe('dispatch');
      expect(agent.transitions[0].timestamp).toBeGreaterThan(0);
      expect(agent.transitions[1].from).toBe(AgentState.Dispatched);
      expect(agent.transitions[1].to).toBe(AgentState.Accepted);
    });

    it('supports the revision path: Completed -> RevisionRequested -> Executing -> Completed', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());
      factory.dispatch(sessionId, 'test-agent');
      factory.accept(sessionId, 'test-agent');
      factory.beginExecution(sessionId, 'test-agent');
      factory.complete(sessionId, 'test-agent', {
        agentName: 'test-agent',
        deliverables: ['test-output'],
        evidence: [],
        metadata: {},
      });

      let agent = factory.requestRevision(
        sessionId,
        'test-agent',
        'Insufficient coverage',
      );
      expect(agent.state).toBe(AgentState.RevisionRequested);

      agent = factory.resumeExecution(sessionId, 'test-agent');
      expect(agent.state).toBe(AgentState.Executing);
    });

    it('supports the failure path: Executing -> Failed', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());
      factory.dispatch(sessionId, 'test-agent');
      factory.accept(sessionId, 'test-agent');
      factory.beginExecution(sessionId, 'test-agent');

      const agent = factory.fail(
        sessionId,
        'test-agent',
        'Blocker encountered',
      );
      expect(agent.state).toBe(AgentState.Failed);
    });

    it('rejects invalid transitions from each state', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());

      // Created -> Accepted is not valid
      expect(() => factory.accept(sessionId, 'test-agent')).toThrow(
        AgentLifecycleError,
      );

      // Created -> Executing is not valid
      expect(() => factory.beginExecution(sessionId, 'test-agent')).toThrow(
        AgentLifecycleError,
      );
    });

    it('rejects transitions from terminal states', () => {
      // Rejected is terminal
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput({ name: 'rejected-agent' }));
      factory.dispatch(sessionId, 'rejected-agent');
      factory.reject(sessionId, 'rejected-agent', {
        reason: 'missing_access',
      });

      expect(() => factory.dispatch(sessionId, 'rejected-agent')).toThrow(
        AgentLifecycleError,
      );

      // Failed is terminal
      factory.create(sessionId, baseEnvelopeInput({ name: 'failed-agent' }));
      factory.dispatch(sessionId, 'failed-agent');
      factory.accept(sessionId, 'failed-agent');
      factory.beginExecution(sessionId, 'failed-agent');
      factory.fail(sessionId, 'failed-agent', 'error');

      expect(() => factory.beginExecution(sessionId, 'failed-agent')).toThrow(
        AgentLifecycleError,
      );

      // Verified is terminal
      factory.create(sessionId, baseEnvelopeInput({ name: 'verified-agent' }));
      factory.dispatch(sessionId, 'verified-agent');
      factory.accept(sessionId, 'verified-agent');
      factory.beginExecution(sessionId, 'verified-agent');
      factory.complete(sessionId, 'verified-agent', {
        agentName: 'verified-agent',
        deliverables: ['test-output'],
        evidence: [],
        metadata: {},
      });
      factory.verify(sessionId, 'verified-agent');

      expect(() => factory.dispatch(sessionId, 'verified-agent')).toThrow(
        AgentLifecycleError,
      );
    });

    it('identifies terminal states correctly', () => {
      expect(TERMINAL_STATES.has(AgentState.Rejected)).toBe(true);
      expect(TERMINAL_STATES.has(AgentState.Failed)).toBe(true);
      expect(TERMINAL_STATES.has(AgentState.Verified)).toBe(true);
      expect(TERMINAL_STATES.has(AgentState.Created)).toBe(false);
      expect(TERMINAL_STATES.has(AgentState.Executing)).toBe(false);
    });

    it('confirms all terminal states have no outgoing transitions', () => {
      for (const state of TERMINAL_STATES) {
        expect(AGENT_TRANSITIONS[state]).toEqual([]);
      }
    });

    it('AgentLifecycleError carries from, to, and allowedTargets', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());

      try {
        factory.accept(sessionId, 'test-agent');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AgentLifecycleError);
        const e = err as AgentLifecycleError;
        expect(e.from).toBe(AgentState.Created);
        expect(e.to).toBe(AgentState.Accepted);
        expect(e.allowedTargets).toEqual([AgentState.Dispatched]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // D5 — Parallelizable Work Identification (DAG)
  // -----------------------------------------------------------------------

  describe('Dependency Graph (D5)', () => {
    it('resolves DependencyGraphService through the container', () => {
      expect(dagService).toBeInstanceOf(DependencyGraphService);
    });

    it('builds a graph from independent envelopes', () => {
      const envelopes = [
        {
          ...baseEnvelopeInput({ name: 'a', role: DISCOVERY }),
          outOfScope: [],
          inputs: [],
          evidenceRequired: [],
          constraints: [],
          dependencies: [],
        },
        {
          ...baseEnvelopeInput({ name: 'b', role: RESEARCH }),
          outOfScope: [],
          inputs: [],
          evidenceRequired: [],
          constraints: [],
          dependencies: [],
        },
        {
          ...baseEnvelopeInput({ name: 'c', role: REPOSITORY }),
          outOfScope: [],
          inputs: [],
          evidenceRequired: [],
          constraints: [],
          dependencies: [],
        },
      ].map((e) => TaskEnvelopeSchemaHelper(e));

      const graph = dagService.buildGraph(envelopes);
      expect(graph.nodes.size).toBe(3);
    });

    it('dispatches independent agents in a single wave', () => {
      const envelopes = [
        taskEnvelope({ name: 'discovery', role: DISCOVERY }),
        taskEnvelope({ name: 'research', role: RESEARCH }),
        taskEnvelope({ name: 'analysis', role: ANALYSIS }),
        taskEnvelope({ name: 'repository', role: REPOSITORY }),
      ];

      const graph = dagService.buildGraph(envelopes);
      const waves = dagService.getDispatchWaves(graph);

      expect(waves).toHaveLength(1);
      expect(waves[0]).toHaveLength(4);
    });

    it('orders dependent agents into sequential waves', () => {
      const envelopes = [
        taskEnvelope({ name: 'discovery', role: DISCOVERY }),
        taskEnvelope({ name: 'research', role: RESEARCH }),
        taskEnvelope({
          name: 'implementation',
          role: IMPLEMENTATION,
          dependencies: ['discovery', 'research'],
        }),
      ];

      const graph = dagService.buildGraph(envelopes);
      const waves = dagService.getDispatchWaves(graph);

      expect(waves).toHaveLength(2);
      expect(waves[0]).toContain('discovery');
      expect(waves[0]).toContain('research');
      expect(waves[1]).toEqual(['implementation']);
    });

    it('supports a three-wave dependency chain', () => {
      const envelopes = [
        taskEnvelope({ name: 'phase-1' }),
        taskEnvelope({ name: 'phase-2', dependencies: ['phase-1'] }),
        taskEnvelope({ name: 'phase-3', dependencies: ['phase-2'] }),
      ];

      const graph = dagService.buildGraph(envelopes);
      const waves = dagService.getDispatchWaves(graph);

      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['phase-1']);
      expect(waves[1]).toEqual(['phase-2']);
      expect(waves[2]).toEqual(['phase-3']);
    });

    it('detects circular dependencies and throws DependencyGraphError', () => {
      const envelopes = [
        taskEnvelope({ name: 'a', dependencies: ['b'] }),
        taskEnvelope({ name: 'b', dependencies: ['c'] }),
        taskEnvelope({ name: 'c', dependencies: ['a'] }),
      ];

      expect(() => dagService.buildGraph(envelopes)).toThrow(
        DependencyGraphError,
      );
    });

    it('detects self-referencing dependencies', () => {
      const envelopes = [
        taskEnvelope({ name: 'self-loop', dependencies: ['self-loop'] }),
      ];

      expect(() => dagService.buildGraph(envelopes)).toThrow(
        DependencyGraphError,
      );
    });

    it('rejects references to unknown dependency nodes', () => {
      const envelopes = [
        taskEnvelope({ name: 'orphan', dependencies: ['nonexistent'] }),
      ];

      expect(() => dagService.buildGraph(envelopes)).toThrow(
        DependencyGraphError,
      );
    });

    it('rejects duplicate task names', () => {
      const envelopes = [
        taskEnvelope({ name: 'dup' }),
        taskEnvelope({ name: 'dup' }),
      ];

      expect(() => dagService.buildGraph(envelopes)).toThrow(
        DependencyGraphError,
      );
    });

    it('serializes the graph to JSON for audit', () => {
      const envelopes = [
        taskEnvelope({ name: 'a', role: DISCOVERY }),
        taskEnvelope({ name: 'b', role: IMPLEMENTATION, dependencies: ['a'] }),
      ];

      const graph = dagService.buildGraph(envelopes);
      const json = dagService.toJSON(graph) as Record<string, unknown>;

      expect(json).toHaveProperty('nodes');
      const nodes = json['nodes'] as Record<
        string,
        { role: string; dependencies: string[] }
      >;
      expect(nodes['a'].role).toBe(DISCOVERY);
      expect(nodes['a'].dependencies).toEqual([]);
      expect(nodes['b'].role).toBe(IMPLEMENTATION);
      expect(nodes['b'].dependencies).toEqual(['a']);
    });

    it('DependencyGraphError carries involvedNodes', () => {
      try {
        dagService.buildGraph([
          taskEnvelope({ name: 'a', dependencies: ['b'] }),
          taskEnvelope({ name: 'b', dependencies: ['a'] }),
        ]);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DependencyGraphError);
        const e = err as DependencyGraphError;
        expect(e.involvedNodes.length).toBeGreaterThan(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { TaskEnvelopeSchema } from '../src/orchestration/index.js';
import type { TaskEnvelope } from '../src/orchestration/index.js';

/** Parses a raw input through the schema to produce a validated TaskEnvelope. */
function TaskEnvelopeSchemaHelper(
  input: Record<string, unknown>,
): TaskEnvelope {
  return TaskEnvelopeSchema.parse(input);
}

/** Shorthand for producing a valid parsed TaskEnvelope with overrides. */
function taskEnvelope(
  overrides: Partial<TaskEnvelopeInput> = {},
): TaskEnvelope {
  return TaskEnvelopeSchema.parse(baseEnvelopeInput(overrides));
}
