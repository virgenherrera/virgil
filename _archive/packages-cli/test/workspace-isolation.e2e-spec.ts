import { Test, TestingModule } from '@nestjs/testing';
import { ProviderFamily } from '../src/workspace/provider-config.schema.js';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';
import { WorkspaceService } from '../src/workspace/workspace.service.js';
import type { TmpStateDirHandle } from './support/tmp-state-dir.js';
import { useTmpStateDir } from './support/tmp-state-dir.js';

/**
 * D8: proves that per-workspace provider and repository registrations
 * are strictly scoped to their owning workspace, with zero
 * cross-contamination, and that deleting one workspace leaves every
 * other workspace's data untouched.
 */
describe('Multi-workspace isolation (e2e)', () => {
  let handle: TmpStateDirHandle;
  let moduleRef: TestingModule;
  let workspaceService: WorkspaceService;

  beforeEach(async () => {
    handle = await useTmpStateDir();
    moduleRef = await Test.createTestingModule({
      imports: [WorkspaceModule],
    }).compile();
    workspaceService = moduleRef.get(WorkspaceService);

    await workspaceService.createWorkspace('acme-corp');
    await workspaceService.createWorkspace('personal-oss');
  });

  afterEach(async () => {
    await moduleRef.close();
    await handle.cleanup();
  });

  it('does not leak a provider registered in one workspace into another', async () => {
    await workspaceService.registerProvider('acme-corp', {
      type: 'local-fs',
      family: ProviderFamily.KNOWLEDGE,
      enabled: true,
      path: '/repos/acme',
    });

    const acme = await workspaceService.showWorkspace('acme-corp');
    const oss = await workspaceService.showWorkspace('personal-oss');

    expect(acme.providers).toHaveLength(1);
    expect(oss.providers).toHaveLength(0);
  });

  it('does not leak a repository registered in one workspace into another', async () => {
    await workspaceService.registerRepo('acme-corp', { path: '/repos/acme' });

    const acme = await workspaceService.showWorkspace('acme-corp');
    const oss = await workspaceService.showWorkspace('personal-oss');

    expect(acme.repos).toHaveLength(1);
    expect(oss.repos).toHaveLength(0);
  });

  it('allows the same repository path to be registered independently in different workspaces', async () => {
    await workspaceService.registerRepo('acme-corp', { path: '/repos/shared' });

    await expect(
      workspaceService.registerRepo('personal-oss', { path: '/repos/shared' }),
    ).resolves.toMatchObject({ path: '/repos/shared' });
  });

  it('does not affect other workspaces when one workspace is deleted', async () => {
    await workspaceService.registerProvider('acme-corp', {
      type: 'local-fs',
      family: ProviderFamily.KNOWLEDGE,
      enabled: true,
      path: '/repos/acme',
    });
    await workspaceService.registerRepo('personal-oss', { path: '/repos/oss' });

    await workspaceService.deleteWorkspace('acme-corp');

    const workspaces = await workspaceService.listWorkspaces();
    expect(workspaces.map((entry) => entry.metadata.slug)).toEqual([
      'personal-oss',
    ]);

    const oss = await workspaceService.showWorkspace('personal-oss');
    expect(oss.repos).toHaveLength(1);
    expect(oss.repos[0]?.path).toBe('/repos/oss');
  });
});
