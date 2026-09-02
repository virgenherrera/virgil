import { Test, TestingModule } from '@nestjs/testing';
import { getCliVersion } from '../package-info.js';
import { VersionCommand } from './version.command.js';

describe('VersionCommand', () => {
  let command: VersionCommand;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [VersionCommand],
    }).compile();

    command = moduleRef.get(VersionCommand);
  });

  it('is defined', () => {
    expect(command).toBeDefined();
  });

  it('logs the CLI version to stdout', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await command.run([]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(getCliVersion());

    logSpy.mockRestore();
  });
});
