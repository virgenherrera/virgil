import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { DetectCommand } from '../src/commands/index.js';
import { HardwareProfileSchema } from '../src/schemas/index.js';

describe('DetectCommand (e2e)', () => {
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
    const command = moduleRef.get(DetectCommand);
    expect(command).toBeDefined();
  });

  it('outputs valid JSON hardware profile to stdout', async () => {
    const command = moduleRef.get(DetectCommand);
    let captured = '';
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        captured += String(args[0]);
      });

    await command.run([]);

    expect(logSpy).toHaveBeenCalled();
    const parsed = JSON.parse(captured);
    expect(() => HardwareProfileSchema.parse(parsed)).not.toThrow();

    logSpy.mockRestore();
  });
});
