import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { VersionCommand } from '../src/commands/version.command.js';
import { getCliVersion } from '../src/package-info.js';

describe('VersionCommand (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves through the full AppModule graph and prints the CLI version', async () => {
    const command = moduleRef.get(VersionCommand);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await command.run([]);

    expect(logSpy).toHaveBeenCalledWith(getCliVersion());

    logSpy.mockRestore();
  });
});
