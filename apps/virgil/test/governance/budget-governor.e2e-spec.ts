import { CapabilityTier } from '../../src/governance/capability-tier.js';
import { BudgetGovernor } from '../../src/governance/budget-governor.service.js';
import type { BudgetPolicy } from '../../src/governance/budget-policy.schema.js';

function makePolicy(overrides?: Partial<BudgetPolicy>): BudgetPolicy {
  return {
    workerTokenLimit: 10_000,
    reasoningTokenLimit: 50_000,
    proTokenLimit: 100_000,
    sessionTokenCeiling: 200_000,
    warningThresholdPercent: 80,
    ...overrides,
  };
}

describe('BudgetGovernor', () => {
  let governor: BudgetGovernor;

  beforeEach(() => {
    governor = new BudgetGovernor();
  });

  describe('without policy', () => {
    it('returns within_budget when no policy is configured', () => {
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status).toEqual({ status: 'within_budget' });
    });

    it('returns Infinity for remaining budget without policy', () => {
      expect(governor.remainingBudget(CapabilityTier.Worker)).toBe(Infinity);
    });
  });

  describe('with policy', () => {
    beforeEach(() => {
      governor.configure(makePolicy());
    });

    it('returns within_budget before any consumption', () => {
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status).toEqual({ status: 'within_budget' });
    });

    it('tracks cumulative consumption', () => {
      governor.recordConsumption(3_000, 1_000);
      governor.recordConsumption(2_000, 500);
      const remaining = governor.remainingBudget(CapabilityTier.Worker);
      expect(remaining).toBe(10_000 - 6_500);
    });

    it('returns warning when threshold is crossed', () => {
      governor.recordConsumption(4_000, 4_500);
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status.status).toBe('warning');
      if (status.status === 'warning') {
        expect(status.percentUsed).toBeGreaterThanOrEqual(80);
      }
    });

    it('returns exceeded when limit is passed', () => {
      governor.recordConsumption(6_000, 5_000);
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status.status).toBe('exceeded');
      if (status.status === 'exceeded') {
        expect(status.overBy).toBe(1_000);
      }
    });

    it('returns remaining budget per tier', () => {
      governor.recordConsumption(5_000, 0);
      expect(governor.remainingBudget(CapabilityTier.Worker)).toBe(5_000);
      expect(governor.remainingBudget(CapabilityTier.Reasoning)).toBe(45_000);
      expect(governor.remainingBudget(CapabilityTier.Pro)).toBe(95_000);
    });

    it('returns zero remaining when exceeded', () => {
      governor.recordConsumption(50_000, 60_000);
      expect(governor.remainingBudget(CapabilityTier.Worker)).toBe(0);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      governor.configure(makePolicy());
    });

    it('emits budget:warning event on warning threshold', () => {
      const events: unknown[] = [];
      governor.on('budget:warning', (e) => events.push(e));

      governor.recordConsumption(4_000, 4_500);
      governor.checkBudget(CapabilityTier.Worker);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'budget:warning',
        tier: CapabilityTier.Worker,
      });
    });

    it('emits budget:exceeded event when limit is passed', () => {
      const events: unknown[] = [];
      governor.on('budget:exceeded', (e) => events.push(e));

      governor.recordConsumption(6_000, 5_000);
      governor.checkBudget(CapabilityTier.Worker);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'budget:exceeded',
        tier: CapabilityTier.Worker,
      });
    });

    it('emits each event type at most once per tier', () => {
      const warnings: unknown[] = [];
      governor.on('budget:warning', (e) => warnings.push(e));

      governor.recordConsumption(4_000, 4_500);
      governor.checkBudget(CapabilityTier.Worker);
      governor.checkBudget(CapabilityTier.Worker);

      expect(warnings).toHaveLength(1);
    });

    it('does not emit warning when already exceeded', () => {
      const warnings: unknown[] = [];
      const exceeded: unknown[] = [];
      governor.on('budget:warning', (e) => warnings.push(e));
      governor.on('budget:exceeded', (e) => exceeded.push(e));

      governor.recordConsumption(6_000, 5_000);
      governor.checkBudget(CapabilityTier.Worker);

      expect(warnings).toHaveLength(0);
      expect(exceeded).toHaveLength(1);
    });
  });
});
