import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import {
  resolveStateRoot,
  ensureStateRoot,
  type StateDirectoryContext,
} from '../../src/workspace/state-directory.util.js';
import { StateDirectoryService } from '../../src/workspace/state-directory.service.js';

describe('StateDirectory', () => {
  describe('resolveStateRoot', () => {
    const baseContext: StateDirectoryContext = {
      env: {},
      platform: 'linux',
      homeDir: '/home/testuser',
    };

    it('returns VIRGIL_STATE_DIR when set', () => {
      const result = resolveStateRoot({
        ...baseContext,
        env: { VIRGIL_STATE_DIR: '/custom/path' },
      });
      expect(result).toBe('/custom/path');
    });

    it('ignores blank VIRGIL_STATE_DIR', () => {
      const result = resolveStateRoot({
        ...baseContext,
        env: { VIRGIL_STATE_DIR: '   ' },
      });
      expect(result).toBe('/home/testuser/.virgil');
    });

    it('returns macOS path for darwin', () => {
      const result = resolveStateRoot({
        ...baseContext,
        platform: 'darwin',
      });
      expect(result).toBe(
        '/home/testuser/Library/Application Support/virgil',
      );
    });

    it('returns Windows path with LOCALAPPDATA', () => {
      const result = resolveStateRoot({
        ...baseContext,
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
      });
      expect(result).toBe(
        join('C:\\Users\\test\\AppData\\Local', 'virgil'),
      );
    });

    it('returns Windows fallback without LOCALAPPDATA', () => {
      const result = resolveStateRoot({
        ...baseContext,
        platform: 'win32',
      });
      expect(result).toBe('/home/testuser/.virgil');
    });

    it('returns XDG path on Linux when XDG_DATA_HOME set', () => {
      const result = resolveStateRoot({
        ...baseContext,
        env: { XDG_DATA_HOME: '/home/testuser/.local/share' },
      });
      expect(result).toBe('/home/testuser/.local/share/virgil');
    });

    it('returns Linux fallback without XDG_DATA_HOME', () => {
      const result = resolveStateRoot(baseContext);
      expect(result).toBe('/home/testuser/.virgil');
    });

    it('ignores blank XDG_DATA_HOME', () => {
      const result = resolveStateRoot({
        ...baseContext,
        env: { XDG_DATA_HOME: '  ' },
      });
      expect(result).toBe('/home/testuser/.virgil');
    });

    it('ignores blank LOCALAPPDATA on Windows', () => {
      const result = resolveStateRoot({
        ...baseContext,
        platform: 'win32',
        env: { LOCALAPPDATA: '  ' },
      });
      expect(result).toBe('/home/testuser/.virgil');
    });
  });

  describe('ensureStateRoot', () => {
    let tmpBase: string;

    beforeEach(async () => {
      tmpBase = await mkdtemp(join(tmpdir(), 'virgil-state-'));
    });

    afterEach(async () => {
      await rm(tmpBase, { recursive: true, force: true });
    });

    it('creates the directory and returns the path', async () => {
      const targetDir = join(tmpBase, 'nested', 'virgil');
      const context: StateDirectoryContext = {
        env: { VIRGIL_STATE_DIR: targetDir },
        platform: 'linux',
        homeDir: tmpBase,
      };
      const result = await ensureStateRoot(context);
      expect(result).toBe(targetDir);
      await expect(access(targetDir)).resolves.toBeUndefined();
    });

    it('is idempotent on existing directory', async () => {
      const targetDir = join(tmpBase, 'virgil');
      const context: StateDirectoryContext = {
        env: { VIRGIL_STATE_DIR: targetDir },
        platform: 'linux',
        homeDir: tmpBase,
      };
      await ensureStateRoot(context);
      const result = await ensureStateRoot(context);
      expect(result).toBe(targetDir);
    });
  });

  describe('StateDirectoryService', () => {
    let service: StateDirectoryService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [StateDirectoryService],
      }).compile();
      service = module.get(StateDirectoryService);
    });

    it('resolveRoot delegates with overrides', () => {
      const result = service.resolveRoot({
        env: { VIRGIL_STATE_DIR: '/overridden' },
        platform: 'linux',
        homeDir: '/test',
      });
      expect(result).toBe('/overridden');
    });

    it('ensureRoot creates directory and returns path', async () => {
      const tmpBase = await mkdtemp(join(tmpdir(), 'virgil-svc-'));
      try {
        const targetDir = join(tmpBase, 'state');
        const result = await service.ensureRoot({
          env: { VIRGIL_STATE_DIR: targetDir },
          platform: 'linux',
          homeDir: tmpBase,
        });
        expect(result).toBe(targetDir);
        await expect(access(targetDir)).resolves.toBeUndefined();
      } finally {
        await rm(tmpBase, { recursive: true, force: true });
      }
    });
  });
});
