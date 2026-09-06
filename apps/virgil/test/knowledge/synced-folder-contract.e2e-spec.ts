import type { SyncedFolderPort, DiscoveredFile, ExtractedContent, FileChangeEvent } from '../../src/knowledge/synced-folder.contract.js';
import { SyncedFolderStub, SYNCED_FOLDER_PORT } from '../../src/knowledge/synced-folder.contract.js';
import type { ContentHash, Timestamp } from '../../src/shared/primitives.js';

describe('SyncedFolderPort', () => {
  it('SYNCED_FOLDER_PORT is a unique symbol', () => {
    expect(typeof SYNCED_FOLDER_PORT).toBe('symbol');
    expect(SYNCED_FOLDER_PORT.toString()).toContain('SYNCED_FOLDER_PORT');
  });
});

describe('SyncedFolderStub', () => {
  let stub: SyncedFolderStub;

  beforeEach(() => {
    stub = new SyncedFolderStub();
  });

  it('returns empty arrays by default', async () => {
    const files = await stub.discoverFiles('/root', ['**/*.md'], []);
    expect(files).toEqual([]);
  });

  it('returns configured files', async () => {
    const mockFiles: DiscoveredFile[] = [
      {
        relativePath: 'docs/readme.md',
        absolutePath: '/root/docs/readme.md',
        mimeType: 'text/markdown',
        sizeBytes: 1024,
        modifiedAt: Date.now() as Timestamp,
      },
    ];
    stub.setFiles(mockFiles);
    const files = await stub.discoverFiles('/root', ['**/*.md'], []);
    expect(files).toEqual(mockFiles);
  });

  it('returns configured content', async () => {
    const mockContent: ExtractedContent = {
      relativePath: 'docs/readme.md',
      content: '# Hello',
      hash: 'a'.repeat(64) as ContentHash,
      mimeType: 'text/markdown',
      extractedAt: Date.now() as Timestamp,
    };
    stub.setContent(mockContent);
    const content = await stub.extractContent('/root/docs/readme.md');
    expect(content).toEqual(mockContent);
  });

  it('throws when no content configured', async () => {
    await expect(
      stub.extractContent('/root/docs/readme.md'),
    ).rejects.toThrow('No content configured in stub');
  });

  it('returns configured changes', async () => {
    const mockChanges: FileChangeEvent[] = [
      {
        relativePath: 'docs/readme.md',
        changeType: 'modified',
        previousHash: 'a'.repeat(64) as ContentHash,
        currentHash: 'b'.repeat(64) as ContentHash,
        detectedAt: Date.now() as Timestamp,
      },
    ];
    stub.setChanges(mockChanges);
    const changes = await stub.detectChanges('/root', new Map());
    expect(changes).toEqual(mockChanges);
  });
});
