import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { createTimestamp } from '../../src/shared/primitives.js';
import { StateDirectoryService } from '../../src/workspace/state-directory.service.js';
import { WorkspaceFsService } from '../../src/workspace/workspace-fs.service.js';
import { WorkspaceConfigValidationError } from '../../src/workspace/workspace.errors.js';
import { WORKSPACE_CONFIG_SCHEMA_VERSION } from '../../src/workspace/workspace-metadata.schema.js';
import { GLOBAL_CONFIG_SCHEMA_VERSION } from '../../src/workspace/global-config.schema.js';
import { ProviderFamily } from '../../src/workspace/provider-config.schema.js';

describe('WorkspaceFsService', () => {
  let service: WorkspaceFsService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'virgil-fs-'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceFsService,
        {
          provide: StateDirectoryService,
          useValue: {
            resolveRoot: () => tmpDir,
            ensureRoot: async () => tmpDir,
          },
        },
      ],
    }).compile();
    service = module.get(WorkspaceFsService);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('globalConfig', () => {
    it('returns empty config when no file exists', async () => {
      const config = await service.readGlobalConfig();
      expect(config.schemaVersion).toBe(GLOBAL_CONFIG_SCHEMA_VERSION);
      expect(config.activeWorkspace).toBeUndefined();
    });

    it('roundtrips write then read', async () => {
      await service.writeGlobalConfig({
        schemaVersion: GLOBAL_CONFIG_SCHEMA_VERSION,
        activeWorkspace: 'test-ws',
      });
      const config = await service.readGlobalConfig();
      expect(config.activeWorkspace).toBe('test-ws');
    });

    it('throws on invalid JSON', async () => {
      await writeFile(join(tmpDir, 'global.config.json'), 'not-json');
      await expect(service.readGlobalConfig()).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('throws on invalid schema', async () => {
      await writeFile(
        join(tmpDir, 'global.config.json'),
        JSON.stringify({ bad: true }),
      );
      await expect(service.readGlobalConfig()).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });
  });

  describe('workspaceExists', () => {
    it('returns false when workspace does not exist', async () => {
      expect(await service.workspaceExists('nonexistent')).toBe(false);
    });

    it('returns true after writing metadata', async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('test-ws', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'test-ws',
        createdAt: now,
        updatedAt: now,
      });
      expect(await service.workspaceExists('test-ws')).toBe(true);
    });
  });

  describe('listWorkspaceSlugs', () => {
    it('returns empty array when no workspaces directory', async () => {
      expect(await service.listWorkspaceSlugs()).toEqual([]);
    });

    it('returns sorted slugs', async () => {
      const now = createTimestamp();
      const meta = (slug: string) => ({
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION as 1,
        slug,
        createdAt: now,
        updatedAt: now,
      });
      await service.writeWorkspaceMetadata('bravo', meta('bravo'));
      await service.writeWorkspaceMetadata('alpha', meta('alpha'));
      const slugs = await service.listWorkspaceSlugs();
      expect(slugs).toEqual(['alpha', 'bravo']);
    });
  });

  describe('workspaceMetadata', () => {
    it('roundtrips write then read', async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('test-ws', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'test-ws',
        displayName: 'Test',
        createdAt: now,
        updatedAt: now,
      });
      const read = await service.readWorkspaceMetadata('test-ws');
      expect(read.slug).toBe('test-ws');
      expect(read.displayName).toBe('Test');
      expect(read.schemaVersion).toBe(WORKSPACE_CONFIG_SCHEMA_VERSION);
    });

    it('preserves metadata without displayName', async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('test-ws', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'test-ws',
        createdAt: now,
        updatedAt: now,
      });
      const read = await service.readWorkspaceMetadata('test-ws');
      expect(read.displayName).toBeUndefined();
    });
  });

  describe('deleteWorkspaceDir', () => {
    it('removes the workspace directory', async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('doomed', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'doomed',
        createdAt: now,
        updatedAt: now,
      });
      expect(await service.workspaceExists('doomed')).toBe(true);
      await service.deleteWorkspaceDir('doomed');
      expect(await service.workspaceExists('doomed')).toBe(false);
    });
  });

  describe('providers', () => {
    const setupWorkspace = async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('test-ws', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'test-ws',
        createdAt: now,
        updatedAt: now,
      });
    };

    it('returns empty array when no file exists', async () => {
      await setupWorkspace();
      expect(await service.readProviders('test-ws')).toEqual([]);
    });

    it('roundtrips write then read', async () => {
      await setupWorkspace();
      const now = createTimestamp();
      const providers = [
        {
          id: randomUUID(),
          type: 'github-issues' as const,
          family: ProviderFamily.ISSUE,
          enabled: true,
          owner: 'org',
          repo: 'project',
          createdAt: now,
          updatedAt: now,
        },
      ];
      await service.writeProviders('test-ws', providers);
      const read = await service.readProviders('test-ws');
      expect(read).toHaveLength(1);
      expect(read[0].type).toBe('github-issues');
    });
  });

  describe('repos', () => {
    const setupWorkspace = async () => {
      const now = createTimestamp();
      await service.writeWorkspaceMetadata('test-ws', {
        schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
        slug: 'test-ws',
        createdAt: now,
        updatedAt: now,
      });
    };

    it('returns empty array when no file exists', async () => {
      await setupWorkspace();
      expect(await service.readRepos('test-ws')).toEqual([]);
    });

    it('roundtrips write then read', async () => {
      await setupWorkspace();
      const now = createTimestamp();
      const repos = [
        {
          id: randomUUID(),
          path: '/home/user/project',
          createdAt: now,
          updatedAt: now,
        },
      ];
      await service.writeRepos('test-ws', repos);
      const read = await service.readRepos('test-ws');
      expect(read).toHaveLength(1);
      expect(read[0].path).toBe('/home/user/project');
    });
  });

  describe('resolveWorkspacePath', () => {
    it('returns the path to the workspace directory', async () => {
      const path = await service.resolveWorkspacePath('my-ws');
      expect(path).toBe(join(tmpDir, 'workspaces', 'my-ws'));
    });
  });
});
