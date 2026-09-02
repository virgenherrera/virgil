import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { VersionCommand } from '../src/commands/version.command.js';
import { WorkspaceCommand } from '../src/workspace/commands/workspace.command.js';

describe('AppModule (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('bootstraps the full DI graph without unresolved dependencies', async () => {
    await expect(
      Test.createTestingModule({ imports: [AppModule] }).compile(),
    ).resolves.toBeInstanceOf(TestingModule);
  });

  it('resolves every command provider registered on AppModule', () => {
    const command = moduleRef.get(VersionCommand, { strict: false });

    expect(command).toBeInstanceOf(VersionCommand);
  });

  it('resolves the WorkspaceCommand registered via WorkspaceModule', () => {
    const command = moduleRef.get(WorkspaceCommand, { strict: false });

    expect(command).toBeInstanceOf(WorkspaceCommand);
  });
});
