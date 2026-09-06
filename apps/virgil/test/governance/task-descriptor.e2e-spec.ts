import {
  TaskDescriptorSchema,
  COMPLEXITY_SIGNALS,
} from '../../src/governance/task-descriptor.schema.js';

describe('TaskDescriptorSchema', () => {
  const validDescriptor = {
    taskType: 'search',
    estimatedTokenWeight: 500,
    complexitySignal: 'mechanical' as const,
    isMechanical: true,
  };

  it('accepts a valid task descriptor', () => {
    const result = TaskDescriptorSchema.safeParse(validDescriptor);
    expect(result.success).toBe(true);
  });

  it('rejects empty taskType', () => {
    const result = TaskDescriptorSchema.safeParse({
      ...validDescriptor,
      taskType: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative estimatedTokenWeight', () => {
    const result = TaskDescriptorSchema.safeParse({
      ...validDescriptor,
      estimatedTokenWeight: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts zero estimatedTokenWeight', () => {
    const result = TaskDescriptorSchema.safeParse({
      ...validDescriptor,
      estimatedTokenWeight: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid complexitySignal', () => {
    const result = TaskDescriptorSchema.safeParse({
      ...validDescriptor,
      complexitySignal: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid complexity signals', () => {
    for (const signal of COMPLEXITY_SIGNALS) {
      const result = TaskDescriptorSchema.safeParse({
        ...validDescriptor,
        complexitySignal: signal,
      });
      expect(result.success).toBe(true);
    }
  });

  it('exports exactly six complexity signals', () => {
    expect(COMPLEXITY_SIGNALS).toHaveLength(6);
    expect(COMPLEXITY_SIGNALS).toEqual([
      'mechanical',
      'synthesis',
      'review',
      'architecture',
      'search',
      'extraction',
    ]);
  });
});
