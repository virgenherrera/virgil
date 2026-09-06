import { ConfluenceCdpAdapter } from '../../src/knowledge/confluence-cdp.adapter.js';
import { KnowledgeError, KnowledgeErrorCode } from '../../src/knowledge/knowledge.errors.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { CdpBrowserPort, CdpExecutionResult } from '../../src/knowledge/confluence-page.pom.js';

function createMockCdp(overrides?: Partial<CdpBrowserPort>): CdpBrowserPort {
  return {
    launch: vi.fn().mockResolvedValue(undefined),
    executePom: vi.fn().mockResolvedValue({
      content: {
        title: 'Test Page',
        content: '<p>Test content</p>',
        childLinks: [],
      },
      provenance: { targetApp: 'confluence', url: 'https://wiki.example.com', pomVersion: '1.0.0' },
      contentHash: 'a'.repeat(64),
      extractedAt: new Date().toISOString(),
      metadata: { browser: 'chrome', profilePath: '', durationMs: 100 },
    } satisfies CdpExecutionResult),
    detach: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseConfig = {
  type: 'confluence-cdp' as const,
  baseUrl: 'https://wiki.example.com',
  browser: 'chrome' as const,
  headless: true,
};

describe('ConfluenceCdpAdapter', () => {
  describe('metadata', () => {
    it('builds provider id from hostname', () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      expect(adapter.metadata.id).toBe('confluence-cdp:wiki.example.com');
    });

    it('starts with REGISTERED status', () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize', () => {
    it('transitions to CONNECTED when CDP is available', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
      expect(cdp.launch).toHaveBeenCalledWith({
        browser: 'chrome',
        headless: true,
        profilePath: undefined,
      });
    });

    it('throws CDP_ERROR when CDP is null', async () => {
      const adapter = new ConfluenceCdpAdapter(baseConfig, null);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws CDP_ERROR when browser launch fails', async () => {
      const cdp = createMockCdp({
        launch: vi.fn().mockRejectedValue(new Error('Browser not found')),
      });
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck', () => {
    it('returns DISCONNECTED when CDP is null', async () => {
      const adapter = new ConfluenceCdpAdapter(baseConfig, null);
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('returns current status when CDP is available', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('discover', () => {
    it('throws when not initialised', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
    });

    it('returns main page document', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      const result = await adapter.discover({});
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0].title).toBe('Test Page');
      expect(result.hasMore).toBe(false);
    });

    it('follows child links up to maxItems', async () => {
      const cdp = createMockCdp({
        executePom: vi.fn()
          .mockResolvedValueOnce({
            content: {
              title: 'Parent',
              content: '<p>Parent</p>',
              childLinks: ['https://wiki.example.com/child1', 'https://wiki.example.com/child2'],
            },
            provenance: { targetApp: 'confluence', url: 'https://wiki.example.com', pomVersion: '1.0.0' },
            contentHash: 'a'.repeat(64),
            extractedAt: new Date().toISOString(),
            metadata: { browser: 'chrome', profilePath: '', durationMs: 100 },
          })
          .mockResolvedValue({
            content: { title: 'Child', content: '<p>Child</p>', childLinks: [] },
            provenance: { targetApp: 'confluence', url: 'https://wiki.example.com/child1', pomVersion: '1.0.0' },
            contentHash: 'b'.repeat(64),
            extractedAt: new Date().toISOString(),
            metadata: { browser: 'chrome', profilePath: '', durationMs: 50 },
          }),
      });
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      const result = await adapter.discover({ maxItems: 10, maxDepth: 1 });
      expect(result.items.length).toBeGreaterThan(1);
    });
  });

  describe('fetch', () => {
    it('fetches a page by identity URI', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      const doc = await adapter.fetch({
        uri: 'https://wiki.example.com/page/123',
        hash: '0'.repeat(64) as any,
        discoveredAt: Date.now() as any,
      });
      expect(doc.title).toBe('Test Page');
    });

    it('wraps CDP errors in KnowledgeError', async () => {
      const cdp = createMockCdp({
        executePom: vi.fn().mockRejectedValue(new Error('CDP crash')),
      });
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      await expect(
        adapter.fetch({
          uri: 'https://wiki.example.com/broken',
          hash: '0'.repeat(64) as any,
          discoveredAt: Date.now() as any,
        }),
      ).rejects.toThrow(KnowledgeError);
    });
  });

  describe('list', () => {
    it('returns discovered pages', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      await adapter.discover({});
      const result = await adapter.list();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('health', () => {
    it('returns HEALTHY when connected', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns UNAVAILABLE when CDP is null', async () => {
      const adapter = new ConfluenceCdpAdapter(baseConfig, null);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });

    it('returns UNAVAILABLE when not connected but CDP exists', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(h.message).toBe('CDP browser is not connected');
    });
  });

  describe('dispose', () => {
    it('closes the browser and transitions to DISCONNECTED', async () => {
      const cdp = createMockCdp();
      const adapter = new ConfluenceCdpAdapter(baseConfig, cdp);
      await adapter.initialize();
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
      expect(cdp.close).toHaveBeenCalled();
    });
  });
});
