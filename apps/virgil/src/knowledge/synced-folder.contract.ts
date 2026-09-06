import type { ContentHash, Timestamp } from '../shared/primitives.js';

export interface DiscoveredFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Timestamp;
}

export interface ExtractedContent {
  readonly relativePath: string;
  readonly content: string;
  readonly hash: ContentHash;
  readonly mimeType: string;
  readonly extractedAt: Timestamp;
}

export interface FileChangeEvent {
  readonly relativePath: string;
  readonly changeType: 'added' | 'modified' | 'deleted';
  readonly previousHash?: ContentHash;
  readonly currentHash?: ContentHash;
  readonly detectedAt: Timestamp;
}

export interface SyncedFolderPort {
  discoverFiles(rootPath: string, include: readonly string[], exclude: readonly string[]): Promise<readonly DiscoveredFile[]>;
  extractContent(filePath: string): Promise<ExtractedContent>;
  detectChanges(rootPath: string, knownHashes: ReadonlyMap<string, ContentHash>): Promise<readonly FileChangeEvent[]>;
}

export const SYNCED_FOLDER_PORT = Symbol('SYNCED_FOLDER_PORT');

export class SyncedFolderStub implements SyncedFolderPort {
  private _files: DiscoveredFile[] = [];
  private _content: ExtractedContent | null = null;
  private _changes: FileChangeEvent[] = [];

  setFiles(files: DiscoveredFile[]): void { this._files = files; }
  setContent(content: ExtractedContent): void { this._content = content; }
  setChanges(changes: FileChangeEvent[]): void { this._changes = changes; }

  async discoverFiles(): Promise<readonly DiscoveredFile[]> { return this._files; }
  async extractContent(): Promise<ExtractedContent> {
    if (!this._content) throw new Error('No content configured in stub');
    return this._content;
  }
  async detectChanges(): Promise<readonly FileChangeEvent[]> { return this._changes; }
}
