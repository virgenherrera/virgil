import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { CeilingCommand } from '../src/commands/index.js';

describe('CeilingCommand (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full ProbeModule graph', () => {
    const command = moduleRef.get(CeilingCommand);
    expect(command).toBeDefined();
  });

  it('computes a ceiling with explicit options (no interactive prompts)', async () => {
    const command = moduleRef.get(CeilingCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([], {
      maxMinions: 1,
      tiers: 'worker',
      ramReservation: 4,
    });

    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(captured);
    expect(parsed).toHaveProperty('maxMinions');
    expect(parsed).toHaveProperty('allowedTiers');
    expect(parsed).toHaveProperty('selectedModels');
    expect(parsed).toHaveProperty('explanation');
    expect(typeof parsed.maxMinions).toBe('number');
    expect(Array.isArray(parsed.allowedTiers)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
