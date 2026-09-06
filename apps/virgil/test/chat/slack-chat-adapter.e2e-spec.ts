import { SlackChatAdapter } from '../../src/chat/slack/slack-chat.adapter.js';
import { SlackRateLimiter } from '../../src/chat/slack/slack-rate-limiter.js';
import { ChatError } from '../../src/chat/chat.errors.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { SlackHttpClient, SlackApiResponse } from '../../src/chat/slack/slack-http.client.js';

function mockHttpClient(
  overrides: Partial<SlackHttpClient> = {},
): SlackHttpClient {
  return {
    call: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function createAdapter(
  httpClient?: SlackHttpClient,
  config: { providerId?: string; pageSize?: number } = {},
): SlackChatAdapter {
  const client = httpClient ?? mockHttpClient();
  const rateLimiter = new SlackRateLimiter({ maxRetries: 0 });
  return new SlackChatAdapter(client, rateLimiter, config);
}

async function initAdapter(
  httpClient?: SlackHttpClient,
  config: { providerId?: string; pageSize?: number } = {},
): Promise<{ adapter: SlackChatAdapter; client: SlackHttpClient }> {
  const client = httpClient ?? mockHttpClient();
  const adapter = createAdapter(client, config);
  await adapter.initialize();
  return { adapter, client };
}

describe('SlackChatAdapter', () => {
  describe('metadata', () => {
    it('uses default id when none provided', () => {
      const adapter = createAdapter();
      expect(adapter.metadata.id).toBe('slack-chat');
      expect(adapter.metadata.name).toBe('Slack Chat');
    });

    it('uses custom providerId', () => {
      const adapter = createAdapter(undefined, { providerId: 'my-slack' });
      expect(adapter.metadata.id).toBe('my-slack');
    });

    it('starts in REGISTERED status', () => {
      const adapter = createAdapter();
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize()', () => {
    it('transitions to CONNECTED on successful auth.test', async () => {
      const { adapter } = await initAdapter();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws ChatError and sets DISCONNECTED on failed auth.test', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockResolvedValue({ ok: false, error: 'invalid_auth' }),
      });
      const adapter = createAdapter(client);
      await expect(adapter.initialize()).rejects.toThrow(ChatError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws ChatError on network error', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockRejectedValue(new Error('network')),
      });
      const adapter = createAdapter(client);
      await expect(adapter.initialize()).rejects.toThrow(ChatError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck()', () => {
    it('returns REGISTERED when not initialised', async () => {
      const adapter = createAdapter();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED on successful health check', async () => {
      const { adapter } = await initAdapter();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it('returns DEGRADED when auth.test response is not ok', async () => {
      const client = mockHttpClient();
      const adapter = createAdapter(client);
      await adapter.initialize();
      (client.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: 'degraded',
      });
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DEGRADED);
    });

    it('returns DISCONNECTED on error', async () => {
      const client = mockHttpClient();
      const adapter = createAdapter(client);
      await adapter.initialize();
      (client.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('timeout'),
      );
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('dispose()', () => {
    it('sets status to DISCONNECTED', async () => {
      const { adapter } = await initAdapter();
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('searchMessages()', () => {
    it('throws when not connected', async () => {
      const adapter = createAdapter();
      await expect(
        adapter.searchMessages({ text: 'test' }),
      ).rejects.toThrow(ChatError);
    });

    it('returns paginated messages from search.messages', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({
            ok: true,
            messages: {
              matches: [
                {
                  ts: '1234567890.123456',
                  user: 'U01',
                  text: 'hello world',
                  channel: { id: 'C01', name: 'general' },
                  permalink: 'https://slack.com/msg/1',
                },
              ],
              paging: { page: 1, pages: 2 },
            },
          });
        }),
      });
      const { adapter } = await initAdapter(client);
      const result = await adapter.searchMessages({ text: 'hello' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('hello world');
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('2');
    });

    it('uses channel filter in query', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({
            ok: true,
            messages: { matches: [], paging: { page: 1, pages: 1 } },
          });
        }),
      });
      const { adapter } = await initAdapter(client);
      await adapter.searchMessages({ text: 'bug', channel: 'dev' });
      expect(client.call).toHaveBeenCalledWith(
        'search.messages',
        expect.objectContaining({
          query: 'bug in:dev',
        }),
      );
    });

    it('throws ChatError on failed response', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({ ok: false, error: 'search_error' });
        }),
      });
      const { adapter } = await initAdapter(client);
      await expect(adapter.searchMessages({ text: 'x' })).rejects.toThrow(
        ChatError,
      );
    });

    it('caps page size at MAX_PAGE_SIZE', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({
            ok: true,
            messages: { matches: [] },
          });
        }),
      });
      const { adapter } = await initAdapter(client);
      await adapter.searchMessages({ text: 'x' }, { maxItems: 999 });
      expect(client.call).toHaveBeenCalledWith(
        'search.messages',
        expect.objectContaining({ count: '100' }),
      );
    });
  });

  describe('getThread()', () => {
    it('throws when not connected', async () => {
      const adapter = createAdapter();
      await expect(adapter.getThread('C01:123')).rejects.toThrow(ChatError);
    });

    it('throws on invalid thread id format', async () => {
      const { adapter } = await initAdapter();
      await expect(adapter.getThread('invalid')).rejects.toThrow(ChatError);
    });

    it('returns thread messages', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({
            ok: true,
            messages: [
              { ts: '1234567890.123456', user: 'U01', text: 'thread msg' },
            ],
          });
        }),
      });
      const { adapter } = await initAdapter(client);
      const thread = await adapter.getThread('C01:1234567890.123456');
      expect(thread.id).toBe('C01:1234567890.123456');
      expect(thread.messages).toHaveLength(1);
      expect(thread.participants).toContain('U01');
    });

    it('throws ChatError on failed response', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({ ok: false, error: 'thread_not_found' });
        }),
      });
      const { adapter } = await initAdapter(client);
      await expect(adapter.getThread('C01:123')).rejects.toThrow(ChatError);
    });
  });

  describe('listChannels()', () => {
    it('throws when not connected', async () => {
      const adapter = createAdapter();
      await expect(adapter.listChannels()).rejects.toThrow(ChatError);
    });

    it('returns paginated channels', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({
            ok: true,
            channels: [
              { id: 'C01', name: 'general', topic: { value: 'Main channel' } },
            ],
            response_metadata: { next_cursor: 'cursor-2' },
          });
        }),
      });
      const { adapter } = await initAdapter(client);
      const result = await adapter.listChannels();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('general');
      expect(result.items[0].topic).toBe('Main channel');
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('cursor-2');
    });

    it('throws ChatError on failed response', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockImplementation((method: string) => {
          if (method === 'auth.test') return Promise.resolve({ ok: true });
          return Promise.resolve({ ok: false, error: 'not_authed' });
        }),
      });
      const { adapter } = await initAdapter(client);
      await expect(adapter.listChannels()).rejects.toThrow(ChatError);
    });
  });

  describe('health()', () => {
    it('returns HEALTHY on successful auth.test', async () => {
      const client = mockHttpClient({
        call: vi.fn().mockResolvedValue({ ok: true, user: 'bot' }),
      });
      const { adapter } = await initAdapter(client);
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(h.message).toContain('bot');
    });

    it('returns DEGRADED when auth.test fails', async () => {
      const client = mockHttpClient();
      const adapter = createAdapter(client);
      await adapter.initialize();
      (client.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: 'token_revoked',
      });
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.DEGRADED);
    });

    it('returns UNAVAILABLE on error', async () => {
      const client = mockHttpClient();
      const adapter = createAdapter(client);
      await adapter.initialize();
      (client.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('timeout'),
      );
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });
  });
});
