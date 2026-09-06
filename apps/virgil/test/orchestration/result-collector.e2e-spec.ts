import { ResultCollectorService } from '../../src/orchestration/result-collector.service.js';
import { AgentState } from '../../src/orchestration/agent-lifecycle.js';
import type { AgentInstance, AgentResult } from '../../src/orchestration/agent-instance.js';
import type { TaskEnvelope } from '../../src/orchestration/task-envelope.schema.js';
import { TaskEnvelopeSchema } from '../../src/orchestration/task-envelope.schema.js';
import { createTimestamp, createUlid } from '../../src/shared/primitives.js';

function makeEnvelope(overrides: Record<string, unknown> = {}): TaskEnvelope {
  return TaskEnvelopeSchema.parse({
    name: 'test-agent',
    role: 'analysis',
    objective: 'Test objective',
    scope: ['scope-1'],
    deliverables: ['report.md'],
    acceptanceCriteria: ['Must produce report'],
    tier: 'worker' as const,
    evidenceRequired: ['coverage.json'],
    ...overrides,
  });
}

function makeAgent(state: AgentState, envelope?: TaskEnvelope, result?: AgentResult): AgentInstance {
  return {
    id: createUlid(),
    sessionId: createUlid(),
    envelope: envelope ?? makeEnvelope(),
    state,
    transitions: [],
    createdAt: createTimestamp(),
    result,
  };
}

describe('ResultCollectorService', () => {
  let service: ResultCollectorService;

  beforeEach(() => {
    service = new ResultCollectorService();
  });

  describe('validateResult', () => {
    it('returns valid when all deliverables and evidence present', () => {
      const envelope = makeEnvelope();
      const result: AgentResult = {
        agentName: 'test-agent',
        deliverables: ['report.md'],
        evidence: ['coverage.json'],
        metadata: {},
      };
      const validation = service.validateResult(envelope, result);
      expect(validation.valid).toBe(true);
      expect(validation.missingDeliverables).toEqual([]);
      expect(validation.missingEvidence).toEqual([]);
    });

    it('reports missing deliverables', () => {
      const envelope = makeEnvelope();
      const result: AgentResult = {
        agentName: 'test-agent',
        deliverables: [],
        evidence: ['coverage.json'],
        metadata: {},
      };
      const validation = service.validateResult(envelope, result);
      expect(validation.valid).toBe(false);
      expect(validation.missingDeliverables).toEqual(['report.md']);
    });

    it('reports missing evidence', () => {
      const envelope = makeEnvelope();
      const result: AgentResult = {
        agentName: 'test-agent',
        deliverables: ['report.md'],
        evidence: [],
        metadata: {},
      };
      const validation = service.validateResult(envelope, result);
      expect(validation.valid).toBe(false);
      expect(validation.missingEvidence).toEqual(['coverage.json']);
    });
  });

  describe('collectResults', () => {
    it('calculates correct counts for mixed agent states', () => {
      const sessionId = createUlid();
      const completedResult: AgentResult = {
        agentName: 'completed-agent',
        deliverables: ['report.md'],
        evidence: ['coverage.json'],
        metadata: {},
      };
      const agents: AgentInstance[] = [
        makeAgent(AgentState.Verified, makeEnvelope({ name: 'verified-agent' }), completedResult),
        makeAgent(AgentState.Rejected, makeEnvelope({ name: 'rejected-agent' })),
        makeAgent(AgentState.Failed, makeEnvelope({ name: 'failed-agent' })),
        makeAgent(AgentState.Executing, makeEnvelope({ name: 'executing-agent' })),
        makeAgent(AgentState.Created, makeEnvelope({ name: 'created-agent' })),
      ];

      const report = service.collectResults(sessionId, agents);
      expect(report.sessionId).toBe(sessionId);
      expect(report.totalDispatched).toBe(4); // all except Created
      expect(report.accepted).toBe(3); // Verified, Failed, Executing
      expect(report.rejected).toBe(1);
      expect(report.completed).toBe(1); // Verified counts as completed
      expect(report.failed).toBe(1);
      expect(report.verified).toBe(1);
      expect(report.agents).toHaveLength(5);
    });

    it('lists unresolved items for failed agents', () => {
      const sessionId = createUlid();
      const agents: AgentInstance[] = [
        makeAgent(AgentState.Failed, makeEnvelope({ name: 'broken-agent' })),
      ];
      const report = service.collectResults(sessionId, agents);
      expect(report.unresolved).toContain('Agent "broken-agent" failed');
    });

    it('lists unresolved items for incomplete results', () => {
      const sessionId = createUlid();
      const incompleteResult: AgentResult = {
        agentName: 'half-done',
        deliverables: [],
        evidence: [],
        metadata: {},
      };
      const agents: AgentInstance[] = [
        makeAgent(AgentState.Completed, makeEnvelope({ name: 'half-done' }), incompleteResult),
      ];
      const report = service.collectResults(sessionId, agents);
      expect(report.unresolved.some((u) => u.includes('missing deliverable'))).toBe(true);
      expect(report.unresolved.some((u) => u.includes('missing evidence'))).toBe(true);
    });
  });
});
