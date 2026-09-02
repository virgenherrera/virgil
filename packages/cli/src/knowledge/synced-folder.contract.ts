import type { ContentHash, Timestamp } from '../shared/primitives.js';

/**
 * File discovery result returned by the synced folder integration.
 */
export interface DiscoveredFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Timestamp;
}

/**
 * Content extraction result from the synced folder integration.
 */
export interface ExtractedContent {
  readonly relativePath: string;
  readonly content: string;
  readonly hash: ContentHash;
  readonly mimeType: string;
  readonly extractedAt: Timestamp;
}

/**
 * Change detection result from the synced folder integration.
 */
export interface FileChangeEvent {
  readonly relativePath: string;
  readonly changeType: 'added' | 'modified' | 'deleted';
  readonly previousHash?: ContentHash;
  readonly currentHash?: ContentHash;
  readonly detectedAt: Timestamp;
}

/**
 * Integration contract between the {@link KnowledgeProvider} adapter and
 * `packages/local-indexers/` (H17).
 *
 * This interface defines how the knowledge module discovers files,
 * extracts content, and detects changes in a locally synced folder.
 * Concrete implementations live in the `local-indexers` package;
 * the knowledge module depends only on this contract.
 */
export interface SyncedFolderPort {
  /**
   * Discovers files matching the given patterns within the synced folder.
   *
   * @param rootPath - Absolute path to the synced folder root.
   * @param include - Glob patterns to include.
   * @param exclude - Glob patterns to exclude.
   * @returns Array of discovered files.
   */
  discoverFiles(
    rootPath: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<readonly DiscoveredFile[]>;

  /**
   * Extracts text content from a discovered file.
   *
   * @param filePath - Absolute path to the file.
   * @returns Extracted content with hash.
   */
  extractContent(filePath: string): Promise<ExtractedContent>;

  /**
   * Detects changes since the last known state.
   *
   * @param rootPath - Absolute path to the synced folder root.
   * @param knownHashes - Map of relative path to last known content hash.
   * @returns Array of change events.
   */
  detectChanges(
    rootPath: string,
    knownHashes: ReadonlyMap<string, ContentHash>,
  ): Promise<readonly FileChangeEvent[]>;
}

/** Injection token for the synced folder port. */
export const SYNCED_FOLDER_PORT = Symbol('SYNCED_FOLDER_PORT');

/**
 * Stub implementation of {@link SyncedFolderPort} for testing.
 * Returns configurable fixture data without touching the filesystem.
 */
export class SyncedFolderStub implements SyncedFolderPort {
  private _files: DiscoveredFile[] = [];
  private _content: ExtractedContent | null = null;
  private _changes: FileChangeEvent[] = [];

  /** Configure the stub to return specific files on discovery. */
  setFiles(files: DiscoveredFile[]): void {
    this._files = files;
  }

  /** Configure the stub to return specific content on extraction. */
  setContent(content: ExtractedContent): void {
    this._content = content;
  }

  /** Configure the stub to return specific changes on detection. */
  setChanges(changes: FileChangeEvent[]): void {
    this._changes = changes;
  }

  async discoverFiles(): Promise<readonly DiscoveredFile[]> {
    return this._files;
  }

  async extractContent(): Promise<ExtractedContent> {
    if (!this._content) {
      throw new Error('No content configured in stub');
    }
    return this._content;
  }

  async detectChanges(): Promise<readonly FileChangeEvent[]> {
    return this._changes;
  }
}
