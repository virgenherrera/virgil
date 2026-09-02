import { readFile, readdir, readlink, realpath, stat } from 'node:fs/promises';
import { join, resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from '../contracts/common.types.js';
import { ProviderHealthStatus } from '../contracts/common.types.js';
import type { KnowledgeDocument } from '../contracts/knowledge-provider.types.js';
import type { KnowledgeProvider } from '../contracts/knowledge-provider.types.js';
import type { ContentIdentity } from '../contracts/common.types.js';
import type { ContentHash, SemVer, Timestamp } from '../shared/primitives.js';
import {
  createContentHash,
  createTimestamp,
} from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../shared/provider.types.js';
import { KnowledgeError, KnowledgeErrorCode } from './knowledge.errors.js';
import type { LocalFilesystemSourceConfig } from './knowledge-source.schema.js';

/** Supported file extensions for the local filesystem adapter. */
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.html', '.pdf']);

/** MIME types by extension. */
const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
};

/**
 * Local filesystem adapter implementing the {@link KnowledgeProvider} contract.
 *
 * - Indexes `.md`, `.txt`, `.html`, `.pdf` files.
 * - SHA-256 content hashing for deduplication and cache-hit detection.
 * - Respects exclusion patterns.
 * - No symlink traversal outside the configured root boundary.
 */
export class LocalFilesystemAdapter implements KnowledgeProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private _discoveredFiles: KnowledgeDocument[] = [];
  private _hashCache = new Map<string, ContentHash>();
  private _resolvedRoot: string = '';

  constructor(private readonly config: LocalFilesystemSourceConfig) {
    this.metadata = {
      id: `local-filesystem:${config.rootPath}`,
      name: `Local Filesystem (${config.rootPath})`,
      version: '0.1.0' as SemVer,
      capabilities: [ProviderCapability.KNOWLEDGE],
    };
  }

  get status(): ProviderStatus {
    return this._status;
  }

  // ---------------------------------------------------------------------------
  // Provider lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    try {
      this._resolvedRoot = await realpath(resolve(this.config.rootPath));
      const stats = await stat(this._resolvedRoot);
      if (!stats.isDirectory()) {
        this._status = ProviderStatus.DISCONNECTED;
        throw new KnowledgeError(
          KnowledgeErrorCode.FILESYSTEM_ERROR,
          `Path is not a directory: ${this.config.rootPath}`,
        );
      }
      this._status = ProviderStatus.CONNECTED;
    } catch (error) {
      if (error instanceof KnowledgeError) throw error;
      this._status = ProviderStatus.DISCONNECTED;
      throw new KnowledgeError(
        KnowledgeErrorCode.FILESYSTEM_ERROR,
        `Cannot access directory: ${this.config.rootPath}`,
        { cause: error },
      );
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }
    try {
      const stats = await stat(this._resolvedRoot);
      this._status = stats.isDirectory()
        ? ProviderStatus.CONNECTED
        : ProviderStatus.DISCONNECTED;
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
    }
    return this._status;
  }

  async dispose(): Promise<void> {
    this._status = ProviderStatus.DISCONNECTED;
    this._hashCache.clear();
  }

  // ---------------------------------------------------------------------------
  // KnowledgeProvider contract
  // ---------------------------------------------------------------------------

  async discover(
    scope: DiscoveryScope,
  ): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    const includePatterns = scope.include?.length
      ? scope.include
      : this.config.include;
    const excludePatterns = scope.exclude?.length
      ? scope.exclude
      : this.config.exclude;
    const maxItems = scope.maxItems ?? 100;

    // Use recursive readdir and filter by patterns
    const entries: string[] = (
      await readdir(this._resolvedRoot, { recursive: true })
    ) as string[];
    const allFiles = entries
      .filter((f) => this.matchesAnyPattern(f, includePatterns as string[]))
      .filter((f) => !this.matchesAnyPattern(f, excludePatterns as string[]));

    // Deduplicate
    const uniqueFiles = [...new Set(allFiles)];

    // Filter to supported extensions
    const supportedFiles = uniqueFiles.filter((f) =>
      SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    // Apply maxItems limit
    const filesToProcess = supportedFiles.slice(0, maxItems);

    const documents: KnowledgeDocument[] = [];
    for (const filePath of filesToProcess) {
      const absolutePath = join(this._resolvedRoot, filePath);

      // Symlink boundary check
      if (!(await this.isWithinBoundary(absolutePath))) {
        continue;
      }

      try {
        const doc = await this.fileToDocument(absolutePath, filePath);
        if (doc) documents.push(doc);
      } catch {
        // Skip files that cannot be read
      }
    }

    this._discoveredFiles = documents;

    return {
      items: documents,
      hasMore: supportedFiles.length > maxItems,
      cursor: supportedFiles.length > maxItems ? String(maxItems) : undefined,
    };
  }

  async fetch(identity: ContentIdentity): Promise<KnowledgeDocument> {
    this.ensureInitialised();

    // URI format: file://{rootPath}/{relativePath}
    const relativePath = this.extractRelativePath(identity.uri);
    const absolutePath = join(this._resolvedRoot, relativePath);

    if (!(await this.isWithinBoundary(absolutePath))) {
      throw new KnowledgeError(
        KnowledgeErrorCode.BOUNDARY_VIOLATION,
        `Path escapes root boundary: ${relativePath}`,
      );
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const hash = createContentHash(content);
      const ext = extname(relativePath).toLowerCase();

      return {
        identity: {
          uri: identity.uri,
          hash,
          discoveredAt: createTimestamp(),
        },
        title: relativePath,
        mimeType: MIME_TYPES[ext] ?? 'application/octet-stream',
        content,
        metadata: {
          rootPath: this._resolvedRoot,
          relativePath,
          absolutePath,
        },
      };
    } catch (error) {
      throw new KnowledgeError(
        KnowledgeErrorCode.NOT_FOUND,
        `File not found: ${relativePath}`,
        { cause: error },
      );
    }
  }

  async list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    if (cursor) {
      const offset = parseInt(cursor, 10);
      // Re-discover from offset (simplified pagination)
      return this.discover({ maxItems: 100 });
    }

    return {
      items: this._discoveredFiles,
      hasMore: false,
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    try {
      const stats = await stat(this._resolvedRoot);
      if (stats.isDirectory()) {
        return {
          status: ProviderHealthStatus.HEALTHY,
          lastChecked,
          message: `Directory accessible: ${this.config.rootPath}`,
        };
      }
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message: `Not a directory: ${this.config.rootPath}`,
      };
    } catch (error) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message:
          error instanceof Error ? error.message : 'Filesystem unavailable',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Cache-hit detection
  // ---------------------------------------------------------------------------

  /**
   * Checks whether a file's content has changed since the last discovery.
   * Returns true if the hash matches (cache hit), false otherwise.
   */
  isCacheHit(filePath: string, hash: ContentHash): boolean {
    const cached = this._hashCache.get(filePath);
    return cached === hash;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED) {
      throw new KnowledgeError(
        KnowledgeErrorCode.NOT_INITIALISED,
        'Provider has not been initialised. Call initialize() first.',
      );
    }
  }

  private extractRelativePath(uri: string): string {
    // URI format: file://{rootPath}/{relativePath}
    const prefix = `file://${this._resolvedRoot}/`;
    if (uri.startsWith(prefix)) {
      return uri.slice(prefix.length);
    }
    // Fallback: try stripping file:// and resolving
    if (uri.startsWith('file://')) {
      return uri.slice(7);
    }
    return uri;
  }

  private async isWithinBoundary(absolutePath: string): Promise<boolean> {
    try {
      const fileStat = await stat(absolutePath);

      // Check if it's a symlink and resolve it
      if (fileStat.isSymbolicLink?.()) {
        const target = await readlink(absolutePath);
        const resolvedTarget = resolve(join(absolutePath, '..', target));
        const realTarget = await realpath(resolvedTarget);
        return realTarget.startsWith(this._resolvedRoot);
      }

      // For regular files, just check the real path
      const realPath = await realpath(absolutePath);
      return realPath.startsWith(this._resolvedRoot);
    } catch {
      // If we can't resolve, assume it's fine (stat will fail at read time)
      return true;
    }
  }

  /**
   * Checks if a file path matches any of the given glob-like patterns.
   * Supports `**` for recursive match and `*` for single-segment wildcard.
   */
  private matchesAnyPattern(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      const regex = this.globToRegex(pattern);
      return regex.test(filePath);
    });
  }

  private globToRegex(pattern: string): RegExp {
    let regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '(.*/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${regexStr}$`);
  }

  private async fileToDocument(
    absolutePath: string,
    relativePath: string,
  ): Promise<KnowledgeDocument | null> {
    const content = await readFile(absolutePath, 'utf-8');
    const hash = createContentHash(content);
    const ext = extname(relativePath).toLowerCase();

    // Cache-hit detection: if hash matches, still return the doc but note it
    const cacheHit = this.isCacheHit(relativePath, hash);
    this._hashCache.set(relativePath, hash);

    const discoveredAt = createTimestamp();

    return {
      identity: {
        uri: `file://${this._resolvedRoot}/${relativePath}`,
        hash,
        discoveredAt,
      },
      title: relativePath,
      mimeType: MIME_TYPES[ext] ?? 'application/octet-stream',
      content,
      metadata: {
        rootPath: this._resolvedRoot,
        relativePath,
        absolutePath,
        cacheHit,
      },
    };
  }
}
