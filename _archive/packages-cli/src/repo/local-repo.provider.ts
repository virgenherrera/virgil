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

const execFileAsync = promisify(execFile);

/** Default timeout for spawned git commands (10 seconds). */
const GIT_TIMEOUT_MS = 10_000;

/** Null-byte check window for binary detection. */
const BINARY_CHECK_BYTES = 8192;

/**
 * Concrete `RepoProvider` adapter that extracts structured, Git-aware
 * metadata from a single local repository via spawned `git` CLI commands.
 *
 * Each instance is bound to one configured repository path. Use
 * `LocalRepoProviderFactory` to create instances through the DI container.
 */
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

  /** The resolved absolute root path of the repository. Available after `initialize()`. */
  get repoRoot(): string {
    return this._repoRoot;
  }

  // ---------------------------------------------------------------------------
  // Provider lifecycle
  // ---------------------------------------------------------------------------

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

    // Validate it is a git repository by running git rev-parse
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

  // ---------------------------------------------------------------------------
  // RepoProvider contract
  // ---------------------------------------------------------------------------

  async listFiles(scope: DiscoveryScope): Promise<PaginatedResult<FileEntry>> {
    this.ensureInitialised();

    const maxItems = scope.maxItems ?? this.config.maxFiles;
    const cursorStart = 0;

    // git ls-files outputs tracked files, respecting .gitignore
    const { stdout } = await this.git(['ls-files', '-z']);
    const allPaths = stdout.split('\0').filter((p) => p.length > 0);

    // Apply depth filter
    let filtered = allPaths;
    if (scope.maxDepth !== undefined) {
      filtered = filtered.filter(
        (p) => p.split(sep === '\\' ? /[\\/]/ : '/').length <= scope.maxDepth!,
      );
    }

    // Apply include/exclude glob patterns (simple prefix/suffix matching)
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

    // Enforce maximum item bound
    const bounded = filtered.slice(cursorStart, cursorStart + maxItems);
    const hasMore = filtered.length > cursorStart + maxItems;

    // Stat each file to get size and mtime
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

    // Apply since filter after stat
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

    // Check for binary content
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

    // Determine default branch
    let defaultBranch: string;
    try {
      const { stdout } = await this.git([
        'symbolic-ref',
        '--short',
        'refs/remotes/origin/HEAD',
      ]);
      defaultBranch = stdout.trim().replace(/^origin\//, '');
    } catch {
      // Fallback: use current branch or 'main'
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

    // Build deterministic identity hash from remote URL + root path
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

  // ---------------------------------------------------------------------------
  // Extended methods (beyond RepoProvider contract)
  // ---------------------------------------------------------------------------

  /** Returns the current branch name, or the HEAD SHA in detached HEAD state. */
  async getCurrentBranch(): Promise<string> {
    this.ensureInitialised();
    try {
      const { stdout } = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = stdout.trim();
      if (branch === 'HEAD') {
        // Detached HEAD: return the SHA
        const { stdout: sha } = await this.git(['rev-parse', 'HEAD']);
        return sha.trim();
      }
      return branch;
    } catch {
      return 'HEAD';
    }
  }

  /** Returns bounded recent commits from the current branch. */
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

  /** Returns deduplicated contributors from the recent commit range. */
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

  /** Returns structured working-tree status with per-category counts. */
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

      // Split on newlines, trimming only trailing whitespace to preserve
      // the leading space in porcelain status codes (e.g. ' M file.txt').
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

  /** Returns the list of configured remotes with name and URL. */
  async getRemotes(): Promise<RemoteEntry[]> {
    this.ensureInitialised();

    try {
      const { stdout } = await this.git(['remote', '-v']);
      if (!stdout.trim()) return [];

      const seen = new Set<string>();
      const remotes: RemoteEntry[] = [];

      for (const line of stdout.trim().split('\n')) {
        // Format: name\turl (fetch|push)
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
      // Empty repository
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

/**
 * Structured error surfaced by `LocalRepoProvider` operations. Carries the
 * repository path and a machine-readable error code for programmatic handling.
 */
export class LocalRepoError extends Error {
  constructor(
    readonly repoPath: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LocalRepoError';
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Simple glob matching: supports `*` as wildcard and `**` for recursive. */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
}

/** Detects binary content by checking for null bytes in the first N bytes. */
function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, BINARY_CHECK_BYTES);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/** Derives a MIME type from a file extension. Returns undefined for unknown extensions. */
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
