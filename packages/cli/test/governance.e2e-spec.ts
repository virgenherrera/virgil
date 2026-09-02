import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'node:events';
import {
  GovernanceModule,
  CapabilityTier,
  TaskDescriptorSchema,
  TIER_RESOLVER,
  AUDIT_TRAIL_STORE,
  HarnessRegistry,
  BudgetGovernor,
  EscalationGate,
  StubHarnessAdapter,
} from '../src/governance/index.js';
import type {
  TierResolver,
  AuditTrailStore,
  TaskDescriptor,
  BudgetStatus,
  EscalationRequest,
  EscalationDecision,
} from '../src/governance/index.js';

/** Helper to build a valid TaskDescriptor. */
function descriptor(
  overrides: Partial<TaskDescriptor> = {},
): TaskDescriptor {
  return {
    taskType: 'code-generation',
    estimatedTokenWeight: 1000,
    complexitySignal: 'mechanical',
    isMechanical: true,
    ...overrides,
  };
}

describe('Governance — Agent Execution Governance (H11)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [GovernanceModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // -----------------------------------------------------------------------
  // D7 — DI wiring
  // -----------------------------------------------------------------------

  describe('DI wiring (D7)', () => {
    it('compiles GovernanceModule and resolves all services', () => {
      expect(moduleRef.get(TIER_RESOLVER)).toBeDefined();
      expect(moduleRef.get(HarnessRegistry)).toBeDefined();
      expect(moduleRef.get(BudgetGovernor)).toBeDefined();
      expect(moduleRef.get(EscalationGate)).toBeDefined();
      expect(moduleRef.get(AUDIT_TRAIL_STORE)).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // D1 — TaskDescriptor Schema
  // -----------------------------------------------------------------------

  describe('TaskDescriptor Schema (D1)', () => {
    it('accepts a valid TaskDescriptor', () => {
      const result = TaskDescriptorSchema.safeParse(descriptor());
      expect(result.success).toBe(true);
    });

    it('accepts all complexity signals', () => {
      const signals = [
        'mechanical',
        'synthesis',
        'review',
        'architecture',
        'search',
        'extraction',
      ] as const;
      for (const signal of signals) {
        const result = TaskDescriptorSchema.safeParse(
          descriptor({ complexitySignal: signal }),
        );
        expect(result.success).toBe(true);
      }
    });

    it('rejects a TaskDescriptor with missing fields', () => {
      const result = TaskDescriptorSchema.safeParse({ taskType: 'x' });
      expect(result.success).toBe(false);
    });

    it('rejects a TaskDescriptor with invalid complexitySignal', () => {
      const result = TaskDescriptorSchema.safeParse(
        descriptor({ complexitySignal: 'turbo' as any }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects a negative estimatedTokenWeight', () => {
      const result = TaskDescriptorSchema.safeParse(
        descriptor({ estimatedTokenWeight: -1 }),
      );
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // D2 — TierResolver
  // -----------------------------------------------------------------------

  describe('Tier Resolver (D2)', () => {
    let resolver: TierResolver;

    beforeEach(() => {
      resolver = moduleRef.get<TierResolver>(TIER_RESOLVER);
    });

    it('resolves mechanical → worker', () => {
      expect(resolver.resolve(descriptor({ complexitySignal: 'mechanical' }))).toBe(
        CapabilityTier.Worker,
      );
    });

    it('resolves search → worker', () => {
      expect(resolver.resolve(descriptor({ complexitySignal: 'search' }))).toBe(
        CapabilityTier.Worker,
      );
    });

    it('resolves extraction → worker', () => {
      expect(resolver.resolve(descriptor({ complexitySignal: 'extraction' }))).toBe(
        CapabilityTier.Worker,
      );
    });

    it('resolves architecture → reasoning', () => {
      expect(
        resolver.resolve(descriptor({ complexitySignal: 'architecture' })),
      ).toBe(CapabilityTier.Reasoning);
    });

    it('resolves synthesis → reasoning', () => {
      expect(resolver.resolve(descriptor({ complexitySignal: 'synthesis' }))).toBe(
        CapabilityTier.Reasoning,
      );
    });

    it('resolves review → reasoning', () => {
      expect(resolver.resolve(descriptor({ complexitySignal: 'review' }))).toBe(
        CapabilityTier.Reasoning,
      );
    });

    it('NEVER returns pro tier', () => {
      const signals = [
        'mechanical',
        'synthesis',
        'review',
        'architecture',
        'search',
        'extraction',
      ] as const;
      for (const signal of signals) {
        const tier = resolver.resolve(descriptor({ complexitySignal: signal }));
        expect(tier).not.toBe(CapabilityTier.Pro);
      }
    });
  });

  // -----------------------------------------------------------------------
  // D3 — Harness Registry
  // -----------------------------------------------------------------------

  describe('Harness Registry (D3)', () => {
    let registry: HarnessRegistry;

    beforeEach(() => {
      registry = moduleRef.get(HarnessRegistry);
    });

    it('returns adapter for a registered tier', () => {
      const stub = new StubHarnessAdapter();
      registry.register(CapabilityTier.Worker, stub);
      expect(registry.resolve(CapabilityTier.Worker)).toBe(stub);
    });

    it('throws typed error for missing adapter', () => {
      expect(() => registry.resolve(CapabilityTier.Pro)).toThrow();
      try {
        registry.resolve(CapabilityTier.Pro);
      } catch (e: any) {
        expect(e.name).toBe('AdapterNotFoundError');
        expect(e.tier).toBe(CapabilityTier.Pro);
      }
    });

    it('StubHarnessAdapter supports all three tiers', () => {
      const stub = new StubHarnessAdapter();
      const tiers = stub.supportedTiers();
      expect(tiers).toContain(CapabilityTier.Worker);
      expect(tiers).toContain(CapabilityTier.Reasoning);
      expect(tiers).toContain(CapabilityTier.Pro);
    });

    it('StubHarnessAdapter execute returns a result', async () => {
      const stub = new StubHarnessAdapter();
      const result = await stub.execute(
        { taskId: 't1', payload: 'hello' },
        CapabilityTier.Worker,
      );
      expect(result).toBeDefined();
      expect(result.taskId).toBe('t1');
    });
  });

  // -----------------------------------------------------------------------
  // D4 — Budget Governor
  // -----------------------------------------------------------------------

  describe('Budget Governor (D4)', () => {
    let governor: BudgetGovernor;

    beforeEach(() => {
      governor = moduleRef.get(BudgetGovernor);
      // Configure with known limits for testing.
      governor.configure({
        workerTokenLimit: 1000,
        reasoningTokenLimit: 2000,
        proTokenLimit: 5000,
        sessionTokenCeiling: 10000,
        warningThresholdPercent: 80,
      });
    });

    it('starts within_budget', () => {
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status.status).toBe('within_budget');
    });

    it('transitions to warning at 80% threshold', () => {
      governor.recordConsumption(400, 400); // 800 of 1000
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status.status).toBe('warning');
      if (status.status === 'warning') {
        expect(status.percentUsed).toBe(80);
      }
    });

    it('transitions to exceeded when over limit', () => {
      governor.recordConsumption(600, 500); // 1100 of 1000
      const status = governor.checkBudget(CapabilityTier.Worker);
      expect(status.status).toBe('exceeded');
      if (status.status === 'exceeded') {
        expect(status.overBy).toBe(100);
      }
    });

    it('remainingBudget returns correct value', () => {
      governor.recordConsumption(300, 200); // 500 of 1000
      expect(governor.remainingBudget(CapabilityTier.Worker)).toBe(500);
    });

    it('emits structured events on threshold crossings', () => {
      const events: any[] = [];
      governor.on('budget:warning', (e: any) => events.push(e));
      governor.on('budget:exceeded', (e: any) => events.push(e));

      governor.recordConsumption(400, 400); // 800 → warning
      governor.checkBudget(CapabilityTier.Worker);

      governor.recordConsumption(200, 100); // 1100 → exceeded
      governor.checkBudget(CapabilityTier.Worker);

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe('budget:warning');
      expect(events[1].type).toBe('budget:exceeded');
    });
  });

  // -----------------------------------------------------------------------
  // D5 — Escalation Gates
  // -----------------------------------------------------------------------

  describe('Automatic Escalation (D5)', () => {
    let gate: EscalationGate;
    let governor: BudgetGovernor;

    beforeEach(() => {
      gate = moduleRef.get(EscalationGate);
      governor = moduleRef.get(BudgetGovernor);
      governor.configure({
        workerTokenLimit: 1000,
        reasoningTokenLimit: 2000,
        proTokenLimit: 5000,
        sessionTokenCeiling: 10000,
        warningThresholdPercent: 80,
      });
    });

    it('worker→reasoning triggers automatically on exceeded budget', async () => {
      governor.recordConsumption(600, 500); // exceed worker limit

      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        descriptor({ complexitySignal: 'synthesis' }),
      );

      expect(result.escalated).toBe(true);
      expect(result.targetTier).toBe(CapabilityTier.Reasoning);
    });

    it('worker→reasoning triggers automatically on complexity detection', async () => {
      // Budget is fine, but complexity signal warrants reasoning
      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        descriptor({ complexitySignal: 'architecture' }),
      );

      expect(result.escalated).toBe(true);
      expect(result.targetTier).toBe(CapabilityTier.Reasoning);
    });

    it('does not auto-escalate when budget and complexity are fine', async () => {
      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Worker,
        descriptor({ complexitySignal: 'mechanical' }),
      );

      expect(result.escalated).toBe(false);
    });
  });

  describe('Human-gated Escalation (D5)', () => {
    let gate: EscalationGate;

    beforeEach(() => {
      gate = moduleRef.get(EscalationGate);
    });

    it('creates EscalationRequest with required fields and blocks until decision', async () => {
      let capturedRequest: EscalationRequest | undefined;

      // Intercept the escalation request
      gate.onEscalationRequest((req: EscalationRequest) => {
        capturedRequest = req;
        // Simulate human approving after a tick
        setTimeout(() => gate.resolveEscalation(req.id, 'approved'), 10);
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        {
          whatUnresolved: 'Complex architectural decision',
          whyInsufficient: 'Reasoning tier cannot handle multi-step synthesis',
          expectedCapability: 'Full architectural analysis',
          valueJustification: 'Critical path decision',
        },
      );

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.whatUnresolved).toBe('Complex architectural decision');
      expect(capturedRequest!.whyInsufficient).toBe(
        'Reasoning tier cannot handle multi-step synthesis',
      );
      expect(capturedRequest!.expectedCapability).toBe(
        'Full architectural analysis',
      );
      expect(capturedRequest!.valueJustification).toBe(
        'Critical path decision',
      );
      expect(decision).toBe('approved');
    });

    it('denied decision returns reasoning (no pro activation)', async () => {
      gate.onEscalationRequest((req: EscalationRequest) => {
        setTimeout(() => gate.resolveEscalation(req.id, 'denied'), 10);
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        {
          whatUnresolved: 'Test',
          whyInsufficient: 'Test',
          expectedCapability: 'Test',
          valueJustification: 'Test',
        },
      );

      expect(decision).toBe('denied');
    });

    it('deferred decision is a valid outcome', async () => {
      gate.onEscalationRequest((req: EscalationRequest) => {
        setTimeout(() => gate.resolveEscalation(req.id, 'deferred'), 10);
      });

      const decision = await gate.requestHumanEscalation(
        CapabilityTier.Reasoning,
        CapabilityTier.Pro,
        {
          whatUnresolved: 'Test',
          whyInsufficient: 'Test',
          expectedCapability: 'Test',
          valueJustification: 'Test',
        },
      );

      expect(decision).toBe('deferred');
    });
  });

  // -----------------------------------------------------------------------
  // No-pro-bypass
  // -----------------------------------------------------------------------

  describe('No-pro-bypass', () => {
    let resolver: TierResolver;
    let gate: EscalationGate;

    beforeEach(() => {
      resolver = moduleRef.get<TierResolver>(TIER_RESOLVER);
      gate = moduleRef.get(EscalationGate);
    });

    it('TierResolver never returns pro', () => {
      const signals = [
        'mechanical',
        'synthesis',
        'review',
        'architecture',
        'search',
        'extraction',
      ] as const;
      for (const signal of signals) {
        expect(resolver.resolve(descriptor({ complexitySignal: signal }))).not.toBe(
          CapabilityTier.Pro,
        );
      }
    });

    it('automatic escalation never reaches pro', async () => {
      const governor = moduleRef.get(BudgetGovernor);
      governor.configure({
        workerTokenLimit: 100,
        reasoningTokenLimit: 100,
        proTokenLimit: 5000,
        sessionTokenCeiling: 10000,
        warningThresholdPercent: 80,
      });
      governor.recordConsumption(500, 500); // Exceed both worker and reasoning

      // Even with exceeded budget, auto-escalation from reasoning does NOT go to pro
      const result = await gate.evaluateAutomaticEscalation(
        CapabilityTier.Reasoning,
        descriptor({ complexitySignal: 'architecture' }),
      );

      expect(result.escalated).toBe(false); // Cannot auto-escalate to pro
    });
  });

  // -----------------------------------------------------------------------
  // D6 — Audit Trail
  // -----------------------------------------------------------------------

  describe('Audit Trail (D6)', () => {
    let auditStore: AuditTrailStore;

    beforeEach(() => {
      auditStore = moduleRef.get<AuditTrailStore>(AUDIT_TRAIL_STORE);
    });

    it('records escalation events with correct fields', async () => {
      await auditStore.record({
        id: 'esc-1',
        timestamp: Date.now(),
        taskId: 'task-42',
        sourceTier: CapabilityTier.Worker,
        targetTier: CapabilityTier.Reasoning,
        triggerType: 'automatic',
        justification: 'Budget exceeded for worker tier',
        approvalStatus: 'approved',
        approvedBy: null,
      });

      const results = await auditStore.queryByTaskId('task-42');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('esc-1');
      expect(results[0].sourceTier).toBe(CapabilityTier.Worker);
      expect(results[0].targetTier).toBe(CapabilityTier.Reasoning);
      expect(results[0].triggerType).toBe('automatic');
      expect(results[0].approvalStatus).toBe('approved');
      expect(results[0].approvedBy).toBeNull();
    });

    it('records human-gated escalation with approvedBy', async () => {
      await auditStore.record({
        id: 'esc-2',
        timestamp: Date.now(),
        taskId: 'task-43',
        sourceTier: CapabilityTier.Reasoning,
        targetTier: CapabilityTier.Pro,
        triggerType: 'human-gated',
        justification: 'Architecture decision requires pro analysis',
        approvalStatus: 'approved',
        approvedBy: 'human-operator',
      });

      const results = await auditStore.queryByTaskId('task-43');
      expect(results).toHaveLength(1);
      expect(results[0].approvedBy).toBe('human-operator');
      expect(results[0].triggerType).toBe('human-gated');
    });

    it('queries by time range', async () => {
      const now = Date.now();
      await auditStore.record({
        id: 'esc-a',
        timestamp: now - 5000,
        taskId: 'task-a',
        sourceTier: CapabilityTier.Worker,
        targetTier: CapabilityTier.Reasoning,
        triggerType: 'automatic',
        justification: 'Earlier event',
        approvalStatus: 'approved',
        approvedBy: null,
      });
      await auditStore.record({
        id: 'esc-b',
        timestamp: now,
        taskId: 'task-b',
        sourceTier: CapabilityTier.Reasoning,
        targetTier: CapabilityTier.Pro,
        triggerType: 'human-gated',
        justification: 'Later event',
        approvalStatus: 'denied',
        approvedBy: null,
      });

      const inRange = await auditStore.queryByTimeRange(now - 6000, now - 1000);
      expect(inRange).toHaveLength(1);
      expect(inRange[0].id).toBe('esc-a');

      const allRange = await auditStore.queryByTimeRange(now - 6000, now + 1000);
      expect(allRange).toHaveLength(2);
    });

    it('returns empty array for no matches', async () => {
      const results = await auditStore.queryByTaskId('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});
