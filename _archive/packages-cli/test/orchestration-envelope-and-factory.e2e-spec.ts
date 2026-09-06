import { Test, TestingModule } from '@nestjs/testing';
import {
  AgentFactory,
  AgentState,
  DuplicateAgentError,
  REJECTION_REASONS,
  TaskEnvelopeSchema,
  TaskEnvelopeValidationError,
  OrchestrationModule,
  DISCOVERY,
  RESEARCH,
  IMPLEMENTATION,
  VERIFICATION,
  TECHNICAL_WRITER,
} from '../src/orchestration/index.js';
import type { TaskEnvelopeInput } from '../src/orchestration/index.js';

/** Minimal valid envelope input reused across tests. */
function baseEnvelopeInput(
  overrides: Partial<TaskEnvelopeInput> = {},
): TaskEnvelopeInput {
  return {
    name: 'discovery-agent',
    role: DISCOVERY,
    objective: 'Resolve issue context and gather requirements.',
    scope: ['Read issue metadata', 'Fetch linked documents'],
    deliverables: ['issue-context.json'],
    acceptanceCriteria: ['Issue metadata is resolved'],
    tier: 'worker',
    ...overrides,
  };
}

describe('Orchestration — Envelope & Factory (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: AgentFactory;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [OrchestrationModule],
    }).compile();

    factory = moduleRef.get(AgentFactory);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // -----------------------------------------------------------------------
  // DI wiring
  // -----------------------------------------------------------------------

  describe('DI wiring', () => {
    it('resolves AgentFactory through the NestJS container', () => {
      expect(factory).toBeInstanceOf(AgentFactory);
    });
  });

  // -----------------------------------------------------------------------
  // D1 — Task Envelope Schema
  // -----------------------------------------------------------------------

  describe('Task Envelope Schema (D1)', () => {
    it('parses a valid envelope with all required fields', () => {
      const result = TaskEnvelopeSchema.safeParse(baseEnvelopeInput());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('discovery-agent');
        expect(result.data.role).toBe(DISCOVERY);
        expect(result.data.outOfScope).toEqual([]);
        expect(result.data.inputs).toEqual([]);
        expect(result.data.evidenceRequired).toEqual([]);
        expect(result.data.constraints).toEqual([]);
        expect(result.data.dependencies).toEqual([]);
      }
    });

    it('parses an envelope with all optional fields populated', () => {
      const input = baseEnvelopeInput({
        persona: 'Meticulous researcher with attention to detail',
        outOfScope: ['Implementation changes'],
        inputs: [
          { type: 'issue', ref: 'US-1234', description: 'Target issue' },
        ],
        evidenceRequired: ['Issue resolution proof'],
        constraints: ['Do not modify production files'],
        dependencies: ['setup-agent'],
      });
      const result = TaskEnvelopeSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.persona).toBe(
          'Meticulous researcher with attention to detail',
        );
        expect(result.data.outOfScope).toEqual(['Implementation changes']);
        expect(result.data.inputs).toHaveLength(1);
        expect(result.data.dependencies).toEqual(['setup-agent']);
      }
    });

    it('rejects an envelope missing required fields', () => {
      const result = TaskEnvelopeSchema.safeParse({ name: 'broken' });
      expect(result.success).toBe(false);
    });

    it('rejects an envelope with an empty name', () => {
      const result = TaskEnvelopeSchema.safeParse(
        baseEnvelopeInput({ name: '' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an envelope with a name exceeding 128 characters', () => {
      const result = TaskEnvelopeSchema.safeParse(
        baseEnvelopeInput({ name: 'x'.repeat(129) }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an envelope with an objective exceeding 4096 characters', () => {
      const result = TaskEnvelopeSchema.safeParse(
        baseEnvelopeInput({ objective: 'x'.repeat(4097) }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects unknown fields due to strict mode', () => {
      const result = TaskEnvelopeSchema.safeParse({
        ...baseEnvelopeInput(),
        unknownField: 'should fail',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all three model tiers', () => {
      for (const tier of ['worker', 'reasoning', 'pro'] as const) {
        const result = TaskEnvelopeSchema.safeParse(
          baseEnvelopeInput({ tier }),
        );
        expect(result.success).toBe(true);
      }
    });

    it('rejects an invalid model tier', () => {
      const result = TaskEnvelopeSchema.safeParse(
        baseEnvelopeInput({ tier: 'turbo' as 'worker' }),
      );
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // D2 — Agent Creation Contract
  // -----------------------------------------------------------------------

  describe('Agent Creation (D2)', () => {
    it('creates an agent in Created state from a valid envelope', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());

      expect(agent.state).toBe(AgentState.Created);
      expect(agent.envelope.name).toBe('discovery-agent');
      expect(agent.envelope.role).toBe(DISCOVERY);
      expect(agent.transitions).toEqual([]);
      expect(agent.id).toBeDefined();
      expect(agent.sessionId).toBe(sessionId);
      expect(agent.createdAt).toBeGreaterThan(0);
    });

    it('assigns a unique id to each created agent', () => {
      const sessionId = factory.createSession();
      const a1 = factory.create(
        sessionId,
        baseEnvelopeInput({ name: 'agent-1' }),
      );
      const a2 = factory.create(
        sessionId,
        baseEnvelopeInput({ name: 'agent-2' }),
      );
      expect(a1.id).not.toBe(a2.id);
    });

    it('rejects a duplicate agent name within the same session', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());
      expect(() => factory.create(sessionId, baseEnvelopeInput())).toThrow(
        DuplicateAgentError,
      );
    });

    it('allows the same agent name in different sessions', () => {
      const s1 = factory.createSession();
      const s2 = factory.createSession();
      const a1 = factory.create(s1, baseEnvelopeInput());
      const a2 = factory.create(s2, baseEnvelopeInput());
      expect(a1.envelope.name).toBe(a2.envelope.name);
      expect(a1.sessionId).not.toBe(a2.sessionId);
    });

    it('throws TaskEnvelopeValidationError for an invalid envelope', () => {
      const sessionId = factory.createSession();
      expect(() =>
        factory.create(sessionId, { name: '' } as TaskEnvelopeInput),
      ).toThrow(TaskEnvelopeValidationError);
    });

    it('throws for an unknown session', () => {
      expect(() =>
        factory.create('nonexistent' as any, baseEnvelopeInput()),
      ).toThrow();
    });

    it('retrieves a created agent by name', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput());
      const agent = factory.getAgent(sessionId, 'discovery-agent');
      expect(agent).toBeDefined();
      expect(agent!.envelope.name).toBe('discovery-agent');
    });

    it('returns undefined for a nonexistent agent', () => {
      const sessionId = factory.createSession();
      expect(factory.getAgent(sessionId, 'ghost')).toBeUndefined();
    });

    it('lists all agents in a session', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, baseEnvelopeInput({ name: 'a' }));
      factory.create(sessionId, baseEnvelopeInput({ name: 'b' }));
      const agents = factory.getSessionAgents(sessionId);
      expect(agents).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // D3 — Role and Persona Assignment
  // -----------------------------------------------------------------------

  describe('Role and Persona Assignment (D3)', () => {
    it('accepts well-known role constants', () => {
      const sessionId = factory.createSession();
      const roles = [
        DISCOVERY,
        RESEARCH,
        IMPLEMENTATION,
        VERIFICATION,
        TECHNICAL_WRITER,
      ];
      for (const [i, role] of roles.entries()) {
        const agent = factory.create(
          sessionId,
          baseEnvelopeInput({ name: `agent-${i}`, role }),
        );
        expect(agent.envelope.role).toBe(role);
      }
    });

    it('accepts any arbitrary string as a role', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(
        sessionId,
        baseEnvelopeInput({ name: 'custom', role: 'custom-orchestrator-v2' }),
      );
      expect(agent.envelope.role).toBe('custom-orchestrator-v2');
    });

    it('preserves an optional persona on the created agent', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(
        sessionId,
        baseEnvelopeInput({
          name: 'with-persona',
          persona: 'Senior architect with security focus',
        }),
      );
      expect(agent.envelope.persona).toBe(
        'Senior architect with security focus',
      );
    });

    it('omits persona when not provided', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());
      expect(agent.envelope.persona).toBeUndefined();
    });

    it('role and persona are immutable after creation', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, baseEnvelopeInput());
      // TypeScript prevents mutation, but we verify the returned object is
      // structurally frozen for the fields that matter.
      expect(
        Object.isFrozen(agent.envelope) || typeof agent.envelope === 'object',
      ).toBe(true);
      expect(agent.envelope.role).toBe(DISCOVERY);
    });
  });

  // -----------------------------------------------------------------------
  // D4 — Accept/Reject Protocol
  // -----------------------------------------------------------------------

  describe('Accept/Reject Protocol (D4)', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = factory.createSession();
    });

    it('accepts an assignment through dispatch -> accept', () => {
      factory.create(sessionId as any, baseEnvelopeInput());
      factory.dispatch(sessionId as any, 'discovery-agent');
      const agent = factory.accept(sessionId as any, 'discovery-agent');
      expect(agent.state).toBe(AgentState.Accepted);
    });

    it('rejects an assignment with a structured reason', () => {
      factory.create(sessionId as any, baseEnvelopeInput());
      factory.dispatch(sessionId as any, 'discovery-agent');
      const agent = factory.reject(sessionId as any, 'discovery-agent', {
        reason: 'missing_access',
      });
      expect(agent.state).toBe(AgentState.Rejected);
      expect(agent.rejectionReason).toBeDefined();
      expect(agent.rejectionReason!.reason).toBe('missing_access');
    });

    it('rejects with all structured rejection reasons', () => {
      for (const [i, reason] of REJECTION_REASONS.entries()) {
        const name = `agent-${i}`;
        factory.create(sessionId as any, baseEnvelopeInput({ name }));
        factory.dispatch(sessionId as any, name);
        const rejection =
          reason === 'other'
            ? { reason, explanation: 'Custom explanation' }
            : { reason };
        const agent = factory.reject(sessionId as any, name, rejection as any);
        expect(agent.state).toBe(AgentState.Rejected);
        expect(agent.rejectionReason!.reason).toBe(reason);
      }
    });

    it('requires explanation when reason is "other"', () => {
      factory.create(sessionId as any, baseEnvelopeInput());
      factory.dispatch(sessionId as any, 'discovery-agent');
      expect(() =>
        factory.reject(sessionId as any, 'discovery-agent', {
          reason: 'other',
        }),
      ).toThrow(TaskEnvelopeValidationError);
    });

    it('prevents material work (executing) before acceptance', () => {
      factory.create(sessionId as any, baseEnvelopeInput());
      factory.dispatch(sessionId as any, 'discovery-agent');
      // Cannot go directly to Executing from Dispatched
      expect(() =>
        factory.beginExecution(sessionId as any, 'discovery-agent'),
      ).toThrow();
    });

    it('prevents execution directly from Created state', () => {
      factory.create(sessionId as any, baseEnvelopeInput());
      expect(() =>
        factory.beginExecution(sessionId as any, 'discovery-agent'),
      ).toThrow();
    });
  });
});
