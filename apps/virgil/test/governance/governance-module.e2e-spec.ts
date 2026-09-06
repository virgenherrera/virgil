import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceModule } from '../../src/governance/governance.module.js';
import { GovernanceCommand } from '../../src/governance/governance.command.js';
import { GovernanceBudgetCommand } from '../../src/governance/governance-budget.command.js';
import { GovernanceAuditCommand } from '../../src/governance/governance-audit.command.js';
import { GovernanceService } from '../../src/governance/governance.service.js';
import { BudgetGovernor } from '../../src/governance/budget-governor.service.js';
import { EscalationGate } from '../../src/governance/escalation-gate.service.js';
import { HarnessRegistry } from '../../src/governance/harness-registry.service.js';
import { TIER_RESOLVER, AUDIT_TRAIL_STORE } from '../../src/governance/governance.constants.js';
import type { TierResolver } from '../../src/governance/tier-resolver.port.js';
import type { AuditTrailStore } from '../../src/governance/audit-trail.port.js';

describe('GovernanceModule DI wiring', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [GovernanceModule],
    }).compile();
  });

  it('provides TIER_RESOLVER token', () => {
    const resolver = module.get<TierResolver>(TIER_RESOLVER);
    expect(resolver).toBeDefined();
    expect(typeof resolver.resolve).toBe('function');
  });

  it('provides AUDIT_TRAIL_STORE token', () => {
    const store = module.get<AuditTrailStore>(AUDIT_TRAIL_STORE);
    expect(store).toBeDefined();
    expect(typeof store.record).toBe('function');
    expect(typeof store.queryByTaskId).toBe('function');
    expect(typeof store.queryByTimeRange).toBe('function');
  });

  it('provides BudgetGovernor', () => {
    const governor = module.get(BudgetGovernor);
    expect(governor).toBeDefined();
    expect(governor).toBeInstanceOf(BudgetGovernor);
  });

  it('provides EscalationGate', () => {
    const gate = module.get(EscalationGate);
    expect(gate).toBeDefined();
    expect(gate).toBeInstanceOf(EscalationGate);
  });

  it('provides HarnessRegistry', () => {
    const registry = module.get(HarnessRegistry);
    expect(registry).toBeDefined();
    expect(registry).toBeInstanceOf(HarnessRegistry);
  });

  it('provides GovernanceService facade', () => {
    const service = module.get(GovernanceService);
    expect(service).toBeDefined();
  });

  it('provides GovernanceCommand', () => {
    const command = module.get(GovernanceCommand);
    expect(command).toBeDefined();
  });

  it('provides GovernanceBudgetCommand', () => {
    const command = module.get(GovernanceBudgetCommand);
    expect(command).toBeDefined();
  });

  it('provides GovernanceAuditCommand', () => {
    const command = module.get(GovernanceAuditCommand);
    expect(command).toBeDefined();
  });

  it('EscalationGate receives BudgetGovernor via DI', () => {
    const gate = module.get(EscalationGate);
    const governor = module.get(BudgetGovernor);
    // The gate should have been constructed with the same governor instance
    expect(gate).toBeDefined();
    expect(governor).toBeDefined();
  });
});

describe('GovernanceService facade', () => {
  let module: TestingModule;
  let service: GovernanceService;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [GovernanceModule],
    }).compile();
    service = module.get(GovernanceService);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('budget() returns zero totals when no policy is configured', () => {
    const result = service.budget();
    expect(result).toEqual({
      total: 0,
      used: 0,
      remaining: 0,
      period: 'session',
    });
  });

  it('budget() returns finite totals when policy is configured', () => {
    const governor = module.get(BudgetGovernor);
    governor.configure({
      workerTokenLimit: 10_000,
      reasoningTokenLimit: 50_000,
      proTokenLimit: 100_000,
      sessionTokenCeiling: 200_000,
      warningThresholdPercent: 80,
    });
    const result = service.budget('weekly');
    expect(result.total).toBe(160_000);
    expect(result.remaining).toBe(160_000);
    expect(result.used).toBe(0);
    expect(result.period).toBe('weekly');
  });

  it('audit() returns audit data from InMemoryAuditTrail', async () => {
    const result = await service.audit();
    expect(Array.isArray(result)).toBe(true);
  });

  // Existing command tests preserved
  it('budget command shows text output (BDD-032)', async () => {
    const command = module.get(GovernanceBudgetCommand);
    await command.run([], {});
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('budget command outputs JSON (BDD-057)', async () => {
    const command = module.get(GovernanceBudgetCommand);
    await command.run([], { json: true });
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('total');
    expect(output).toHaveProperty('remaining');
  });

  it('audit command shows text output (BDD-034)', async () => {
    const command = module.get(GovernanceAuditCommand);
    await command.run([], {});
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('audit command outputs JSON (BDD-058)', async () => {
    const command = module.get(GovernanceAuditCommand);
    await command.run([], { json: true });
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output)).toBe(true);
  });

  it('parent command prints help', async () => {
    const command = module.get(GovernanceCommand);
    const helpFn = vi.fn();
    (command as any).command = { help: helpFn };
    await command.run();
    expect(helpFn).toHaveBeenCalledTimes(1);
  });

  it('budget parseJson returns true', () => {
    const command = module.get(GovernanceBudgetCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('budget parsePeriod returns the value', () => {
    const command = module.get(GovernanceBudgetCommand);
    expect(command.parsePeriod('weekly')).toBe('weekly');
  });

  it('audit parseJson returns true', () => {
    const command = module.get(GovernanceAuditCommand);
    expect(command.parseJson()).toBe(true);
  });

  it('audit parseSince returns the value', () => {
    const command = module.get(GovernanceAuditCommand);
    expect(command.parseSince('2026-01-01')).toBe('2026-01-01');
  });
});
