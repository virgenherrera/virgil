import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ProviderFamily } from '../src/workspace/provider-config.schema.js';
import {
  DuplicateRepoError,
  DuplicateWorkspaceError,
  NoActiveWorkspaceError,
  WorkspaceConfigValidationError,
  WorkspaceNotFoundError,
} from '../src/workspace/workspace.errors.js';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';
import { WorkspaceService } from '../src/workspace/workspace.service.js';
import type { TmpStateDirHandle } from './support/tmp-state-dir.js';
import { useTmpStateDir } from './support/tmp-state-dir.js';

describe('WorkspaceService (e2e)', () => {
  let handle: TmpStateDirHandle;
  let moduleRef: TestingModule;
  let workspaceService: WorkspaceService;

  beforeEach(async () => {
    handle = await useTmpStateDir();
    moduleRef = await Test.createTestingModule({
      imports: [WorkspaceModule],
    }).compile();
    workspaceService = moduleRef.get(WorkspaceService);
  });

  afterEach(async () => {
    await moduleRef.close();
    await handle.cleanup();
  });

  describe('createWorkspace', () => {
    it('creates a workspace directory with a valid workspace.config.json under the resolved state root', async () => {
      const metadata = await workspaceService.createWorkspace(
        'acme-corp',
        'Acme Corp',
      );

      expect(metadata.slug).toBe('acme-corp');
      expect(metadata.displayName).toBe('Acme Corp');

      const configPath = join(
        handle.path,
        'workspaces',
        'acme-corp',
        'workspace.config.json',
      );
      const raw = await readFile(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      expect(parsed.slug).toBe('acme-corp');
      expect(parsed.schemaVersion).toBe(1);
    });

    it('rejects a duplicate workspace slug with a clear error', async () => {
      await workspaceService.createWorkspace('acme-corp');

      await expect(
        workspaceService.createWorkspace('acme-corp'),
      ).rejects.toBeInstanceOf(DuplicateWorkspaceError);
    });

    it.each(['Acme', '1acme', 'acme_corp', '', 'a'.repeat(65)])(
      'rejects an invalid workspace slug %j with an actionable validation error',
      async (invalidSlug) => {
        await expect(
          workspaceService.createWorkspace(invalidSlug),
        ).rejects.toBeInstanceOf(WorkspaceConfigValidationError);
      },
    );
  });

  describe('listWorkspaces', () => {
    it('returns an empty list when no workspace has been created', async () => {
      await expect(workspaceService.listWorkspaces()).resolves.toEqual([]);
    });

    it('lists every created workspace and marks the active one', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await workspaceService.createWorkspace('personal-oss');
      await workspaceService.selectWorkspace('personal-oss');

      const workspaces = await workspaceService.listWorkspaces();

      expect(workspaces).toHaveLength(2);
      const active = workspaces.find(
        (entry) => entry.metadata.slug === 'personal-oss',
      );
      const inactive = workspaces.find(
        (entry) => entry.metadata.slug === 'acme-corp',
      );
      expect(active?.active).toBe(true);
      expect(inactive?.active).toBe(false);
    });
  });

  describe('selectWorkspace', () => {
    it('sets the active workspace in global.config.json', async () => {
      await workspaceService.createWorkspace('acme-corp');

      await workspaceService.selectWorkspace('acme-corp');

      const raw = await readFile(
        join(handle.path, 'global.config.json'),
        'utf-8',
      );
      expect(
        (JSON.parse(raw) as { activeWorkspace: string }).activeWorkspace,
      ).toBe('acme-corp');
    });

    it('rejects selecting a workspace that does not exist', async () => {
      await expect(
        workspaceService.selectWorkspace('does-not-exist'),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  describe('showWorkspace', () => {
    it('shows the active workspace when no slug is given', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await workspaceService.selectWorkspace('acme-corp');

      const details = await workspaceService.showWorkspace();

      expect(details.metadata.slug).toBe('acme-corp');
      expect(details.providers).toEqual([]);
      expect(details.repos).toEqual([]);
    });

    it('rejects when no slug is given and no workspace is active', async () => {
      await expect(workspaceService.showWorkspace()).rejects.toBeInstanceOf(
        NoActiveWorkspaceError,
      );
    });

    it('rejects an explicit slug for a workspace that does not exist', async () => {
      await expect(
        workspaceService.showWorkspace('ghost'),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  describe('deleteWorkspace', () => {
    it('removes the workspace directory', async () => {
      await workspaceService.createWorkspace('acme-corp');

      await workspaceService.deleteWorkspace('acme-corp');

      await expect(workspaceService.listWorkspaces()).resolves.toEqual([]);
    });

    it('clears the active workspace when the deleted workspace was active', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await workspaceService.selectWorkspace('acme-corp');

      await workspaceService.deleteWorkspace('acme-corp');

      await expect(workspaceService.showWorkspace()).rejects.toBeInstanceOf(
        NoActiveWorkspaceError,
      );
    });

    it('rejects deleting a workspace that does not exist', async () => {
      await expect(
        workspaceService.deleteWorkspace('ghost'),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  describe('registerProvider', () => {
    it('registers a github-issues provider against an existing workspace', async () => {
      await workspaceService.createWorkspace('acme-corp');

      const provider = await workspaceService.registerProvider('acme-corp', {
        type: 'github-issues',
        family: ProviderFamily.ISSUE,
        enabled: true,
        owner: 'virgil-project',
        repo: 'virgil',
      });

      expect(provider.type).toBe('github-issues');
      const details = await workspaceService.showWorkspace('acme-corp');
      expect(details.providers).toHaveLength(1);
      expect(details.providers[0]?.id).toBe(provider.id);
    });

    it('rejects registering a provider against a nonexistent workspace', async () => {
      await expect(
        workspaceService.registerProvider('ghost', {
          type: 'local-fs',
          family: ProviderFamily.KNOWLEDGE,
          enabled: true,
          path: '/repos/virgil',
        }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });

    it('rejects a provider input missing required fields for its type', async () => {
      await workspaceService.createWorkspace('acme-corp');

      await expect(
        workspaceService.registerProvider('acme-corp', {
          type: 'github-issues',
          family: ProviderFamily.ISSUE,
          enabled: true,
        } as never),
      ).rejects.toBeInstanceOf(WorkspaceConfigValidationError);
    });
  });

  describe('registerRepo', () => {
    it('registers a repository with an absolute path', async () => {
      await workspaceService.createWorkspace('acme-corp');

      const repo = await workspaceService.registerRepo('acme-corp', {
        path: '/repos/virgil',
        alias: 'virgil',
      });

      expect(repo.path).toBe('/repos/virgil');
      const details = await workspaceService.showWorkspace('acme-corp');
      expect(details.repos).toHaveLength(1);
    });

    it('rejects a relative repository path', async () => {
      await workspaceService.createWorkspace('acme-corp');

      await expect(
        workspaceService.registerRepo('acme-corp', { path: 'relative/path' }),
      ).rejects.toBeInstanceOf(WorkspaceConfigValidationError);
    });

    it('rejects a duplicate repository path within the same workspace', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await workspaceService.registerRepo('acme-corp', {
        path: '/repos/virgil',
      });

      await expect(
        workspaceService.registerRepo('acme-corp', { path: '/repos/virgil' }),
      ).rejects.toBeInstanceOf(DuplicateRepoError);
    });

    it('rejects registering a repository against a nonexistent workspace', async () => {
      await expect(
        workspaceService.registerRepo('ghost', { path: '/repos/virgil' }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  describe('resilience to missing per-workspace registration files', () => {
    it('returns an empty provider list when providers.json is missing', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await rm(join(handle.path, 'workspaces', 'acme-corp', 'providers.json'));

      const details = await workspaceService.showWorkspace('acme-corp');

      expect(details.providers).toEqual([]);
    });

    it('returns an empty repo list when repos.json is missing', async () => {
      await workspaceService.createWorkspace('acme-corp');
      await rm(join(handle.path, 'workspaces', 'acme-corp', 'repos.json'));

      const details = await workspaceService.showWorkspace('acme-corp');

      expect(details.repos).toEqual([]);
    });
  });

  describe('malformed configuration handling', () => {
    it('produces an actionable error for invalid JSON in workspace.config.json', async () => {
      await workspaceService.createWorkspace('acme-corp');
      const configPath = join(
        handle.path,
        'workspaces',
        'acme-corp',
        'workspace.config.json',
      );
      await writeFile(configPath, '{ not valid json', 'utf-8');

      await expect(workspaceService.showWorkspace('acme-corp')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
      await expect(workspaceService.showWorkspace('acme-corp')).rejects.toThrow(
        /not valid JSON/,
      );
    });

    it('produces an actionable error for a workspace.config.json failing schema validation', async () => {
      await workspaceService.createWorkspace('acme-corp');
      const configPath = join(
        handle.path,
        'workspaces',
        'acme-corp',
        'workspace.config.json',
      );
      await writeFile(
        configPath,
        JSON.stringify({ schemaVersion: 1 }),
        'utf-8',
      );

      await expect(workspaceService.showWorkspace('acme-corp')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('produces an actionable error for a malformed global.config.json', async () => {
      await mkdir(handle.path, { recursive: true });
      await writeFile(
        join(handle.path, 'global.config.json'),
        '{ broken',
        'utf-8',
      );

      await expect(workspaceService.listWorkspaces()).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('produces an actionable error when global.config.json is valid JSON but the wrong shape', async () => {
      await writeFile(
        join(handle.path, 'global.config.json'),
        JSON.stringify(42),
        'utf-8',
      );

      await expect(workspaceService.listWorkspaces()).rejects.toThrow('(root)');
    });
  });
});
