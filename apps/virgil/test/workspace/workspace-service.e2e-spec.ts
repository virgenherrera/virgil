import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { StateDirectoryService } from '../../src/workspace/state-directory.service.js';
import { WorkspaceFsService } from '../../src/workspace/workspace-fs.service.js';
import { WorkspaceService } from '../../src/workspace/workspace.service.js';
import {
  DuplicateWorkspaceError,
  NoActiveWorkspaceError,
  WorkspaceConfigValidationError,
  WorkspaceNotFoundError,
} from '../../src/workspace/workspace.errors.js';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'virgil-ws-'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
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
    service = module.get(WorkspaceService);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates a workspace with valid slug', async () => {
      const metadata = await service.create('test-ws');
      expect(metadata.slug).toBe('test-ws');
      expect(metadata.schemaVersion).toBe(1);
      expect(metadata.createdAt).toBeTypeOf('number');
      expect(metadata.updatedAt).toBeTypeOf('number');
    });

    it('stores displayName when provided', async () => {
      const metadata = await service.create('test-ws', 'Test Workspace');
      expect(metadata.displayName).toBe('Test Workspace');
    });

    it('leaves displayName undefined when not provided', async () => {
      const metadata = await service.create('test-ws');
      expect(metadata.displayName).toBeUndefined();
    });

    it('throws DuplicateWorkspaceError for duplicate slug', async () => {
      await service.create('test-ws');
      await expect(service.create('test-ws')).rejects.toThrow(
        DuplicateWorkspaceError,
      );
    });

    it('throws on invalid slug (uppercase)', async () => {
      await expect(service.create('INVALID')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('throws on slug starting with digit', async () => {
      await expect(service.create('1bad')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('throws on empty slug', async () => {
      await expect(service.create('')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });

    it('initializes empty providers and repos files', async () => {
      await service.create('test-ws');
      const details = await service.show('test-ws');
      expect(details.providers).toEqual([]);
      expect(details.repos).toEqual([]);
    });
  });

  describe('list', () => {
    it('returns empty array initially', async () => {
      const entries = await service.list();
      expect(entries).toEqual([]);
    });

    it('returns created workspaces in sorted order', async () => {
      await service.create('bravo');
      await service.create('alpha');
      const entries = await service.list();
      expect(entries).toHaveLength(2);
      expect(entries[0].metadata.slug).toBe('alpha');
      expect(entries[1].metadata.slug).toBe('bravo');
    });

    it('marks active workspace', async () => {
      await service.create('alpha');
      await service.create('bravo');
      await service.select('alpha');
      const entries = await service.list();
      const alpha = entries.find((e) => e.metadata.slug === 'alpha');
      const bravo = entries.find((e) => e.metadata.slug === 'bravo');
      expect(alpha?.active).toBe(true);
      expect(bravo?.active).toBe(false);
    });

    it('marks no workspace active when none selected', async () => {
      await service.create('alpha');
      const entries = await service.list();
      expect(entries[0].active).toBe(false);
    });
  });

  describe('select', () => {
    it('updates global config with active workspace', async () => {
      await service.create('test-ws');
      const config = await service.select('test-ws');
      expect(config.activeWorkspace).toBe('test-ws');
    });

    it('throws WorkspaceNotFoundError for non-existent slug', async () => {
      await expect(service.select('ghost')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });

    it('throws on invalid slug', async () => {
      await expect(service.select('BAD!')).rejects.toThrow(
        WorkspaceConfigValidationError,
      );
    });
  });

  describe('show', () => {
    it('returns workspace details', async () => {
      await service.create('test-ws', 'My Workspace');
      const details = await service.show('test-ws');
      expect(details.metadata.slug).toBe('test-ws');
      expect(details.metadata.displayName).toBe('My Workspace');
      expect(details.providers).toEqual([]);
      expect(details.repos).toEqual([]);
      expect(details.path).toContain('test-ws');
      expect(details.active).toBe(false);
    });

    it('marks workspace as active when selected', async () => {
      await service.create('test-ws');
      await service.select('test-ws');
      const details = await service.show('test-ws');
      expect(details.active).toBe(true);
    });

    it('includes the workspace directory path', async () => {
      await service.create('test-ws');
      const details = await service.show('test-ws');
      expect(details.path).toBe(join(tmpDir, 'workspaces', 'test-ws'));
    });

    it('throws WorkspaceNotFoundError for non-existent slug', async () => {
      await expect(service.show('ghost')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });
  });

  describe('delete', () => {
    it('removes the workspace directory', async () => {
      await service.create('doomed');
      await service.delete('doomed');
      const entries = await service.list();
      expect(entries).toEqual([]);
    });

    it('clears active workspace if deleted was active', async () => {
      await service.create('doomed');
      await service.select('doomed');
      await service.delete('doomed');
      await service.create('new-ws');
      const entries = await service.list();
      expect(entries[0].active).toBe(false);
    });

    it('preserves active workspace when deleting a different one', async () => {
      await service.create('keep');
      await service.create('doomed');
      await service.select('keep');
      await service.delete('doomed');
      const entries = await service.list();
      expect(entries[0].metadata.slug).toBe('keep');
      expect(entries[0].active).toBe(true);
    });

    it('throws WorkspaceNotFoundError for non-existent slug', async () => {
      await expect(service.delete('ghost')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });
  });

  describe('resolveActiveOrGivenSlug', () => {
    it('returns given slug when provided', async () => {
      const slug = await service.resolveActiveOrGivenSlug('test-ws');
      expect(slug).toBe('test-ws');
    });

    it('validates given slug', async () => {
      await expect(
        service.resolveActiveOrGivenSlug('BAD!'),
      ).rejects.toThrow(WorkspaceConfigValidationError);
    });

    it('returns active workspace slug when no slug given', async () => {
      await service.create('test-ws');
      await service.select('test-ws');
      const slug = await service.resolveActiveOrGivenSlug();
      expect(slug).toBe('test-ws');
    });

    it('throws NoActiveWorkspaceError when no active and no slug given', async () => {
      await expect(service.resolveActiveOrGivenSlug()).rejects.toThrow(
        NoActiveWorkspaceError,
      );
    });
  });
});
