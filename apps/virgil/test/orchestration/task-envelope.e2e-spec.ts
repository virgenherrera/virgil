import { TaskEnvelopeSchema } from '../../src/orchestration/task-envelope.schema.js';
import type { TaskEnvelopeInput } from '../../src/orchestration/task-envelope.schema.js';

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

describe('TaskEnvelopeSchema', () => {
  it('accepts a valid minimal envelope', () => {
    const result = TaskEnvelopeSchema.safeParse(makeEnvelope());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test-agent');
      expect(result.data.role).toBe('analysis');
      expect(result.data.tier).toBe('worker');
    }
  });

  it('accepts a valid full envelope with all fields', () => {
    const full = makeEnvelope({
      persona: 'Senior analyst',
      outOfScope: ['out-1'],
      inputs: [{ type: 'file', ref: 'data.json', description: 'Input data' }],
      evidenceRequired: ['coverage-report'],
      constraints: ['no-network'],
      dependencies: ['dep-task'],
    });
    const result = TaskEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.persona).toBe('Senior analyst');
      expect(result.data.outOfScope).toEqual(['out-1']);
      expect(result.data.inputs).toHaveLength(1);
      expect(result.data.evidenceRequired).toEqual(['coverage-report']);
      expect(result.data.constraints).toEqual(['no-network']);
      expect(result.data.dependencies).toEqual(['dep-task']);
    }
  });

  it('rejects missing required fields', () => {
    const result = TaskEnvelopeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = TaskEnvelopeSchema.safeParse(makeEnvelope({ name: '' }));
    expect(result.success).toBe(false);
  });

  it('applies defaults for optional array fields', () => {
    const result = TaskEnvelopeSchema.safeParse(makeEnvelope());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outOfScope).toEqual([]);
      expect(result.data.inputs).toEqual([]);
      expect(result.data.evidenceRequired).toEqual([]);
      expect(result.data.constraints).toEqual([]);
      expect(result.data.dependencies).toEqual([]);
    }
  });

  it('rejects extra fields in strict mode', () => {
    const result = TaskEnvelopeSchema.safeParse(
      makeEnvelope({ unknownField: 'oops' } as Record<string, unknown>),
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid tier values', () => {
    const result = TaskEnvelopeSchema.safeParse(makeEnvelope({ tier: 'ultra' as 'worker' }));
    expect(result.success).toBe(false);
  });
});
