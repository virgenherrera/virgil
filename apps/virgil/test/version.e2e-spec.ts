import { Test, TestingModule } from '@nestjs/testing';
import { VersionModule } from '../src/version/version.module.js';
import { VersionCommand } from '../src/version/version.command.js';

describe('VersionCommand', () => {
  let module: TestingModule;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [VersionModule],
    }).compile();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints version string in text mode (BDD-047)', async () => {
    const command = module.get(VersionCommand);
    await command.run([], {});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('version');
  });

  it('prints version as JSON with --json (BDD-048)', async () => {
    const command = module.get(VersionCommand);
    await command.run([], { json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output).toHaveProperty('version');
    expect(typeof output.version).toBe('string');
  });

  // --- option parsers ---

  it('parseJson returns true', () => {
    const command = module.get(VersionCommand);
    expect(command.parseJson()).toBe(true);
  });
});
