import { TeamsChatAdapter } from '../../src/chat/teams/teams-chat.adapter.js';
import { ChatError } from '../../src/chat/chat.errors.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { CdpBrowserPort, CdpExecutionResult } from '../../src/chat/teams/cdp-browser.port.js';
import type { TeamsChatAdapterConfig } from '../../src/chat/teams/teams-chat.adapter.js';

function mockCdp(overrides: Partial<CdpBrowserPort> = {}): CdpBrowserPort {
  return {
    launch: vi.fn().mockResolvedValue(undefined),
    executePom: vi.fn().mockResolvedValue({
      content: {},
      provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
      contentHash: 'a'.repeat(64),
      extractedAt: new Date().toISOString(),
      metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
    } satisfies CdpExecutionResult),
    detach: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const defaultConfig: TeamsChatAdapterConfig = {
  browserConfig: { browser: 'chromium', headless: true },
};

function createAdapter(
  cdp?: CdpBrowserPort,
  config: TeamsChatAdapterConfig = defaultConfig,
): TeamsChatAdapter {
  return new TeamsChatAdapter(cdp ?? mockCdp(), config);
}

async function initAdapter(
  cdp?: CdpBrowserPort,
  config: TeamsChatAdapterConfig = defaultConfig,
): Promise<{ adapter: TeamsChatAdapter; cdp: CdpBrowserPort }> {
  const port = cdp ?? mockCdp();
  const adapter = new TeamsChatAdapter(port, config);
  await adapter.initialize();
  return { adapter, cdp: port };
}

describe('TeamsChatAdapter', () => {
  describe('metadata', () => {
    it('uses default id when none provided', () => {
      const adapter = createAdapter();
      expect(adapter.metadata.id).toBe('teams-chat');
      expect(adapter.metadata.name).toBe('Teams Chat');
    });

    it('uses custom providerId', () => {
      const adapter = createAdapter(undefined, {
        ...defaultConfig,
        providerId: 'my-teams',
      });
      expect(adapter.metadata.id).toBe('my-teams');
    });

    it('starts in REGISTERED status', () => {
      const adapter = createAdapter();
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize()', () => {
    it('launches CDP and transitions to CONNECTED', async () => {
      const cdp = mockCdp();
      const { adapter } = await initAdapter(cdp);
      expect(cdp.launch).toHaveBeenCalled();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws ChatError and sets DISCONNECTED on launch failure', async () => {
      const cdp = mockCdp({
        launch: vi.fn().mockRejectedValue(new Error('no browser')),
      });
      const adapter = createAdapter(cdp);
      await expect(adapter.initialize()).rejects.toThrow(ChatError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck()', () => {
    it('returns REGISTERED when not initialised', async () => {
      const adapter = createAdapter();
      expect(await adapter.healthCheck()).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED when initialised', async () => {
      const { adapter } = await initAdapter();
      expect(await adapter.healthCheck()).toBe(ProviderStatus.CONNECTED);
    });
  });

  describe('dispose()', () => {
    it('calls cdp.close() and sets DISCONNECTED', async () => {
      const cdp = mockCdp();
      const { adapter } = await initAdapter(cdp);
      await adapter.dispose();
      expect(cdp.close).toHaveBeenCalled();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('sets DISCONNECTED even if close throws', async () => {
      const cdp = mockCdp({
        close: vi.fn().mockRejectedValue(new Error('close error')),
      });
      const { adapter } = await initAdapter(cdp);
      await expect(adapter.dispose()).rejects.toThrow('close error');
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

    it('returns extracted messages from search POM', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockResolvedValue({
          content: {
            authors: ['Alice', 'Bob'],
            messages: ['hello', 'world'],
            timestamps: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
            channels: ['general', 'dev'],
            permalinks: ['https://teams/1', 'https://teams/2'],
          },
          provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
          contentHash: 'a'.repeat(64),
          extractedAt: new Date().toISOString(),
          metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
        } satisfies CdpExecutionResult),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      const result = await adapter.searchMessages({ text: 'test' });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].author).toBe('Alice');
      expect(result.items[0].content).toBe('hello');
      expect(result.items[1].author).toBe('Bob');
    });

    it('returns empty result when POM returns null content', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockResolvedValue({
          content: {},
          provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
          contentHash: 'a'.repeat(64),
          extractedAt: new Date().toISOString(),
          metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
        }),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      const result = await adapter.searchMessages({ text: 'nothing' });
      expect(result.items).toHaveLength(0);
    });

    it('throws ChatError on CDP extraction failure', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockRejectedValue(new Error('CDP failure')),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      await expect(adapter.searchMessages({ text: 'x' })).rejects.toThrow(
        ChatError,
      );
    });
  });

  describe('getThread()', () => {
    it('throws when not connected', async () => {
      const adapter = createAdapter();
      await expect(adapter.getThread('t1')).rejects.toThrow(ChatError);
    });

    it('returns thread messages from POM', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockResolvedValue({
          content: {
            authors: ['Alice'],
            messages: ['thread message'],
            timestamps: ['2024-01-01T00:00:00Z'],
          },
          provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
          contentHash: 'a'.repeat(64),
          extractedAt: new Date().toISOString(),
          metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
        } satisfies CdpExecutionResult),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      const thread = await adapter.getThread('general/thread-1');
      expect(thread.messages).toHaveLength(1);
      expect(thread.participants).toContain('Alice');
    });

    it('returns empty thread when POM returns no messages', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockResolvedValue({
          content: {},
          provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
          contentHash: 'a'.repeat(64),
          extractedAt: new Date().toISOString(),
          metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
        }),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      const thread = await adapter.getThread('t1');
      expect(thread.messages).toHaveLength(0);
      expect(thread.participants).toHaveLength(0);
    });
  });

  describe('listChannels()', () => {
    it('throws when not connected', async () => {
      const adapter = createAdapter();
      await expect(adapter.listChannels()).rejects.toThrow(ChatError);
    });

    it('returns extracted channels from POM', async () => {
      const cdp = mockCdp({
        executePom: vi.fn().mockResolvedValue({
          content: {
            channelIds: ['C01', 'C02'],
            channelNames: ['general', 'dev'],
            channelTopics: ['Main', ''],
          },
          provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
          contentHash: 'a'.repeat(64),
          extractedAt: new Date().toISOString(),
          metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
        } satisfies CdpExecutionResult),
        launch: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const { adapter } = await initAdapter(cdp);
      const result = await adapter.listChannels();
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('C01');
      expect(result.items[0].name).toBe('general');
    });
  });

  describe('health()', () => {
    it('returns HEALTHY when connected', async () => {
      const { adapter } = await initAdapter();
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns UNAVAILABLE when not connected', async () => {
      const adapter = createAdapter();
      const h = await adapter.health();
      expect(h.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });
  });
});
