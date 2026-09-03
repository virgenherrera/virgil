import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { FitnessCommand } from '../src/commands/index.js';

describe('FitnessCommand (e2e)', () => {
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
    const command = moduleRef.get(FitnessCommand);
    expect(command).toBeDefined();
  });

  it('outputs valid JSON fitness results to stdout', async () => {
    const command = moduleRef.get(FitnessCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.run([]);

    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(captured);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    for (const entry of parsed) {
      expect(entry).toHaveProperty('model');
      expect(entry).toHaveProperty('fits');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('tier');
      expect(typeof entry.model).toBe('string');
      expect(typeof entry.fits).toBe('boolean');
      expect(typeof entry.score).toBe('number');
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
