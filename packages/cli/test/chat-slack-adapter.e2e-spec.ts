import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatModule,
  ChatProviderFactory,
  ChatError,
  SlackChatAdapter,
  SlackRateLimiter,
  ChatProvenanceSchema,
  DefaultSlackHttpClient,
} from '../src/chat/index.js';
import type { SlackHttpClient, SlackApiResponse } from '../src/chat/index.js';
import { ProviderStatus } from '../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../src/contracts/index.js';
import { ChatMessageSchema, ChatThreadSchema } from '../src/contracts/index.js';

// ---------------------------------------------------------------------------
// Slack API mock
// ---------------------------------------------------------------------------

function createMockHttpClient(
  responses: Record<string, SlackApiResponse>,
): SlackHttpClient {
  return {
    call: vi.fn(async (method: string): Promise<SlackApiResponse> => {
      const response = responses[method];
      if (!response) {
        return { ok: false, error: 'unknown_method' };
      }
      return response;
    }),
  };
}

function createAuthResponse(ok = true): SlackApiResponse {
  return { ok, user: 'test-bot', team: 'test-workspace' };
}

function createSearchResponse(
  matches: Array<Record<string, unknown>> = [],
  paging = { page: 1, pages: 1 },
): SlackApiResponse {
  return {
    ok: true,
    messages: { matches, paging },
  };
}

function createRepliesResponse(
  messages: Array<Record<string, unknown>> = [],
): SlackApiResponse {
  return { ok: true, messages };
}

function createChannelsResponse(
  channels: Array<Record<string, unknown>> = [],
  nextCursor = '',
): SlackApiResponse {
  return {
    ok: true,
    channels,
    response_metadata: { next_cursor: nextCursor },
  };
}

function createSlackMessage(overrides: Record<string, unknown> = {}) {
  return {
    ts: '1700000000.000100',
    user: 'U12345',
    text: 'Hello from Slack',
    channel: { id: 'C12345', name: 'general' },
    permalink: 'https://workspace.slack.com/archives/C12345/p1700000000000100',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SlackChatAdapter (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: ChatProviderFactory;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();
    factory = moduleRef.get(ChatProviderFactory);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('initialisation and lifecycle', () => {
    it('transitions to CONNECTED after successful auth.test', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });

      expect(provider.status).toBe(ProviderStatus.REGISTERED);

      await provider.initialize();

      expect(provider.status).toBe(ProviderStatus.CONNECTED);
    });

    it('transitions to DISCONNECTED when auth.test fails', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': { ok: false, error: 'invalid_auth' },
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });

      await expect(provider.initialize()).rejects.toBeInstanceOf(ChatError);
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('healthCheck returns REGISTERED before initialisation', async () => {
      const httpClient = createMockHttpClient({});
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });

      const status = await provider.healthCheck();

      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('healthCheck returns CONNECTED after successful initialisation', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const status = await provider.healthCheck();

      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it('dispose transitions provider to DISCONNECTED', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await provider.dispose();

      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('exposes correct metadata with CHAT capability', () => {
      const httpClient = createMockHttpClient({});
      const provider = factory.create({
        type: 'slack',
        httpClient,
        providerId: 'my-slack',
      });

      expect(provider.metadata.id).toBe('my-slack');
      expect(provider.metadata.name).toBe('Slack Chat');
      expect(provider.metadata.capabilities).toContain('chat');
    });
  });

  // ---------------------------------------------------------------------------
  // searchMessages — uses search.messages, NOT conversations.history
  // ---------------------------------------------------------------------------

  describe('searchMessages (targeted discovery)', () => {
    it('calls search.messages, not conversations.history', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([createSlackMessage()]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await provider.searchMessages({ text: 'bug report' });

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const methods = callFn.mock.calls.map((c: unknown[]) => c[0]);
      expect(methods).toContain('search.messages');
      expect(methods).not.toContain('conversations.history');
      expect(methods).not.toContain('conversations.list');
    });

    it('returns normalised ChatMessages with valid schema', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([
          createSlackMessage(),
          createSlackMessage({
            ts: '1700000001.000200',
            user: 'U67890',
            text: 'Another message',
            channel: { id: 'C67890', name: 'random' },
            permalink:
              'https://workspace.slack.com/archives/C67890/p1700000001000200',
          }),
        ]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });

      expect(result.items).toHaveLength(2);
      for (const msg of result.items) {
        const parsed = ChatMessageSchema.safeParse(msg);
        expect(parsed.success).toBe(true);
      }
    });

    it('includes channel filter in query when specified', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await provider.searchMessages({
        text: 'deploy',
        channel: 'ops',
      });

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const searchCall = callFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'search.messages',
      );
      expect((searchCall?.[1] as Record<string, string>)?.query).toBe(
        'deploy in:ops',
      );
    });

    it('returns empty results gracefully', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.searchMessages({
        text: 'nonexistent',
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('handles pagination with bounded page size', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([createSlackMessage()], {
          page: 1,
          pages: 3,
        }),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('2');
    });

    it('respects maxItems from discovery scope', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([createSlackMessage()]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await provider.searchMessages({ text: 'test' }, { maxItems: 5 });

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const searchCall = callFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'search.messages',
      );
      expect((searchCall?.[1] as Record<string, string>)?.count).toBe('5');
    });

    it('rejects calls before initialise()', async () => {
      const httpClient = createMockHttpClient({});
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });

      await expect(
        provider.searchMessages({ text: 'test' }),
      ).rejects.toBeInstanceOf(ChatError);
    });

    it('throws ChatError when search.messages returns not ok', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': { ok: false, error: 'not_authed' },
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await expect(
        provider.searchMessages({ text: 'test' }),
      ).rejects.toMatchObject({ code: 'SEARCH_FAILED' });
    });
  });

  // ---------------------------------------------------------------------------
  // getThread
  // ---------------------------------------------------------------------------

  describe('getThread', () => {
    it('retrieves a complete thread with replies', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'conversations.replies': createRepliesResponse([
          {
            ts: '1700000000.000100',
            user: 'U12345',
            text: 'Original message',
            thread_ts: '1700000000.000100',
          },
          {
            ts: '1700000001.000200',
            user: 'U67890',
            text: 'Reply message',
            thread_ts: '1700000000.000100',
          },
        ]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const thread = await provider.getThread('C12345:1700000000.000100');

      const parsed = ChatThreadSchema.safeParse(thread);
      expect(parsed.success).toBe(true);
      expect(thread.messages).toHaveLength(2);
      expect(thread.participants).toContain('U12345');
      expect(thread.participants).toContain('U67890');
      expect(thread.channel).toBe('C12345');
    });

    it('rejects invalid thread id format', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await expect(provider.getThread('invalid-id')).rejects.toMatchObject({
        code: 'INVALID_THREAD_ID',
      });
    });

    it('throws ChatError when conversations.replies fails', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'conversations.replies': { ok: false, error: 'channel_not_found' },
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await expect(
        provider.getThread('C12345:1700000000.000100'),
      ).rejects.toMatchObject({ code: 'THREAD_FETCH_FAILED' });
    });
  });

  // ---------------------------------------------------------------------------
  // listChannels
  // ---------------------------------------------------------------------------

  describe('listChannels', () => {
    it('returns bounded channel list', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'conversations.list': createChannelsResponse([
          { id: 'C1', name: 'general', topic: { value: 'General chat' } },
          { id: 'C2', name: 'random' },
        ]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.listChannels();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('C1');
      expect(result.items[0].name).toBe('general');
      expect(result.items[0].topic).toBe('General chat');
      expect(result.items[1].topic).toBeUndefined();
      expect(result.hasMore).toBe(false);
    });

    it('handles pagination with next_cursor', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'conversations.list': createChannelsResponse(
          [{ id: 'C1', name: 'general' }],
          'next-page-cursor',
        ),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.listChannels();

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('next-page-cursor');
    });
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  describe('health', () => {
    it('returns HEALTHY when auth.test succeeds', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const health = await provider.health();

      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.lastChecked).toBeGreaterThan(0);
      expect(health.message).toContain('test-bot');
    });

    it('returns DEGRADED when auth.test returns not ok', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      // Override for health check
      (httpClient.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: 'token_revoked',
      });

      const health = await provider.health();

      expect(health.status).toBe(ProviderHealthStatus.DEGRADED);
    });

    it('returns UNAVAILABLE when auth.test throws', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      (httpClient.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const health = await provider.health();

      expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(health.message).toContain('Network error');
    });
  });

  // ---------------------------------------------------------------------------
  // Provenance validation
  // ---------------------------------------------------------------------------

  describe('provenance metadata', () => {
    it('every message carries valid provenance metadata', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([createSlackMessage()]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });

      for (const msg of result.items) {
        expect(msg.identity.uri).toBeTruthy();
        expect(msg.identity.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(msg.identity.discoveredAt).toBeGreaterThan(0);

        // Validate full provenance
        const provenance = ChatProvenanceSchema.safeParse({
          providerId: 'slack-chat',
          channelId: msg.channel,
          messageId: msg.id,
          authorId: msg.author,
          timestamp: msg.timestamp,
          permalink: msg.identity.uri,
          contentHash: msg.identity.hash,
          retrievedAt: msg.identity.discoveredAt,
        });
        expect(provenance.success).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('retries on 429 with exponential backoff', async () => {
      const sleepFn = vi.fn(async () => {});
      const rateLimiter = new SlackRateLimiter({
        maxRetries: 3,
        initialDelayMs: 100,
        sleepFn,
      });

      let searchAttempts = 0;
      const httpClient: SlackHttpClient = {
        call: vi.fn(async (method: string) => {
          if (method === 'auth.test') {
            return createAuthResponse();
          }
          searchAttempts += 1;
          if (searchAttempts <= 2) {
            throw Object.assign(new Error('Rate limited'), { status: 429 });
          }
          return createSearchResponse([createSlackMessage()]);
        }),
      };

      const adapter = new SlackChatAdapter(httpClient, rateLimiter);
      await adapter.initialize();
      const result = await adapter.searchMessages({ text: 'test' });

      expect(result.items).toHaveLength(1);
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('honours Retry-After header', async () => {
      const sleepFn = vi.fn(async () => {});
      const rateLimiter = new SlackRateLimiter({
        maxRetries: 2,
        sleepFn,
      });

      let searchAttempts = 0;
      const httpClient: SlackHttpClient = {
        call: vi.fn(async (method: string) => {
          if (method === 'auth.test') {
            return createAuthResponse();
          }
          searchAttempts += 1;
          if (searchAttempts <= 1) {
            throw Object.assign(new Error('Rate limited'), {
              status: 429,
              retryAfter: 3,
            });
          }
          return createSearchResponse([]);
        }),
      };

      const adapter = new SlackChatAdapter(httpClient, rateLimiter);
      await adapter.initialize();
      await adapter.searchMessages({ text: 'test' });

      // retryAfter: 3 seconds = 3000ms
      expect(sleepFn).toHaveBeenCalledWith(3_000);
    });

    it('propagates error after max retries exhausted', async () => {
      const sleepFn = vi.fn(async () => {});
      const rateLimiter = new SlackRateLimiter({
        maxRetries: 2,
        initialDelayMs: 10,
        sleepFn,
      });

      const httpClient: SlackHttpClient = {
        call: vi.fn(async (method: string) => {
          if (method === 'auth.test') {
            return createAuthResponse();
          }
          throw Object.assign(new Error('Rate limited'), { status: 429 });
        }),
      };

      const adapter = new SlackChatAdapter(httpClient, rateLimiter);
      await adapter.initialize();

      await expect(adapter.searchMessages({ text: 'test' })).rejects.toThrow(
        'Rate limited',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Factory integration
  // ---------------------------------------------------------------------------

  describe('ChatProviderFactory', () => {
    it('createAndInitialise returns a connected Slack provider', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      expect(provider.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws ChatError for unknown provider type', () => {
      expect(() =>
        factory.create({
          type: 'discord' as 'slack',
          httpClient: createMockHttpClient({}),
        }),
      ).toThrow(ChatError);
    });
  });

  // ---------------------------------------------------------------------------
  // DefaultSlackHttpClient
  // ---------------------------------------------------------------------------

  describe('DefaultSlackHttpClient', () => {
    it('calls fetch with correct URL, params, and auth header', async () => {
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        json: vi.fn(async () => ({ ok: true, user: 'bot' })),
      };
      const mockFetch = vi.fn(async () => mockResponse);
      vi.stubGlobal('fetch', mockFetch);

      try {
        const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });
        const result = await client.call('auth.test', { team: 'T123' });

        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const callArgs = mockFetch.mock.calls[0] as unknown[];
        const calledUrl = callArgs[0] as string;
        expect(calledUrl).toContain('https://slack.com/api/auth.test');
        expect(calledUrl).toContain('team=T123');

        const calledOptions = callArgs[1] as {
          headers: { Authorization: string };
        };
        expect(calledOptions.headers.Authorization).toBe('Bearer xoxb-test');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('throws with status and retryAfter on HTTP error', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '5' }),
        json: vi.fn(async () => ({})),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => mockResponse),
      );

      try {
        const client = new DefaultSlackHttpClient({ token: 'xoxb-test' });

        const error = await client
          .call('search.messages', {})
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as { status: number }).status).toBe(429);
        expect((error as { retryAfter: number }).retryAfter).toBe(5);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('uses custom baseUrl when provided', async () => {
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        json: vi.fn(async () => ({ ok: true })),
      };
      const mockFetch = vi.fn(async () => mockResponse);
      vi.stubGlobal('fetch', mockFetch);

      try {
        const client = new DefaultSlackHttpClient({
          token: 'xoxb-test',
          baseUrl: 'https://custom-slack.example.com/api',
        });
        await client.call('auth.test', {});

        const callArgs = mockFetch.mock.calls[0] as unknown[];
        const calledUrl = callArgs[0] as string;
        expect(calledUrl).toContain('custom-slack.example.com');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Additional coverage for edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('healthCheck returns DISCONNECTED when HTTP call throws', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      // Make healthCheck throw
      (httpClient.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const status = await provider.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('searchMessages forwards cursor as page parameter', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': createSearchResponse([]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      await provider.searchMessages({ text: 'test', cursor: '3' });

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const searchCall = callFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'search.messages',
      );
      expect((searchCall?.[1] as Record<string, string>)?.page).toBe('3');
    });

    it('initialise wraps non-ChatError exceptions', async () => {
      const httpClient: SlackHttpClient = {
        call: vi.fn(async () => {
          throw new Error('Connection refused');
        }),
      };
      const rateLimiter = new SlackRateLimiter({ maxRetries: 0 });
      const adapter = new SlackChatAdapter(httpClient, rateLimiter);

      await expect(adapter.initialize()).rejects.toMatchObject({
        code: 'INIT_FAILED',
      });
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('search with missing messages envelope returns empty', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'search.messages': { ok: true },
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('listChannels excludes empty topic strings', async () => {
      const httpClient = createMockHttpClient({
        'auth.test': createAuthResponse(),
        'conversations.list': createChannelsResponse([
          { id: 'C1', name: 'ch', topic: { value: '' } },
        ]),
      });
      const provider = factory.create({
        type: 'slack',
        httpClient,
      });
      await provider.initialize();

      const result = await provider.listChannels();
      expect(result.items[0].topic).toBeUndefined();
    });
  });
});
