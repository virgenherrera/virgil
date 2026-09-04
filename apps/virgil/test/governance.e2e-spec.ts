import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceModule } from '../src/governance/governance.module.js';
import { GovernanceCommand } from '../src/governance/governance.command.js';
import { GovernanceBudgetCommand } from '../src/governance/governance-budget.command.js';
import { GovernanceAuditCommand } from '../src/governance/governance-audit.command.js';
import { createMockPromptService } from './support/mock-prompt.service.js';

describe('GovernanceCommands', () => {
  let module: TestingModule;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [GovernanceModule],
    }).compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // --- governance budget ---

  it('shows budget in text mode with default period (BDD-032)', async () => {
    const command = module.get(GovernanceBudgetCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('monthly');
  });

  it('shows budget with --period filter (BDD-033)', async () => {
    const command = module.get(GovernanceBudgetCommand);
    await command.run([], { period: 'weekly' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('weekly');
  });

  it('outputs budget as JSON (BDD-057)', async () => {
    const command = module.get(GovernanceBudgetCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('total');
    expect(output).toHaveProperty('used');
    expect(output).toHaveProperty('remaining');
    expect(output).toHaveProperty('period');
  });

  // --- governance audit ---

  it('shows audit log in text mode (BDD-034)', async () => {
    const command = module.get(GovernanceAuditCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('generate');
  });

  it('shows audit log with --since filter (BDD-035)', async () => {
    const command = module.get(GovernanceAuditCommand);
    await command.run([], { since: '2026-09-01' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('generate');
  });

  it('outputs audit log as JSON (BDD-058)', async () => {
    const command = module.get(GovernanceAuditCommand);
    await command.run([], { json: true });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    expect(output[0]).toHaveProperty('timestamp');
    expect(output[0]).toHaveProperty('action');
    expect(output[0]).toHaveProperty('agent');
    expect(output[0]).toHaveProperty('tokens');
  });

  // --- parent command ---

  it('prints usage when governance is run without subcommand', async () => {
    const command = module.get(GovernanceCommand);
    const helpFn = vi.fn();
    (command as any).command = { help: helpFn };
    await command.run();

    expect(helpFn).toHaveBeenCalledTimes(1);
  });

  // --- option parsers ---

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
