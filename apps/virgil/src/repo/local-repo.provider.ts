import { execFile } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { promisify } from 'node:util';
import type {
  ContentIdentity,
  DiscoveryScope,
  FileContent,
  FileEntry,
  GitCommitInfo,
  GitContext,
  PaginatedResult,
  ProviderHealth,
  RepoMetadata,
  RepoProvider,
} from '../contracts/index.js';
import { ProviderHealthStatus } from '../contracts/index.js';
import type { SemVer, Timestamp } from '../shared/primitives.js';
import { createContentHash, createTimestamp } from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../shared/provider.types.js';
import type { LocalRepoConfigEntry } from './repo-config.schema.js';
import type {
  CommitEntry,
  Contributor,
  DetailedStatus,
  RemoteEntry,
} from './repo-metadata.schema.js';
import { LocalRepoError } from './local-repo.error.js';

export { LocalRepoError } from './local-repo.error.js';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 10_000;
const BINARY_CHECK_BYTES = 8192;

export class LocalRepoProvider implements RepoProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private _repoRoot = '';

  constructor(private readonly config: LocalRepoConfigEntry) {
    const id = createContentHash(config.path) as unknown as string;
    this.metadata = {
      id,
      name: config.alias ?? basename(config.path),
      version: '0.0.1' as SemVer,
      capabilities: [ProviderCapability.REPOSITORY],
    };
  }

  get status(): ProviderStatus {
    return this._status;
  }

  get repoRoot(): string {
    return this._repoRoot;
  }

  async initialize(): Promise<void> {
    const resolved = await realpath(this.config.path).catch(() => null);
    if (!resolved) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new LocalRepoError(
        this.config.path,
        'PATH_NOT_FOUND',
        `Path does not exist: ${this.config.path}`,
      );
    }

    const statResult = await stat(resolved).catch(() => null);
    if (!statResult?.isDirectory()) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new LocalRepoError(
        this.config.path,
        'NOT_A_DIRECTORY',
        `Path is not a directory: ${resolved}`,
      );
    }

    try {
      const { stdout } = await this.git(
        ['rev-parse', '--show-toplevel'],
        resolved,
      );
      this._repoRoot = stdout.trim();
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
      throw new LocalRepoError(
        this.config.path,
        'NOT_A_GIT_REPO',
        `Path is not a Git repository: ${resolved}`,
      );
    }

    this._status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }

    try {
      await this.git(['rev-parse', '--git-dir']);
      this._status = ProviderStatus.CONNECTED;
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
    }

    return this._status;
  }

  async dispose(): Promise<void> {
    this._status = ProviderStatus.DISCONNECTED;
  }

  async listFiles(scope: DiscoveryScope): Promise<PaginatedResult<FileEntry>> {
    this.ensureInitialised();

    const maxItems = scope.maxItems ?? this.config.maxFiles;
    const cursorStart = 0;

    const { stdout } = await this.git(['ls-files', '-z']);
    const allPaths = stdout.split('\0').filter((p) => p.length > 0);

    let filtered = allPaths;
    if (scope.maxDepth !== undefined) {
      filtered = filtered.filter(
        (p) => p.split(sep === '\\' ? /[\\/]/ : '/').length <= scope.maxDepth!,
      );
    }

    if (scope.include?.length) {
      filtered = filtered.filter((p) =>
        scope.include!.some((pattern) => matchGlob(p, pattern)),
      );
    }
    if (scope.exclude?.length) {
      filtered = filtered.filter(
        (p) => !scope.exclude!.some((pattern) => matchGlob(p, pattern)),
      );
    }

    const bounded = filtered.slice(cursorStart, cursorStart + maxItems);
    const hasMore = filtered.length > cursorStart + maxItems;

    const items: FileEntry[] = await Promise.all(
      bounded.map(async (filePath) => {
        const absPath = join(this._repoRoot, filePath);
        try {
          const fileStat = await stat(absPath);
          return {
            path: filePath,
            mimeType: mimeFromExtension(filePath),
            size: fileStat.size,
            lastModified: fileStat.mtimeMs as Timestamp,
          } satisfies FileEntry;
        } catch {
          return {
            path: filePath,
            size: 0,
            lastModified: 0 as Timestamp,
          } satisfies FileEntry;
        }
      }),
    );

    const sinceFiltered = scope.since
      ? items.filter((f) => f.lastModified >= scope.since!)
      : items;

    return {
      items: sinceFiltered,
      hasMore,
      cursor: hasMore ? String(cursorStart + maxItems) : undefined,
    };
  }

  async readFile(filePath: string): Promise<FileContent> {
    this.ensureInitialised();

    const absPath = join(this._repoRoot, filePath);
    const fileStat = await stat(absPath).catch(() => null);
    if (!fileStat) {
      throw new LocalRepoError(
        this.config.path,
        'FILE_NOT_FOUND',
        `File not found: ${filePath}`,
      );
    }

    if (fileStat.size > this.config.maxFileSize) {
      throw new LocalRepoError(
        this.config.path,
        'FILE_TOO_LARGE',
        `File exceeds size limit (${fileStat.size} > ${this.config.maxFileSize}): ${filePath}`,
      );
    }

    const content = await readFile(absPath);
    if (isBinary(content)) {
      throw new LocalRepoError(
        this.config.path,
        'BINARY_FILE',
        `File appears to be binary: ${filePath}`,
      );
    }

    const textContent = content.toString('utf-8');
    const hash = createContentHash(textContent);
    const identity: ContentIdentity = {
      uri: `file://${absPath}`,
      hash,
      discoveredAt: createTimestamp(),
    };

    return { path: filePath, content: textContent, identity };
  }

  async getMetadata(): Promise<RepoMetadata> {
    this.ensureInitialised();

    const name = this.config.alias ?? basename(this._repoRoot);
    const remotes = await this.getRemotes();
    const primaryRemoteUrl = remotes.length > 0 ? remotes[0].url : '';

    let defaultBranch: string;
    try {
      const { stdout } = await this.git([
        'symbolic-ref',
        '--short',
        'refs/remotes/origin/HEAD',
      ]);
      defaultBranch = stdout.trim().replace(/^origin\//, '');
    } catch {
      try {
        const { stdout } = await this.git([
          'rev-parse',
          '--abbrev-ref',
          'HEAD',
        ]);
        defaultBranch = stdout.trim();
      } catch {
        defaultBranch = 'main';
      }
    }

    const identitySource = primaryRemoteUrl
      ? `${primaryRemoteUrl}::${this._repoRoot}`
      : this._repoRoot;
    const hash = createContentHash(identitySource);

    const identity: ContentIdentity = {
      uri: primaryRemoteUrl || `file://${this._repoRoot}`,
      hash,
      discoveredAt: createTimestamp(),
    };

    return {
      name,
      root: this._repoRoot,
      defaultBranch,
      remotes: remotes.map((r) => r.url),
      identity,
    };
  }

  async getGitContext(): Promise<GitContext> {
    this.ensureInitialised();

    const currentBranch = await this.getCurrentBranch();
    const lastCommit = await this.getLastCommit();
    const detailedStatus = await this.getDetailedStatus();
    const trackedFileCount = await this.getTrackedFileCount();

    return {
      currentBranch,
      lastCommit,
      isDirty: !detailedStatus.clean,
      trackedFileCount,
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    try {
      await this.git(['rev-parse', '--git-dir']);
      return {
        status: ProviderHealthStatus.HEALTHY,
        lastChecked,
        message: `Repository at ${this._repoRoot} is accessible`,
      };
    } catch (error) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message:
          error instanceof Error ? error.message : 'Repository unavailable',
      };
    }
  }

  async getCurrentBranch(): Promise<string> {
    this.ensureInitialised();
    try {
      const { stdout } = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = stdout.trim();
      if (branch === 'HEAD') {
        const { stdout: sha } = await this.git(['rev-parse', 'HEAD']);
        return sha.trim();
      }
      return branch;
    } catch {
      return 'HEAD';
    }
  }

  async getRecentCommits(max?: number): Promise<CommitEntry[]> {
    this.ensureInitialised();
    const limit = max ?? this.config.maxCommits;

    try {
      const { stdout } = await this.git([
        'log',
        `--format=%H%x00%an%x00%ae%x00%aI%x00%s`,
        `-n`,
        String(limit),
      ]);

      if (!stdout.trim()) return [];

      return stdout
        .replace(/\n$/, '')
        .split('\n')
        .map((line) => {
          const [sha, authorName, authorEmail, date, subject] =
            line.split('\0');
          return { sha, authorName, authorEmail, date, subject };
        });
    } catch {
      return [];
    }
  }

  async getContributors(max?: number): Promise<Contributor[]> {
    const commits = await this.getRecentCommits(max);
    const byEmail = new Map<
      string,
      { name: string; email: string; count: number }
    >();

    for (const commit of commits) {
      const existing = byEmail.get(commit.authorEmail);
      if (existing) {
        existing.count++;
      } else {
        byEmail.set(commit.authorEmail, {
          name: commit.authorName,
          email: commit.authorEmail,
          count: 1,
        });
      }
    }

    return Array.from(byEmail.values()).map((entry) => ({
      name: entry.name,
      email: entry.email,
      commitCount: entry.count,
    }));
  }

  async getDetailedStatus(): Promise<DetailedStatus> {
    this.ensureInitialised();

    try {
      const { stdout } = await this.git(['status', '--porcelain']);

      if (!stdout.trim()) {
        return {
          clean: true,
          modified: 0,
          staged: 0,
          untracked: 0,
          conflicted: 0,
        };
      }

      let modified = 0;
      let staged = 0;
      let untracked = 0;
      let conflicted = 0;

      for (const line of stdout.replace(/\n$/, '').split('\n')) {
        if (line.length < 2) continue;
        const x = line[0];
        const y = line[1];

        if (
          x === 'U' ||
          y === 'U' ||
          (x === 'A' && y === 'A') ||
          (x === 'D' && y === 'D')
        ) {
          conflicted++;
        } else if (x === '?' && y === '?') {
          untracked++;
        } else {
          if (x !== ' ' && x !== '?') staged++;
          if (y !== ' ' && y !== '?') modified++;
        }
      }

      return { clean: false, modified, staged, untracked, conflicted };
    } catch {
      return {
        clean: true,
        modified: 0,
        staged: 0,
        untracked: 0,
        conflicted: 0,
      };
    }
  }

  async getRemotes(): Promise<RemoteEntry[]> {
    this.ensureInitialised();

    try {
      const { stdout } = await this.git(['remote', '-v']);
      if (!stdout.trim()) return [];

      const seen = new Set<string>();
      const remotes: RemoteEntry[] = [];

      for (const line of stdout.trim().split('\n')) {
        const match = /^(\S+)\t(\S+)\s+\(fetch\)$/.exec(line);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          remotes.push({ name: match[1], url: match[2] });
        }
      }

      return remotes;
    } catch {
      return [];
    }
  }

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED || !this._repoRoot) {
      throw new LocalRepoError(
        this.config.path,
        'NOT_INITIALISED',
        'Provider has not been initialised. Call initialize() first.',
      );
    }
  }

  private async git(
    args: string[],
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, {
      cwd: cwd ?? this._repoRoot,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
    });
  }

  private async getLastCommit(): Promise<GitCommitInfo> {
    try {
      const { stdout } = await this.git([
        'log',
        '-1',
        '--format=%H%x00%s%x00%at',
      ]);
      const [hash, message, timestampStr] = stdout.trim().split('\0');
      return {
        hash,
        message,
        timestamp: (Number(timestampStr) * 1000) as Timestamp,
      };
    } catch {
      return {
        hash: '',
        message: '',
        timestamp: 0 as Timestamp,
      };
    }
  }

  private async getTrackedFileCount(): Promise<number> {
    try {
      const { stdout } = await this.git(['ls-files']);
      if (!stdout.trim()) return 0;
      return stdout.trim().split('\n').length;
    } catch {
      return 0;
    }
  }
}

function matchGlob(filePath: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
}

function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, BINARY_CHECK_BYTES);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function mimeFromExtension(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    ts: 'text/typescript',
    tsx: 'text/typescript',
    js: 'text/javascript',
    jsx: 'text/javascript',
    json: 'application/json',
    md: 'text/markdown',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    html: 'text/html',
    css: 'text/css',
    txt: 'text/plain',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return ext ? mimeMap[ext] : undefined;
}
