import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { StateDirectoryService } from '../src/workspace/state-directory.service.js';
import { WorkspaceModule } from '../src/workspace/workspace.module.js';

describe('StateDirectoryService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: StateDirectoryService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WorkspaceModule],
    }).compile();
    service = moduleRef.get(StateDirectoryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('honors VIRGIL_STATE_DIR as an explicit override regardless of platform', () => {
    const resolved = service.resolveRoot({
      env: { VIRGIL_STATE_DIR: '/custom/virgil/state' },
      platform: 'darwin',
    });

    expect(resolved).toBe('/custom/virgil/state');
  });

  it('resolves the macOS Application Support directory when no override is set', () => {
    const resolved = service.resolveRoot({
      env: {},
      platform: 'darwin',
      homeDir: '/Users/tester',
    });

    expect(resolved).toBe(
      join('/Users/tester', 'Library', 'Application Support', 'virgil'),
    );
  });

  it('resolves %LOCALAPPDATA%\\virgil on Windows when LOCALAPPDATA is set', () => {
    const resolved = service.resolveRoot({
      env: { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' },
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
    });

    expect(resolved).toBe(join('C:\\Users\\tester\\AppData\\Local', 'virgil'));
  });

  it('falls back to ~/.virgil on Windows when LOCALAPPDATA is unset', () => {
    const resolved = service.resolveRoot({
      env: {},
      platform: 'win32',
      homeDir: '/home/tester',
    });

    expect(resolved).toBe(join('/home/tester', '.virgil'));
  });

  it('resolves $XDG_DATA_HOME/virgil on Linux when set', () => {
    const resolved = service.resolveRoot({
      env: { XDG_DATA_HOME: '/home/tester/.local/share' },
      platform: 'linux',
      homeDir: '/home/tester',
    });

    expect(resolved).toBe(join('/home/tester/.local/share', 'virgil'));
  });

  it('falls back to ~/.virgil on Linux when XDG_DATA_HOME is unset', () => {
    const resolved = service.resolveRoot({
      env: {},
      platform: 'linux',
      homeDir: '/home/tester',
    });

    expect(resolved).toBe(join('/home/tester', '.virgil'));
  });

  it('never depends on process.execPath for state path resolution', () => {
    const originalExecPath = process.execPath;

    Object.defineProperty(process, 'execPath', {
      value: '/some/sea/binary/install/path',
      configurable: true,
    });

    try {
      const resolved = service.resolveRoot({
        env: {},
        platform: 'linux',
        homeDir: '/home/tester',
      });

      expect(resolved).toBe(join('/home/tester', '.virgil'));
    } finally {
      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        configurable: true,
      });
    }
  });

  it('creates the resolved state root directory on first access', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'virgil-state-root-'));
    const target = join(baseDir, 'nested', 'virgil-state');

    try {
      const resolved = await service.ensureRoot({
        env: { VIRGIL_STATE_DIR: target },
      });

      expect(resolved).toBe(target);
      await expect(stat(target)).resolves.toMatchObject({});
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('is idempotent when the state root directory already exists', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'virgil-state-root-'));

    try {
      await service.ensureRoot({ env: { VIRGIL_STATE_DIR: baseDir } });

      await expect(
        service.ensureRoot({ env: { VIRGIL_STATE_DIR: baseDir } }),
      ).resolves.toBe(baseDir);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
