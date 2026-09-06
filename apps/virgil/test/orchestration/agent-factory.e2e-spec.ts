import { AgentFactory } from '../../src/orchestration/agent-factory.service.js';
import { AgentState } from '../../src/orchestration/agent-lifecycle.js';
import { AgentLifecycleError, DuplicateAgentError, TaskEnvelopeValidationError } from '../../src/orchestration/orchestration.errors.js';
import type { TaskEnvelopeInput } from '../../src/orchestration/task-envelope.schema.js';
import type { AgentResult } from '../../src/orchestration/agent-instance.js';

function makeEnvelope(overrides: Partial<TaskEnvelopeInput> = {}): TaskEnvelopeInput {
  return {
    name: 'test-agent',
    role: 'analysis',
    objective: 'Test objective',
    scope: ['scope-1'],
    deliverables: ['report.md'],
    acceptanceCriteria: ['Must produce report'],
    tier: 'worker' as const,
    ...overrides,
  };
}

describe('AgentFactory', () => {
  let factory: AgentFactory;

  beforeEach(() => {
    factory = new AgentFactory();
  });

  describe('createSession', () => {
    it('returns a session id', () => {
      const sessionId = factory.createSession();
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });
  });

  describe('create', () => {
    it('creates an agent in Created state', () => {
      const sessionId = factory.createSession();
      const agent = factory.create(sessionId, makeEnvelope());
      expect(agent.state).toBe(AgentState.Created);
      expect(agent.envelope.name).toBe('test-agent');
      expect(agent.sessionId).toBe(sessionId);
      expect(agent.transitions).toEqual([]);
    });

    it('throws DuplicateAgentError for duplicate name', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      expect(() => factory.create(sessionId, makeEnvelope())).toThrow(DuplicateAgentError);
    });

    it('throws TaskEnvelopeValidationError for invalid envelope', () => {
      const sessionId = factory.createSession();
      expect(() => factory.create(sessionId, { name: '' } as TaskEnvelopeInput)).toThrow(TaskEnvelopeValidationError);
    });

    it('throws for unknown session', () => {
      expect(() => factory.create('nonexistent' as string, makeEnvelope())).toThrow('does not exist');
    });
  });

  describe('getAgent', () => {
    it('returns the agent by name', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      const agent = factory.getAgent(sessionId, 'test-agent');
      expect(agent).toBeDefined();
      expect(agent!.envelope.name).toBe('test-agent');
    });

    it('returns undefined for unknown agent', () => {
      const sessionId = factory.createSession();
      expect(factory.getAgent(sessionId, 'nope')).toBeUndefined();
    });

    it('returns undefined for unknown session', () => {
      expect(factory.getAgent('nope' as string, 'nope')).toBeUndefined();
    });
  });

  describe('getSessionAgents', () => {
    it('returns all agents in a session', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope({ name: 'agent-1' }));
      factory.create(sessionId, makeEnvelope({ name: 'agent-2' }));
      const agents = factory.getSessionAgents(sessionId);
      expect(agents).toHaveLength(2);
    });

    it('returns empty array for unknown session', () => {
      expect(factory.getSessionAgents('nope' as string)).toEqual([]);
    });
  });

  describe('full lifecycle', () => {
    it('supports create -> dispatch -> accept -> beginExecution -> complete -> verify', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());

      const dispatched = factory.dispatch(sessionId, 'test-agent');
      expect(dispatched.state).toBe(AgentState.Dispatched);
      expect(dispatched.transitions).toHaveLength(1);

      const accepted = factory.accept(sessionId, 'test-agent');
      expect(accepted.state).toBe(AgentState.Accepted);

      const executing = factory.beginExecution(sessionId, 'test-agent');
      expect(executing.state).toBe(AgentState.Executing);

      const result: AgentResult = {
        agentName: 'test-agent',
        deliverables: ['report.md'],
        evidence: [],
        metadata: {},
      };
      const completed = factory.complete(sessionId, 'test-agent', result);
      expect(completed.state).toBe(AgentState.Completed);
      expect(completed.result).toBeDefined();

      const verified = factory.verify(sessionId, 'test-agent');
      expect(verified.state).toBe(AgentState.Verified);
      expect(verified.transitions).toHaveLength(5);
    });
  });

  describe('reject', () => {
    it('rejects with valid rejection response', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      factory.dispatch(sessionId, 'test-agent');
      const rejected = factory.reject(sessionId, 'test-agent', { reason: 'missing_access' });
      expect(rejected.state).toBe(AgentState.Rejected);
      expect(rejected.rejectionReason).toBeDefined();
      expect(rejected.rejectionReason!.reason).toBe('missing_access');
    });

    it('throws for invalid rejection response', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      factory.dispatch(sessionId, 'test-agent');
      expect(() => factory.reject(sessionId, 'test-agent', { reason: 'bogus' as 'other' }))
        .toThrow(TaskEnvelopeValidationError);
    });
  });

  describe('fail', () => {
    it('transitions to Failed with reason in event', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      factory.dispatch(sessionId, 'test-agent');
      factory.accept(sessionId, 'test-agent');
      factory.beginExecution(sessionId, 'test-agent');
      const failed = factory.fail(sessionId, 'test-agent', 'timeout');
      expect(failed.state).toBe(AgentState.Failed);
      expect(failed.transitions.at(-1)!.event).toContain('timeout');
    });
  });

  describe('revision cycle', () => {
    it('supports requestRevision -> resumeExecution', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      factory.dispatch(sessionId, 'test-agent');
      factory.accept(sessionId, 'test-agent');
      factory.beginExecution(sessionId, 'test-agent');
      factory.complete(sessionId, 'test-agent', {
        agentName: 'test-agent', deliverables: [], evidence: [], metadata: {},
      });
      const revised = factory.requestRevision(sessionId, 'test-agent', 'needs more detail');
      expect(revised.state).toBe(AgentState.RevisionRequested);

      const resumed = factory.resumeExecution(sessionId, 'test-agent');
      expect(resumed.state).toBe(AgentState.Executing);
    });
  });

  describe('invalid transition', () => {
    it('throws AgentLifecycleError for invalid state change', () => {
      const sessionId = factory.createSession();
      factory.create(sessionId, makeEnvelope());
      expect(() => factory.accept(sessionId, 'test-agent')).toThrow(AgentLifecycleError);
    });
  });

  describe('missing agent', () => {
    it('throws for unknown agent name', () => {
      const sessionId = factory.createSession();
      expect(() => factory.dispatch(sessionId, 'unknown')).toThrow('not found');
    });
  });
});
