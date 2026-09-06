import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Test, TestingModule } from '@nestjs/testing';
import { LocalRepoProviderFactory } from '../../src/repo/local-repo-provider.factory.js';
import { LocalRepoProvider } from '../../src/repo/local-repo.provider.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';

const execFileAsync = promisify(execFile);

async function createTempGitRepo(): Promise<string> {
  const dir = join(tmpdir(), `virgil-factory-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# Test\n');
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('LocalRepoProviderFactory', () => {
  let factory: LocalRepoProviderFactory;
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalRepoProviderFactory],
    }).compile();
    factory = module.get(LocalRepoProviderFactory);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('returns a LocalRepoProvider in REGISTERED status', () => {
      const provider = factory.create({ path: repoDir });
      expect(provider).toBeInstanceOf(LocalRepoProvider);
      expect(provider.status).toBe(ProviderStatus.REGISTERED);
    });

    it('applies Zod defaults to config', () => {
      const provider = factory.create({ path: repoDir });
      expect(provider).toBeInstanceOf(LocalRepoProvider);
    });

    it('throws on invalid config (relative path)', () => {
      expect(() => factory.create({ path: 'relative/path' })).toThrow();
    });

    it('throws on empty path', () => {
      expect(() => factory.create({ path: '' })).toThrow();
    });
  });

  describe('createAndInitialise', () => {
    it('returns an initialised provider in CONNECTED status', async () => {
      const provider = await factory.createAndInitialise({ path: repoDir });
      expect(provider).toBeInstanceOf(LocalRepoProvider);
      expect(provider.status).toBe(ProviderStatus.CONNECTED);
      expect(provider.repoRoot).toBeTruthy();
    });

    it('rejects for non-git directory', async () => {
      const nonGitDir = join(tmpdir(), `virgil-no-git-factory-${Date.now()}`);
      await mkdir(nonGitDir, { recursive: true });
      try {
        await expect(factory.createAndInitialise({ path: nonGitDir })).rejects.toThrow();
      } finally {
        await rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it('rejects for nonexistent path', async () => {
      await expect(
        factory.createAndInitialise({ path: '/nonexistent/path' }),
      ).rejects.toThrow();
    });
  });
});
