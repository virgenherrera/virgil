import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFilesystemAdapter } from '../../src/knowledge/local-filesystem.adapter.js';
import { KnowledgeError, KnowledgeErrorCode } from '../../src/knowledge/knowledge.errors.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';

describe('LocalFilesystemAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'virgil-test-'));
    await writeFile(join(tempDir, 'readme.md'), '# Hello');
    await writeFile(join(tempDir, 'notes.txt'), 'Some notes');
    await mkdir(join(tempDir, 'sub'), { recursive: true });
    await writeFile(join(tempDir, 'sub', 'deep.md'), '## Deep');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createAdapter(overrides?: Record<string, unknown>) {
    return new LocalFilesystemAdapter({
      type: 'local-filesystem',
      rootPath: tempDir,
      include: ['**/*.md', '**/*.txt', '**/*.html', '**/*.pdf'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      ...overrides,
    } as any);
  }

  describe('metadata', () => {
    it('has correct provider id format', () => {
      const adapter = createAdapter();
      expect(adapter.metadata.id).toBe(`local-filesystem:${tempDir}`);
    });

    it('starts with REGISTERED status', () => {
      const adapter = createAdapter();
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize', () => {
    it('transitions to CONNECTED for a valid directory', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws FILESYSTEM_ERROR for non-existent path', async () => {
      const adapter = createAdapter({ rootPath: '/nonexistent/path' });
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
    });

    it('throws FILESYSTEM_ERROR for a file path', async () => {
      const adapter = createAdapter({ rootPath: join(tempDir, 'readme.md') });
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
    });
  });

  describe('discover', () => {
    it('discovers supported files recursively', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.discover({});
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });

    it('respects maxItems limit', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.discover({ maxItems: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('produces documents with content hashes', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.discover({});
      for (const doc of result.items) {
        expect(doc.identity.hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('sets correct MIME types', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.discover({});
      const mdDoc = result.items.find((d) => d.title.endsWith('.md'));
      const txtDoc = result.items.find((d) => d.title.endsWith('.txt'));
      expect(mdDoc?.mimeType).toBe('text/markdown');
      expect(txtDoc?.mimeType).toBe('text/plain');
    });

    it('throws when not initialised', async () => {
      const adapter = createAdapter();
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
    });
  });

  describe('fetch', () => {
    it('fetches a file by URI', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const discovered = await adapter.discover({});
      const first = discovered.items[0];
      const doc = await adapter.fetch(first.identity);
      expect(doc.content).toBeTruthy();
      expect(doc.identity.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws NOT_FOUND for missing file', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await expect(
        adapter.fetch({
          uri: `file://${tempDir}/nonexistent.md`,
          hash: '0'.repeat(64) as any,
          discoveredAt: Date.now() as any,
        }),
      ).rejects.toThrow(KnowledgeError);
    });

    it('throws BOUNDARY_VIOLATION for path escaping root', async () => {
      const outsideDir = await mkdtemp(join(tmpdir(), 'virgil-outside-'));
      await writeFile(join(outsideDir, 'secret.md'), 'secret');
      try {
        const adapter = createAdapter();
        await adapter.initialize();
        await expect(
          adapter.fetch({
            uri: `../../${outsideDir.split('/').pop()}/secret.md`,
            hash: '0'.repeat(64) as any,
            discoveredAt: Date.now() as any,
          }),
        ).rejects.toThrow(KnowledgeError);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe('list', () => {
    it('returns discovered files after discover', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await adapter.discover({});
      const result = await adapter.list();
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.hasMore).toBe(false);
    });

    it('re-discovers when cursor is provided', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.list('next-page');
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('health', () => {
    it('returns HEALTHY for accessible directory', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns UNAVAILABLE when directory is removed', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await rm(tempDir, { recursive: true, force: true });
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      await mkdir(tempDir, { recursive: true });
    });

    it('returns UNAVAILABLE when root becomes a file', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await rm(tempDir, { recursive: true, force: true });
      await writeFile(tempDir, 'not a directory');
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(h.message).toContain('Not a directory');
    });
  });

  describe('dispose', () => {
    it('transitions to DISCONNECTED', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck', () => {
    it('returns REGISTERED when not initialised', async () => {
      const adapter = createAdapter();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED for accessible directory', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it('returns DISCONNECTED when directory is removed', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      await rm(tempDir, { recursive: true, force: true });
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
      await mkdir(tempDir, { recursive: true });
    });
  });

  describe('boundary check', () => {
    it('blocks symlinks escaping root', async () => {
      const outsideDir = await mkdtemp(join(tmpdir(), 'virgil-outside-'));
      await writeFile(join(outsideDir, 'secret.md'), 'secret content');
      await symlink(
        join(outsideDir, 'secret.md'),
        join(tempDir, 'escape.md'),
      );

      const adapter = createAdapter();
      await adapter.initialize();
      const result = await adapter.discover({});
      const escaped = result.items.find((d) => d.title.includes('escape'));
      expect(escaped).toBeUndefined();

      await rm(outsideDir, { recursive: true, force: true });
    });
  });

  describe('cache hit detection', () => {
    it('detects unchanged files on second discovery', async () => {
      const adapter = createAdapter();
      await adapter.initialize();
      const first = await adapter.discover({});
      const second = await adapter.discover({});
      const doc = second.items.find((d) => d.title.includes('readme'));
      expect(doc?.metadata?.['cacheHit']).toBe(true);
    });
  });
});
