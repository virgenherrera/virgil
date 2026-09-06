import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceCreateCommand } from '../src/workspace/commands/workspace-create.command.js';
import { WorkspaceDeleteCommand } from '../src/workspace/commands/workspace-delete.command.js';
import { WorkspaceListCommand } from '../src/workspace/commands/workspace-list.command.js';
import { WorkspaceSelectCommand } from '../src/workspace/commands/workspace-select.command.js';
import { WorkspaceShowCommand } from '../src/workspace/commands/workspace-show.command.js';
import { WorkspaceCommand } from '../src/workspace/commands/workspace.command.js';
import { ProviderFamily } from '../src/workspace/provider-config.schema.js';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';
import { WorkspaceService } from '../src/workspace/workspace.service.js';
import type { TmpStateDirHandle } from './support/tmp-state-dir.js';
import { useTmpStateDir } from './support/tmp-state-dir.js';

describe('Workspace CLI commands (e2e)', () => {
  let handle: TmpStateDirHandle;
  let moduleRef: TestingModule;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    handle = await useTmpStateDir();
    moduleRef = await Test.createTestingModule({
      imports: [WorkspaceModule],
    }).compile();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await moduleRef.close();
    await handle.cleanup();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('resolves the root workspace command and every subcommand through the DI graph', () => {
    expect(moduleRef.get(WorkspaceCommand)).toBeInstanceOf(WorkspaceCommand);
    expect(moduleRef.get(WorkspaceCreateCommand)).toBeInstanceOf(
      WorkspaceCreateCommand,
    );
    expect(moduleRef.get(WorkspaceListCommand)).toBeInstanceOf(
      WorkspaceListCommand,
    );
    expect(moduleRef.get(WorkspaceSelectCommand)).toBeInstanceOf(
      WorkspaceSelectCommand,
    );
    expect(moduleRef.get(WorkspaceShowCommand)).toBeInstanceOf(
      WorkspaceShowCommand,
    );
    expect(moduleRef.get(WorkspaceDeleteCommand)).toBeInstanceOf(
      WorkspaceDeleteCommand,
    );
  });

  it('prints usage guidance when the root workspace command runs without a subcommand', async () => {
    const command = moduleRef.get(WorkspaceCommand);

    await command.run();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('virgil workspace'),
    );
  });

  it('creates, lists, selects, shows, and deletes a workspace end-to-end via the CLI commands', async () => {
    const createCommand = moduleRef.get(WorkspaceCreateCommand);
    const listCommand = moduleRef.get(WorkspaceListCommand);
    const selectCommand = moduleRef.get(WorkspaceSelectCommand);
    const showCommand = moduleRef.get(WorkspaceShowCommand);
    const deleteCommand = moduleRef.get(WorkspaceDeleteCommand);

    await createCommand.run(['acme-corp'], { name: 'Acme Corp' });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Created workspace "acme-corp'),
    );

    await listCommand.run();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('acme-corp'));

    await selectCommand.run(['acme-corp']);
    expect(logSpy).toHaveBeenCalledWith('Active workspace set to "acme-corp".');

    await showCommand.run([]);
    expect(logSpy).toHaveBeenCalledWith('Workspace: acme-corp');

    await deleteCommand.run(['acme-corp']);
    expect(logSpy).toHaveBeenCalledWith('Deleted workspace "acme-corp".');

    expect(process.exitCode).toBeUndefined();
  });

  it('reports a clear error and sets a nonzero exit code when creating without a slug', async () => {
    const createCommand = moduleRef.get(WorkspaceCreateCommand);

    await createCommand.run([]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('slug is required'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a clear error when selecting a workspace that does not exist', async () => {
    const selectCommand = moduleRef.get(WorkspaceSelectCommand);

    await selectCommand.run(['ghost']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('was not found'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a clear error when showing with no active workspace and no slug given', async () => {
    const showCommand = moduleRef.get(WorkspaceShowCommand);

    await showCommand.run([]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No active workspace'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a clear error when deleting without a slug', async () => {
    const deleteCommand = moduleRef.get(WorkspaceDeleteCommand);

    await deleteCommand.run([]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('slug is required'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a clear error when selecting without a slug', async () => {
    const selectCommand = moduleRef.get(WorkspaceSelectCommand);

    await selectCommand.run([]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('slug is required'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a clear error when creating a workspace with an invalid slug', async () => {
    const createCommand = moduleRef.get(WorkspaceCreateCommand);

    await createCommand.run(['Not-A-Valid-Slug']);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    expect(process.exitCode).toBe(1);
  });

  it('parses the --name option value through the @Option handler', () => {
    const createCommand = moduleRef.get(WorkspaceCreateCommand);

    expect(createCommand.parseName('Acme Corp')).toBe('Acme Corp');
  });

  it('reports a clear error when deleting a workspace that does not exist', async () => {
    const deleteCommand = moduleRef.get(WorkspaceDeleteCommand);

    await deleteCommand.run(['ghost']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('was not found'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('prints guidance when listing with no workspaces created', async () => {
    const listCommand = moduleRef.get(WorkspaceListCommand);

    await listCommand.run();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('No workspaces found'),
    );
  });

  it('shows registered providers and repositories for a workspace', async () => {
    const createCommand = moduleRef.get(WorkspaceCreateCommand);
    const showCommand = moduleRef.get(WorkspaceShowCommand);
    const workspaceService = moduleRef.get(WorkspaceService);

    await createCommand.run(['acme-corp']);
    await workspaceService.registerProvider('acme-corp', {
      type: 'local-fs',
      family: ProviderFamily.KNOWLEDGE,
      enabled: true,
      path: '/repos/acme',
    });
    await workspaceService.registerRepo('acme-corp', { path: '/repos/acme' });

    await showCommand.run(['acme-corp']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[knowledge] local-fs (enabled)'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/repos/acme'));
  });
});
