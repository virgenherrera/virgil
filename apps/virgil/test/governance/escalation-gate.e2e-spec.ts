import { CapabilityTier } from '../../src/governance/capability-tier.js';
import { BudgetGovernor } from '../../src/governance/budget-governor.service.js';
import { EscalationGate } from '../../src/governance/escalation-gate.service.js';
import type { TaskDescriptor } from '../../src/governance/task-descriptor.schema.js';
import type { EscalationRequestFields } from '../../src/governance/escalation.types.js';

function makeDescriptor(
  signal: TaskDescriptor['complexitySignal'],
): TaskDescriptor {
  return {
    taskType: 'test',
    estimatedTokenWeight: 100,
    complexitySignal: signal,
    isMechanical: signal === 'mechanical',
  };
}

describe('EscalationGate', () => {
  let gate: EscalationGate;
  let budgetGovernor: BudgetGovernor;

  beforeEach(() => {
    budgetGovernor = new BudgetGovernor();
    gate = new EscalationGate(budgetGovernor);
  });

  describe('automatic escalation (worker -> reasoning)', () => {
    it('does not escalate worker with mechanical signal and budget available', async () => {
      budgetGovernor.configure({
        workerTokenLimit: 10_000,
        reasoningTokenLimit: 50_000,
        proTokenLimit: 100_000,
        sessionTokenCeiling: 200_000,
        warningThresholdPercent: 80,
      });

      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        makeDescriptor('mechanical'),
      );
      expect(result.escalated).toBe(false);
    });

    it('escalates worker when budget is exceeded', async () => {
      budgetGovernor.configure({
        workerTokenLimit: 100,
        reasoningTokenLimit: 50_000,
        proTokenLimit: 100_000,
        sessionTokenCeiling: 200_000,
        warningThresholdPercent: 80,
      });
      budgetGovernor.recordConsumption(200, 0);

      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        makeDescriptor('mechanical'),
      );
      expect(result).toMatchObject({
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
      });
    });

    it('escalates worker when complexity signal requires reasoning', async () => {
      budgetGovernor.configure({
        workerTokenLimit: 10_000,
        reasoningTokenLimit: 50_000,
        proTokenLimit: 100_000,
        sessionTokenCeiling: 200_000,
        warningThresholdPercent: 80,
      });

      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        makeDescriptor('architecture'),
      );
      expect(result).toMatchObject({
        escalated: true,
        targetTier: CapabilityTier.Reasoning,
      });
    });

    it('does not auto-escalate from reasoning tier', async () => {
      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Reasoning,
        makeDescriptor('architecture'),
      );
      expect(result.escalated).toBe(false);
    });

    it('does not auto-escalate from pro tier', async () => {
      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Pro,
        makeDescriptor('architecture'),
      );
      expect(result.escalated).toBe(false);
    });
  });

  describe('human-gated escalation (reasoning -> pro)', () => {
    it('creates a pending request and resolves on human decision', async () => {
      const fields: EscalationRequestFields = {
        whatUnresolved: 'complex architecture review',
        whyInsufficient: 'reasoning tier lacks context window',
        expectedCapability: 'pro-level analysis',
        valueJustification: 'critical path decision',
      };

      gate.onEscalationRequest((req) => {
        gate.resolveEscalation(req.id, 'approved');
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        fields,
      );
      expect(decision).toBe('approved');
    });

    it('can deny an escalation request', async () => {
      const fields: EscalationRequestFields = {
        whatUnresolved: 'test',
        whyInsufficient: 'test',
        expectedCapability: 'test',
        valueJustification: 'test',
      };

      gate.onEscalationRequest((req) => {
        gate.resolveEscalation(req.id, 'denied');
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        fields,
      );
      expect(decision).toBe('denied');
    });

    it('can defer an escalation request', async () => {
      const fields: EscalationRequestFields = {
        whatUnresolved: 'test',
        whyInsufficient: 'test',
        expectedCapability: 'test',
        valueJustification: 'test',
      };

      gate.onEscalationRequest((req) => {
        gate.resolveEscalation(req.id, 'deferred');
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        fields,
      );
      expect(decision).toBe('deferred');
    });

    it('notifies the handler with the escalation request', async () => {
      const captured: unknown[] = [];
      const fields: EscalationRequestFields = {
        whatUnresolved: 'review',
        whyInsufficient: 'cannot handle',
        expectedCapability: 'full analysis',
        valueJustification: 'important',
      };

      gate.onEscalationRequest((req) => {
        captured.push(req);
        gate.resolveEscalation(req.id, 'approved');
      });

      await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        fields,
      );

      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({
        sourceTier: CapabilityTier.Reasoning,
        targetTier: CapabilityTier.Pro,
        whatUnresolved: 'review',
      });
    });

    it('resolving a non-existent request is a no-op', () => {
      expect(() =>
        gate.resolveEscalation('non-existent', 'approved'),
      ).not.toThrow();
    });
  });
});
