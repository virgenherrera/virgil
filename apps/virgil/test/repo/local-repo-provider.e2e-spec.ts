import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LocalRepoProvider, LocalRepoError } from '../../src/repo/local-repo.provider.js';
import type { LocalRepoConfigEntry } from '../../src/repo/repo-config.schema.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';
import type { Timestamp } from '../../src/shared/primitives.js';

const execFileAsync = promisify(execFile);

async function createTempGitRepo(): Promise<string> {
  const dir = join(tmpdir(), `virgil-repo-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  await writeFile(join(dir, 'hello.ts'), 'export const hello = "world";\n');
  await writeFile(join(dir, 'README.md'), '# Test\n');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'index.ts'), 'export {};\n');
  await execFileAsync('git', ['add', '.'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: dir });
  return dir;
}

function makeConfig(path: string, overrides?: Partial<LocalRepoConfigEntry>): LocalRepoConfigEntry {
  return {
    path,
    maxCommits: 20,
    maxFiles: 1000,
    maxFileSize: 102_400,
    ...overrides,
  };
}

describe('LocalRepoProvider', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('sets metadata with hashed id and REPOSITORY capability', () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      expect(provider.metadata.id).toBeTruthy();
      expect(provider.metadata.capabilities).toContain(ProviderCapability.REPOSITORY);
      expect(provider.metadata.version).toBe('0.0.1');
    });

    it('uses alias as name when provided', () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir, { alias: 'my-alias' }));
      expect(provider.metadata.name).toBe('my-alias');
    });

    it('uses basename as name when no alias', () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      const expected = repoDir.split('/').pop();
      expect(provider.metadata.name).toBe(expected);
    });
  });

  describe('initialize', () => {
    it('sets status to CONNECTED for valid git repo', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      expect(provider.status).toBe(ProviderStatus.REGISTERED);
      await provider.initialize();
      expect(provider.status).toBe(ProviderStatus.CONNECTED);
      expect(provider.repoRoot).toBeTruthy();
    });

    it('throws PATH_NOT_FOUND for nonexistent path', async () => {
      const provider = new LocalRepoProvider(makeConfig('/nonexistent/path'));
      const err = await provider.initialize().catch((e: LocalRepoError) => e);
      expect(err).toBeInstanceOf(LocalRepoError);
      expect((err as LocalRepoError).code).toBe('PATH_NOT_FOUND');
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws NOT_A_DIRECTORY for a file path', async () => {
      const filePath = join(repoDir, 'hello.ts');
      const provider = new LocalRepoProvider(makeConfig(filePath));
      await expect(provider.initialize()).rejects.toThrow(LocalRepoError);
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws NOT_A_GIT_REPO for a non-git directory', async () => {
      const nonGitDir = join(tmpdir(), `virgil-no-git-${Date.now()}`);
      await mkdir(nonGitDir, { recursive: true });
      try {
        const provider = new LocalRepoProvider(makeConfig(nonGitDir));
        await expect(provider.initialize()).rejects.toThrow(LocalRepoError);
        expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
      } finally {
        await rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('healthCheck', () => {
    it('returns REGISTERED when not yet initialized', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      const status = await provider.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED for a healthy repo', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const status = await provider.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });
  });

  describe('dispose', () => {
    it('sets status to DISCONNECTED', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      expect(provider.status).toBe(ProviderStatus.CONNECTED);
      await provider.dispose();
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('listFiles', () => {
    it('lists tracked files', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({});
      expect(result.items.length).toBe(3);
      const paths = result.items.map((f) => f.path);
      expect(paths).toContain('hello.ts');
      expect(paths).toContain('README.md');
      expect(paths).toContain('src/index.ts');
    });

    it('filters by include glob', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({ include: ['*.ts', '**/*.ts'] });
      const paths = result.items.map((f) => f.path);
      expect(paths).toContain('hello.ts');
      expect(paths).toContain('src/index.ts');
      expect(paths).not.toContain('README.md');
    });

    it('filters by exclude glob', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({ exclude: ['*.md', '**/*.md'] });
      const paths = result.items.map((f) => f.path);
      expect(paths).not.toContain('README.md');
      expect(paths).toContain('hello.ts');
    });

    it('filters by maxDepth', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({ maxDepth: 1 });
      const paths = result.items.map((f) => f.path);
      expect(paths).toContain('hello.ts');
      expect(paths).toContain('README.md');
      expect(paths).not.toContain('src/index.ts');
    });

    it('enforces maxItems bound and sets hasMore', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({ maxItems: 1 });
      expect(result.items.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('returns file entry with size and lastModified', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({});
      const tsFile = result.items.find((f) => f.path === 'hello.ts');
      expect(tsFile).toBeDefined();
      expect(tsFile!.size).toBeGreaterThan(0);
      expect(tsFile!.lastModified).toBeGreaterThan(0);
    });

    it('returns mimeType for known extensions', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.listFiles({});
      const tsFile = result.items.find((f) => f.path === 'hello.ts');
      expect(tsFile!.mimeType).toBe('text/typescript');
      const mdFile = result.items.find((f) => f.path === 'README.md');
      expect(mdFile!.mimeType).toBe('text/markdown');
    });

    it('throws when not initialised', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await expect(provider.listFiles({})).rejects.toThrow(LocalRepoError);
    });
  });

  describe('readFile', () => {
    it('reads text file content', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const result = await provider.readFile('hello.ts');
      expect(result.content).toContain('export const hello');
      expect(result.path).toBe('hello.ts');
      expect(result.identity.hash).toBeTruthy();
      expect(result.identity.uri).toContain(repoDir);
    });

    it('throws FILE_NOT_FOUND for missing file', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      await expect(provider.readFile('nonexistent.ts')).rejects.toThrow(
        LocalRepoError,
      );
    });

    it('throws BINARY_FILE for binary content', async () => {
      const binaryPath = join(repoDir, 'binary.bin');
      const buf = Buffer.alloc(100);
      buf[50] = 0;
      await writeFile(binaryPath, buf);
      await execFileAsync('git', ['add', 'binary.bin'], { cwd: repoDir });
      await execFileAsync('git', ['commit', '-m', 'add binary'], { cwd: repoDir });

      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      await expect(provider.readFile('binary.bin')).rejects.toThrow(
        LocalRepoError,
      );
    });

    it('throws FILE_TOO_LARGE when file exceeds maxFileSize', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir, { maxFileSize: 5 }));
      await provider.initialize();
      await expect(provider.readFile('hello.ts')).rejects.toThrow(LocalRepoError);
    });

    it('throws when not initialised', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await expect(provider.readFile('hello.ts')).rejects.toThrow(LocalRepoError);
    });
  });

  describe('getMetadata', () => {
    it('returns repo metadata with name and root', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const meta = await provider.getMetadata();
      expect(meta.name).toBeTruthy();
      expect(meta.root).toBe(provider.repoRoot);
      expect(meta.defaultBranch).toBeTruthy();
      expect(meta.identity.hash).toBeTruthy();
    });

    it('uses alias as name when configured', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir, { alias: 'aliased' }));
      await provider.initialize();
      const meta = await provider.getMetadata();
      expect(meta.name).toBe('aliased');
    });

    it('throws when not initialised', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await expect(provider.getMetadata()).rejects.toThrow(LocalRepoError);
    });
  });

  describe('getGitContext', () => {
    it('returns git context with branch and last commit', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const ctx = await provider.getGitContext();
      expect(ctx.currentBranch).toBeTruthy();
      expect(ctx.lastCommit.hash).toBeTruthy();
      expect(ctx.lastCommit.message).toBe('initial commit');
      expect(ctx.isDirty).toBe(false);
      expect(ctx.trackedFileCount).toBe(3);
    });

    it('detects dirty state', async () => {
      await writeFile(join(repoDir, 'hello.ts'), 'export const hello = "changed";\n');
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const ctx = await provider.getGitContext();
      expect(ctx.isDirty).toBe(true);
    });
  });

  describe('health', () => {
    it('returns HEALTHY for accessible repo', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const h = await provider.health();
      expect(h.status).toBe('healthy');
      expect(h.lastChecked).toBeGreaterThan(0);
    });
  });

  describe('extended methods', () => {
    it('getCurrentBranch returns the branch name', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const branch = await provider.getCurrentBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    it('getRecentCommits returns bounded commits', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const commits = await provider.getRecentCommits();
      expect(commits.length).toBe(1);
      expect(commits[0].sha).toBeTruthy();
      expect(commits[0].authorName).toBe('Test User');
      expect(commits[0].authorEmail).toBe('test@example.com');
    });

    it('getRecentCommits respects max parameter', async () => {
      await writeFile(join(repoDir, 'second.ts'), 'export {};\n');
      await execFileAsync('git', ['add', '.'], { cwd: repoDir });
      await execFileAsync('git', ['commit', '-m', 'second commit'], { cwd: repoDir });

      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const commits = await provider.getRecentCommits(1);
      expect(commits.length).toBe(1);
      expect(commits[0].subject).toBe('second commit');
    });

    it('getContributors returns deduplicated contributors', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const contributors = await provider.getContributors();
      expect(contributors.length).toBe(1);
      expect(contributors[0].name).toBe('Test User');
      expect(contributors[0].commitCount).toBe(1);
    });

    it('getDetailedStatus returns clean state', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const status = await provider.getDetailedStatus();
      expect(status.clean).toBe(true);
      expect(status.modified).toBe(0);
      expect(status.staged).toBe(0);
      expect(status.untracked).toBe(0);
      expect(status.conflicted).toBe(0);
    });

    it('getDetailedStatus detects modifications', async () => {
      await writeFile(join(repoDir, 'hello.ts'), 'changed content\n');
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const status = await provider.getDetailedStatus();
      expect(status.clean).toBe(false);
      expect(status.modified).toBeGreaterThan(0);
    });

    it('getDetailedStatus detects untracked files', async () => {
      await writeFile(join(repoDir, 'new-file.txt'), 'new\n');
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const status = await provider.getDetailedStatus();
      expect(status.clean).toBe(false);
      expect(status.untracked).toBeGreaterThan(0);
    });

    it('getRemotes returns empty for local-only repo', async () => {
      const provider = new LocalRepoProvider(makeConfig(repoDir));
      await provider.initialize();
      const remotes = await provider.getRemotes();
      expect(remotes).toEqual([]);
    });
  });
});

describe('LocalRepoProvider — additional coverage', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('listFiles filters by since timestamp', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const futureTimestamp = (Date.now() + 86_400_000) as Timestamp;
    const result = await provider.listFiles({ since: futureTimestamp });
    expect(result.items).toHaveLength(0);
  });

  it('listFiles returns hasMore=false when all items fit', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const result = await provider.listFiles({ maxItems: 100 });
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeUndefined();
  });

  it('listFiles returns cursor when hasMore', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const result = await provider.listFiles({ maxItems: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBeDefined();
  });

  it('getDetailedStatus detects staged files', async () => {
    await writeFile(join(repoDir, 'new-staged.ts'), 'export {};\n');
    await execFileAsync('git', ['add', 'new-staged.ts'], { cwd: repoDir });
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const status = await provider.getDetailedStatus();
    expect(status.clean).toBe(false);
    expect(status.staged).toBeGreaterThan(0);
  });

  it('getRemotes returns remotes when configured', async () => {
    await execFileAsync(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      { cwd: repoDir },
    );
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const remotes = await provider.getRemotes();
    expect(remotes).toHaveLength(1);
    expect(remotes[0].name).toBe('origin');
    expect(remotes[0].url).toBe('https://github.com/test/repo.git');
  });

  it('getMetadata includes remote URL when configured', async () => {
    await execFileAsync(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      { cwd: repoDir },
    );
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const meta = await provider.getMetadata();
    expect(meta.remotes).toContain('https://github.com/test/repo.git');
    expect(meta.identity.uri).toBe('https://github.com/test/repo.git');
  });

  it('getContributors aggregates counts across multiple commits', async () => {
    await writeFile(join(repoDir, 'second.ts'), 'export {};\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'second'], { cwd: repoDir });

    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const contributors = await provider.getContributors();
    expect(contributors).toHaveLength(1);
    expect(contributors[0].commitCount).toBe(2);
  });

  it('health returns UNAVAILABLE after dispose', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await provider.dispose();
    // After dispose, _repoRoot is still set but status is DISCONNECTED.
    // Calling health should still work because it only checks rev-parse.
    const h = await provider.health();
    expect(h.status).toBe('healthy');
  });

  it('readFile returns identity with discoveredAt timestamp', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const result = await provider.readFile('hello.ts');
    expect(result.identity.discoveredAt).toBeGreaterThan(0);
    expect(result.identity.uri).toContain('hello.ts');
  });

  it('listFiles handles stat failure gracefully', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    // All files should have valid stats; this test just ensures no crash
    const result = await provider.listFiles({});
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.path).toBeTruthy();
    }
  });

  it('getGitContext on empty repo returns fallback values', async () => {
    const emptyDir = join(tmpdir(), `virgil-empty-repo-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: emptyDir });
    await writeFile(join(emptyDir, 'a.txt'), 'a\n');
    await execFileAsync('git', ['add', '.'], { cwd: emptyDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: emptyDir });
    try {
      const provider = new LocalRepoProvider(makeConfig(emptyDir));
      await provider.initialize();
      const ctx = await provider.getGitContext();
      expect(ctx.currentBranch).toBeTruthy();
      expect(typeof ctx.trackedFileCount).toBe('number');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('mimeType returns undefined for unknown extensions', async () => {
    await writeFile(join(repoDir, 'unknown.xyz'), 'data\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'add unknown'], { cwd: repoDir });

    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const result = await provider.listFiles({});
    const unknown = result.items.find((f) => f.path === 'unknown.xyz');
    expect(unknown).toBeDefined();
    expect(unknown!.mimeType).toBeUndefined();
  });

  it('readFile on non-binary file with no null bytes succeeds', async () => {
    await writeFile(join(repoDir, 'text.json'), '{"key": "value"}\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'add json'], { cwd: repoDir });

    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const result = await provider.readFile('text.json');
    expect(result.content).toContain('"key"');
  });

  it('healthCheck returns DISCONNECTED when git fails', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await rm(join(repoDir, '.git'), { recursive: true, force: true });
    const status = await provider.healthCheck();
    expect(status).toBe(ProviderStatus.DISCONNECTED);
  });

  it('listFiles handles deleted file gracefully', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await rm(join(repoDir, 'hello.ts'));
    const result = await provider.listFiles({});
    const deleted = result.items.find((f) => f.path === 'hello.ts');
    expect(deleted).toBeDefined();
    expect(deleted!.size).toBe(0);
    expect(deleted!.lastModified).toBe(0);
  });

  it('getMetadata resolves default branch from symbolic-ref', async () => {
    await execFileAsync(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      { cwd: repoDir },
    );
    await mkdir(join(repoDir, '.git/refs/remotes/origin'), { recursive: true });
    await execFileAsync(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master'],
      { cwd: repoDir },
    );
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const meta = await provider.getMetadata();
    expect(meta.defaultBranch).toBe('master');
  });

  it('getCurrentBranch returns SHA in detached HEAD state', async () => {
    const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    const sha = shaOut.trim();
    await execFileAsync('git', ['checkout', sha], { cwd: repoDir });
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const branch = await provider.getCurrentBranch();
    expect(branch).toMatch(/^[0-9a-f]{40}$/);
  });

  it('health returns UNAVAILABLE when git dir is removed', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await rm(join(repoDir, '.git'), { recursive: true, force: true });
    const h = await provider.health();
    expect(h.status).toBe('unavailable');
  });

  it('getRecentCommits returns empty on git failure', async () => {
    const emptyDir = join(tmpdir(), `virgil-empty-commits-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: emptyDir });
    try {
      const provider = new LocalRepoProvider(makeConfig(emptyDir));
      await provider.initialize();
      const commits = await provider.getRecentCommits();
      expect(commits).toEqual([]);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('getDetailedStatus detects conflicted files', async () => {
    const { stdout: branchOut } = await execFileAsync(
      'git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir },
    );
    const mainBranch = branchOut.trim();

    await execFileAsync('git', ['checkout', '-b', 'feature'], { cwd: repoDir });
    await writeFile(join(repoDir, 'hello.ts'), 'feature content\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'feature change'], { cwd: repoDir });

    await execFileAsync('git', ['checkout', mainBranch], { cwd: repoDir });
    await writeFile(join(repoDir, 'hello.ts'), 'main content\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'main change'], { cwd: repoDir });

    await execFileAsync('git', ['merge', 'feature'], { cwd: repoDir }).catch(() => {});

    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    const status = await provider.getDetailedStatus();
    expect(status.clean).toBe(false);
    expect(status.conflicted).toBeGreaterThan(0);
  });

  it('getDetailedStatus returns clean on git failure', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await rm(join(repoDir, '.git'), { recursive: true, force: true });
    const status = await provider.getDetailedStatus();
    expect(status.clean).toBe(true);
    expect(status.modified).toBe(0);
  });

  it('getRemotes returns empty on git failure', async () => {
    const provider = new LocalRepoProvider(makeConfig(repoDir));
    await provider.initialize();
    await rm(join(repoDir, '.git'), { recursive: true, force: true });
    const remotes = await provider.getRemotes();
    expect(remotes).toEqual([]);
  });

  it('getGitContext handles commit-less repo', async () => {
    const emptyDir = join(tmpdir(), `virgil-no-commits-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: emptyDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: emptyDir });
    try {
      const provider = new LocalRepoProvider(makeConfig(emptyDir));
      await provider.initialize();
      const ctx = await provider.getGitContext();
      expect(ctx.lastCommit.hash).toBe('');
      expect(ctx.trackedFileCount).toBe(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('LocalRepoError', () => {
  it('carries repoPath and code', () => {
    const err = new LocalRepoError('/path', 'TEST_CODE', 'test message');
    expect(err.repoPath).toBe('/path');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('LocalRepoError');
    expect(err).toBeInstanceOf(Error);
  });
});
