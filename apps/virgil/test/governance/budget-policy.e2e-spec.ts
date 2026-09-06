import { BudgetPolicySchema } from '../../src/governance/budget-policy.schema.js';

describe('BudgetPolicySchema', () => {
  const validPolicy = {
    workerTokenLimit: 10_000,
    reasoningTokenLimit: 50_000,
    proTokenLimit: 100_000,
    sessionTokenCeiling: 200_000,
    warningThresholdPercent: 80,
  };

  it('accepts a valid policy', () => {
    const result = BudgetPolicySchema.safeParse(validPolicy);
    expect(result.success).toBe(true);
  });

  it('defaults warningThresholdPercent to 80', () => {
    const { warningThresholdPercent: _, ...withoutWarning } = validPolicy;
    const result = BudgetPolicySchema.parse(withoutWarning);
    expect(result.warningThresholdPercent).toBe(80);
  });

  it('rejects non-positive workerTokenLimit', () => {
    const result = BudgetPolicySchema.safeParse({
      ...validPolicy,
      workerTokenLimit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects warningThresholdPercent above 100', () => {
    const result = BudgetPolicySchema.safeParse({
      ...validPolicy,
      warningThresholdPercent: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects warningThresholdPercent below 1', () => {
    const result = BudgetPolicySchema.safeParse({
      ...validPolicy,
      warningThresholdPercent: 0,
    });
    expect(result.success).toBe(false);
  });
});
