import { ConfluenceApiAdapter, stripConfluenceStorageToMarkdown } from '../../src/knowledge/confluence-api.adapter.js';
import { KnowledgeError, KnowledgeErrorCode } from '../../src/knowledge/knowledge.errors.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { IHttpClient, HttpResponse } from '../../src/knowledge/knowledge-http-client.js';

function makeResponse(status: number, body: unknown = {}): HttpResponse {
  return {
    status,
    headers: { get: (_n: string) => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function createMockHttp(responses: Map<string, HttpResponse>): IHttpClient {
  return {
    get: vi.fn(async (url: string) => {
      for (const [pattern, response] of responses) {
        if (url.includes(pattern)) return response;
      }
      return makeResponse(404);
    }),
  };
}

const baseConfig = {
  type: 'confluence-api' as const,
  baseUrl: 'https://wiki.example.com',
  email: 'user@example.com',
  apiToken: 'tok-123',
  spaceKey: 'ENG',
  perPage: 25,
};

describe('stripConfluenceStorageToMarkdown', () => {
  it('converts headings', () => {
    const html = '<h1>Title</h1>';
    expect(stripConfluenceStorageToMarkdown(html)).toContain('# Title');
  });

  it('converts paragraphs', () => {
    const html = '<p>Hello world</p>';
    expect(stripConfluenceStorageToMarkdown(html)).toContain('Hello world');
  });

  it('converts list items', () => {
    const html = '<li>Item one</li><li>Item two</li>';
    const result = stripConfluenceStorageToMarkdown(html);
    expect(result).toContain('- Item one');
    expect(result).toContain('- Item two');
  });

  it('converts code blocks', () => {
    const html =
      '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body></ac:structured-macro>';
    const result = stripConfluenceStorageToMarkdown(html);
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
  });

  it('strips remaining tags', () => {
    const html = '<div><span>plain text</span></div>';
    const result = stripConfluenceStorageToMarkdown(html);
    expect(result).not.toContain('<');
    expect(result).toContain('plain text');
  });

  it('normalises excessive newlines', () => {
    const html = '<p>A</p><p></p><p></p><p></p><p>B</p>';
    const result = stripConfluenceStorageToMarkdown(html);
    expect(result).not.toMatch(/\n{4,}/);
  });
});

describe('ConfluenceApiAdapter', () => {
  describe('metadata', () => {
    it('builds provider id from spaceKey', () => {
      const http = createMockHttp(new Map());
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      expect(adapter.metadata.id).toBe('confluence-api:ENG');
    });

    it('starts with REGISTERED status', () => {
      const http = createMockHttp(new Map());
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize', () => {
    it('transitions to CONNECTED on 200', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws AUTH_FAILED on 401', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(401)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
      expect(adapter.status).toBe(ProviderStatus.DEGRADED);
    });

    it('throws PERMISSION_DENIED on 403', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(403)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
    });

    it('throws HTTP_ERROR on unexpected status', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(500)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('wraps network errors in KnowledgeError', async () => {
      const http: IHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(KnowledgeError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('discover', () => {
    it('throws when not initialised', async () => {
      const http = createMockHttp(new Map());
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
    });

    it('returns paginated documents', async () => {
      const searchBody = {
        results: [
          {
            id: '123',
            title: 'Page One',
            body: { storage: { value: '<p>Hello</p>' } },
            version: { number: 1 },
          },
        ],
        _links: { next: '/next-page' },
      };
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['search', makeResponse(200, searchBody)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const result = await adapter.discover({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Page One');
      expect(result.hasMore).toBe(true);
    });

    it('throws RATE_LIMITED on 429', async () => {
      vi.useFakeTimers();
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['search', makeResponse(429)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const promise = adapter.discover({});
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await expect(promise).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });

    it('applies include filter to CQL query', async () => {
      const searchBody = {
        results: [],
        _links: {},
      };
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['search', makeResponse(200, searchBody)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await adapter.discover({ include: ['Architecture'] });
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('Architecture'),
        expect.any(Object),
      );
    });

    it('throws AUTH_FAILED on 401 via assertOk', async () => {
      vi.useFakeTimers();
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(401));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });

    it('throws PERMISSION_DENIED on 403 via assertOk', async () => {
      vi.useFakeTimers();
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(403));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });

    it('throws HTTP_ERROR on 500 via assertOk', async () => {
      vi.useFakeTimers();
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(500));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(adapter.discover({})).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });
  });

  describe('fetch', () => {
    it('fetches a page by identity URI', async () => {
      const pageBody = {
        id: '456',
        title: 'Fetched Page',
        body: { storage: { value: '<h1>Heading</h1>' } },
        version: { number: 2 },
      };
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['pages/456', makeResponse(200, pageBody)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const doc = await adapter.fetch({
        uri: 'confluence://ENG/456',
        hash: '0'.repeat(64) as any,
        discoveredAt: Date.now() as any,
      });
      expect(doc.title).toBe('Fetched Page');
      expect(doc.content).toContain('# Heading');
    });

    it('throws NOT_FOUND on 404', async () => {
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['pages/', makeResponse(404)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(
        adapter.fetch({
          uri: 'confluence://ENG/999',
          hash: '0'.repeat(64) as any,
          discoveredAt: Date.now() as any,
        }),
      ).rejects.toThrow(KnowledgeError);
    });

    it('throws PERMISSION_DENIED on 403', async () => {
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['pages/', makeResponse(403)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(
        adapter.fetch({
          uri: 'confluence://ENG/888',
          hash: '0'.repeat(64) as any,
          discoveredAt: Date.now() as any,
        }),
      ).rejects.toThrow(KnowledgeError);
    });

    it('throws RATE_LIMITED on 429 after retries', async () => {
      vi.useFakeTimers();
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(429));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const promise = adapter.fetch({
        uri: 'confluence://ENG/777',
        hash: '0'.repeat(64) as any,
        discoveredAt: Date.now() as any,
      });
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await expect(promise).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });

    it('fetches by numeric page ID', async () => {
      const pageBody = {
        id: '123',
        title: 'Numeric Page',
        body: { storage: { value: '<p>Content</p>' } },
        version: { number: 1 },
      };
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['pages/123', makeResponse(200, pageBody)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const doc = await adapter.fetch({
        uri: '123',
        hash: '0'.repeat(64) as any,
        discoveredAt: Date.now() as any,
      });
      expect(doc.title).toBe('Numeric Page');
    });

    it('throws PARSE_ERROR for invalid URI', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(
        adapter.fetch({
          uri: 'invalid-uri',
          hash: '0'.repeat(64) as any,
          discoveredAt: Date.now() as any,
        }),
      ).rejects.toThrow(KnowledgeError);
    });
  });

  describe('list', () => {
    it('returns discovered pages without cursor', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const result = await adapter.list();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('fetches next page when cursor is provided', async () => {
      const nextBody = {
        results: [
          {
            id: '555',
            title: 'Next Page',
            body: { storage: { value: '<p>Next</p>' } },
            version: { number: 1 },
          },
        ],
        _links: {},
      };
      const http = createMockHttp(
        new Map([
          ['spaces', makeResponse(200)],
          ['next-page', makeResponse(200, nextBody)],
        ]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const result = await adapter.list('/next-page');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Next Page');
      expect(result.hasMore).toBe(false);
    });

    it('throws AUTH_FAILED on 401 via list cursor', async () => {
      vi.useFakeTimers();
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(401));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await expect(adapter.list('/next-page')).rejects.toThrow(KnowledgeError);
      vi.useRealTimers();
    });
  });

  describe('health', () => {
    it('returns HEALTHY on 200', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns UNAVAILABLE on error', async () => {
      const http: IHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('offline')),
      };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });

    it('returns UNAVAILABLE on non-200 status', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(500)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(h.message).toContain('500');
    });
  });

  describe('dispose', () => {
    it('transitions to DISCONNECTED', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck', () => {
    it('returns REGISTERED when not yet initialised', async () => {
      const http = createMockHttp(new Map());
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED when API responds 200', async () => {
      const http = createMockHttp(
        new Map([['spaces', makeResponse(200)]]),
      );
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it('returns DEGRADED when API responds non-200', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockResolvedValue(makeResponse(500));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DEGRADED);
    });

    it('returns DISCONNECTED when request fails', async () => {
      const mockGet = vi.fn()
        .mockResolvedValueOnce(makeResponse(200))
        .mockRejectedValue(new Error('network down'));
      const http: IHttpClient = { get: mockGet };
      const adapter = new ConfluenceApiAdapter(baseConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });
  });
});
