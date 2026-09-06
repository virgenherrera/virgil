import { CapabilityTier } from '../../src/governance/capability-tier.js';
import { InMemoryAuditTrail } from '../../src/governance/in-memory-audit-trail.js';
import type { EscalationRecord } from '../../src/governance/audit-trail.port.js';

function makeRecord(overrides?: Partial<EscalationRecord>): EscalationRecord {
  return {
    id: 'rec-1',
    timestamp: 1000,
    taskId: 'task-1',
    sourceTier: CapabilityTier.Worker,
    targetTier: CapabilityTier.Reasoning,
    triggerType: 'automatic',
    justification: 'budget exceeded',
    approvalStatus: 'approved',
    approvedBy: null,
    ...overrides,
  };
}

describe('InMemoryAuditTrail', () => {
  let trail: InMemoryAuditTrail;

  beforeEach(() => {
    trail = new InMemoryAuditTrail();
  });

  it('records and queries by taskId', async () => {
    await trail.record(makeRecord({ taskId: 'task-a' }));
    await trail.record(makeRecord({ id: 'rec-2', taskId: 'task-b' }));
    await trail.record(
      makeRecord({ id: 'rec-3', taskId: 'task-a', timestamp: 2000 }),
    );

    const results = await trail.queryByTaskId('task-a');
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.taskId === 'task-a')).toBe(true);
  });

  it('returns empty array for unknown taskId', async () => {
    const results = await trail.queryByTaskId('unknown');
    expect(results).toEqual([]);
  });

  it('queries by time range (inclusive)', async () => {
    await trail.record(makeRecord({ id: 'r1', timestamp: 100 }));
    await trail.record(makeRecord({ id: 'r2', timestamp: 200 }));
    await trail.record(makeRecord({ id: 'r3', timestamp: 300 }));
    await trail.record(makeRecord({ id: 'r4', timestamp: 400 }));

    const results = await trail.queryByTimeRange(200, 300);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('returns empty array for time range with no matches', async () => {
    await trail.record(makeRecord({ timestamp: 100 }));
    const results = await trail.queryByTimeRange(200, 300);
    expect(results).toEqual([]);
  });

  it('records all escalation record fields', async () => {
    const record = makeRecord({
      id: 'full-rec',
      triggerType: 'human-gated',
      approvalStatus: 'pending',
      approvedBy: 'user@example.com',
    });
    await trail.record(record);

    const results = await trail.queryByTaskId('task-1');
    expect(results[0]).toEqual(record);
  });
});
