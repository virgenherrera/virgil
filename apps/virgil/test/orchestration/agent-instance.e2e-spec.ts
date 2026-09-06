import { RejectionResponseSchema, AgentResultSchema } from '../../src/orchestration/agent-instance.js';

describe('RejectionResponseSchema', () => {
  it('accepts valid rejection with reason only', () => {
    const result = RejectionResponseSchema.safeParse({ reason: 'missing_access' });
    expect(result.success).toBe(true);
  });

  it('accepts valid rejection with reason and explanation', () => {
    const result = RejectionResponseSchema.safeParse({
      reason: 'conflicting_constraints',
      explanation: 'Cannot satisfy both requirements',
    });
    expect(result.success).toBe(true);
  });

  it('requires explanation when reason is other', () => {
    const result = RejectionResponseSchema.safeParse({ reason: 'other' });
    expect(result.success).toBe(false);
  });

  it('accepts other with explanation', () => {
    const result = RejectionResponseSchema.safeParse({
      reason: 'other',
      explanation: 'Custom reason',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid reason', () => {
    const result = RejectionResponseSchema.safeParse({ reason: 'invalid_reason' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = RejectionResponseSchema.safeParse({
      reason: 'missing_access',
      extra: 'field',
    });
    expect(result.success).toBe(false);
  });
});

describe('AgentResultSchema', () => {
  it('accepts valid result', () => {
    const result = AgentResultSchema.safeParse({
      agentName: 'test-agent',
      deliverables: ['report.md'],
      evidence: ['coverage.json'],
      metadata: { duration: 120 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing agentName', () => {
    const result = AgentResultSchema.safeParse({
      deliverables: ['report.md'],
      evidence: [],
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing deliverables', () => {
    const result = AgentResultSchema.safeParse({
      agentName: 'test-agent',
      evidence: [],
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty arrays and metadata', () => {
    const result = AgentResultSchema.safeParse({
      agentName: 'test-agent',
      deliverables: [],
      evidence: [],
      metadata: {},
    });
    expect(result.success).toBe(true);
  });
});
