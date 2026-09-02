import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatModule,
  ChatProviderFactory,
  ChatError,
  ChatProvenanceSchema,
} from '../src/chat/index.js';
import type { CdpBrowserPort, CdpExecutionResult } from '../src/chat/index.js';
import { ProviderStatus } from '../src/shared/provider.types.js';
import { ProviderHealthStatus } from '../src/contracts/index.js';
import {
  ChatMessageSchema,
  ChatThreadSchema,
  ChatChannelSchema,
} from '../src/contracts/index.js';

// ---------------------------------------------------------------------------
// CDP adapter mock
// ---------------------------------------------------------------------------

function createMockCdpAdapter(
  executePomResult?: CdpExecutionResult,
): CdpBrowserPort {
  return {
    launch: vi.fn(async () => {}),
    executePom: vi.fn(async (): Promise<CdpExecutionResult> => {
      if (!executePomResult) {
        throw new Error('No CDP result configured');
      }
      return executePomResult;
    }),
    detach: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

function createSearchResult(
  overrides: Partial<CdpExecutionResult['content']> = {},
): CdpExecutionResult {
  return {
    content: {
      authors: ['Alice', 'Bob'],
      messages: ['Hello from Teams', 'Reply in Teams'],
      timestamps: ['2024-06-15T10:00:00Z', '2024-06-15T10:05:00Z'],
      channels: ['general', 'general'],
      permalinks: [
        'https://teams.microsoft.com/msg/1',
        'https://teams.microsoft.com/msg/2',
      ],
      ...overrides,
    },
    provenance: {
      targetApp: 'teams',
      url: 'https://teams.microsoft.com/_#/search?q=test',
      pomVersion: 'teams-search-v1',
    },
    contentHash: 'a'.repeat(64),
    extractedAt: '2024-06-15T10:06:00Z',
    metadata: {
      browser: 'chromium',
      profilePath: '/tmp/teams-profile',
      durationMs: 1500,
    },
  };
}

function createThreadResult(
  overrides: Partial<CdpExecutionResult['content']> = {},
): CdpExecutionResult {
  return {
    content: {
      authors: ['Alice', 'Bob', 'Charlie'],
      messages: ['Thread start', 'First reply', 'Second reply'],
      timestamps: [
        '2024-06-15T10:00:00Z',
        '2024-06-15T10:05:00Z',
        '2024-06-15T10:10:00Z',
      ],
      ...overrides,
    },
    provenance: {
      targetApp: 'teams',
      url: 'https://teams.microsoft.com/_#/conversations/thread-1',
      pomVersion: 'teams-thread-v1',
    },
    contentHash: 'b'.repeat(64),
    extractedAt: '2024-06-15T10:11:00Z',
    metadata: {
      browser: 'chromium',
      profilePath: '/tmp/teams-profile',
      durationMs: 800,
    },
  };
}

function createChannelsResult(): CdpExecutionResult {
  return {
    content: {
      channelIds: ['ch-1', 'ch-2', 'ch-3'],
      channelNames: ['general', 'random', 'engineering'],
      channelTopics: ['General chat', 'Random stuff', ''],
    },
    provenance: {
      targetApp: 'teams',
      url: 'https://teams.microsoft.com/_#/conversations',
      pomVersion: 'teams-channels-v1',
    },
    contentHash: 'c'.repeat(64),
    extractedAt: '2024-06-15T10:12:00Z',
    metadata: {
      browser: 'chromium',
      profilePath: '/tmp/teams-profile',
      durationMs: 600,
    },
  };
}

const DEFAULT_BROWSER_CONFIG = {
  browser: 'chromium',
  headless: true,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TeamsChatAdapter (e2e)', () => {
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
    it('transitions to CONNECTED after successful browser launch', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      expect(provider.status).toBe(ProviderStatus.REGISTERED);

      await provider.initialize();

      expect(provider.status).toBe(ProviderStatus.CONNECTED);
      expect(cdp.launch).toHaveBeenCalledWith(DEFAULT_BROWSER_CONFIG);
    });

    it('transitions to DISCONNECTED when browser launch fails', async () => {
      const cdp = createMockCdpAdapter();
      (cdp.launch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Browser not found'),
      );

      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      await expect(provider.initialize()).rejects.toBeInstanceOf(ChatError);
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('healthCheck returns REGISTERED before initialisation', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      const status = await provider.healthCheck();

      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('dispose closes the browser session and disconnects', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      await provider.dispose();

      expect(cdp.close).toHaveBeenCalled();
      expect(provider.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('exposes correct metadata with CHAT capability', () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
        providerId: 'my-teams',
      });

      expect(provider.metadata.id).toBe('my-teams');
      expect(provider.metadata.name).toBe('Teams Chat');
      expect(provider.metadata.capabilities).toContain('chat');
    });
  });

  // ---------------------------------------------------------------------------
  // searchMessages — uses Teams search UI, NOT channel listing
  // ---------------------------------------------------------------------------

  describe('searchMessages (targeted discovery via search UI)', () => {
    it('navigates to search URL with encoded query', async () => {
      const cdp = createMockCdpAdapter(createSearchResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      await provider.searchMessages({ text: 'bug report' });

      const executePomFn = cdp.executePom as ReturnType<typeof vi.fn>;
      expect(executePomFn).toHaveBeenCalledTimes(1);

      const [pom, url] = executePomFn.mock.calls[0] as [
        { version: string },
        string,
      ];
      expect(pom.version).toBe('teams-search-v1');
      expect(url).toContain('search');
      expect(url).toContain('bug%20report');
    });

    it('returns normalised ChatMessages with valid schema', async () => {
      const cdp = createMockCdpAdapter(createSearchResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });

      expect(result.items).toHaveLength(2);
      for (const msg of result.items) {
        const parsed = ChatMessageSchema.safeParse(msg);
        expect(parsed.success).toBe(true);
      }
    });

    it('returns empty results gracefully', async () => {
      const cdp = createMockCdpAdapter(
        createSearchResult({ authors: [], messages: [] }),
      );
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'nothing' });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('respects maxItems from discovery scope', async () => {
      const cdp = createMockCdpAdapter(
        createSearchResult({
          authors: ['A', 'B', 'C', 'D', 'E'],
          messages: ['m1', 'm2', 'm3', 'm4', 'm5'],
        }),
      );
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.searchMessages(
        { text: 'test' },
        { maxItems: 3 },
      );

      expect(result.items).toHaveLength(3);
    });

    it('includes channel filter in search URL', async () => {
      const cdp = createMockCdpAdapter(createSearchResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      await provider.searchMessages({
        text: 'deploy',
        channel: 'ops',
      });

      const executePomFn = cdp.executePom as ReturnType<typeof vi.fn>;
      const url = executePomFn.mock.calls[0]?.[1] as string;
      expect(url).toContain('deploy');
      expect(url).toContain('ops');
    });

    it('rejects calls before initialise()', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      await expect(
        provider.searchMessages({ text: 'test' }),
      ).rejects.toBeInstanceOf(ChatError);
    });

    it('wraps CDP errors in ChatError', async () => {
      const cdp = createMockCdpAdapter();
      (cdp.executePom as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Selector not found'),
      );
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      await expect(
        provider.searchMessages({ text: 'test' }),
      ).rejects.toMatchObject({ code: 'CDP_EXTRACTION_FAILED' });
    });
  });

  // ---------------------------------------------------------------------------
  // getThread
  // ---------------------------------------------------------------------------

  describe('getThread', () => {
    it('navigates to thread URL and extracts messages', async () => {
      const cdp = createMockCdpAdapter(createThreadResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const thread = await provider.getThread('general/thread-1');

      const parsed = ChatThreadSchema.safeParse(thread);
      expect(parsed.success).toBe(true);
      expect(thread.messages).toHaveLength(3);
      expect(thread.participants).toContain('Alice');
      expect(thread.participants).toContain('Bob');
      expect(thread.participants).toContain('Charlie');
    });

    it('returns empty thread when CDP extraction returns no messages', async () => {
      const cdp = createMockCdpAdapter(
        createThreadResult({ authors: [], messages: [] }),
      );
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const thread = await provider.getThread('ch/thread-empty');

      expect(thread.messages).toHaveLength(0);
      expect(thread.participants).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // listChannels
  // ---------------------------------------------------------------------------

  describe('listChannels', () => {
    it('extracts channels from Teams sidebar', async () => {
      const cdp = createMockCdpAdapter(createChannelsResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.listChannels();

      expect(result.items).toHaveLength(3);
      for (const ch of result.items) {
        const parsed = ChatChannelSchema.safeParse(ch);
        expect(parsed.success).toBe(true);
      }
      expect(result.items[0].name).toBe('general');
      expect(result.items[0].topic).toBe('General chat');
      expect(result.items[2].topic).toBeUndefined();
    });

    it('respects maxItems from discovery scope', async () => {
      const cdp = createMockCdpAdapter(createChannelsResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.listChannels({ maxItems: 2 });

      expect(result.items).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  describe('health', () => {
    it('returns HEALTHY when browser session is active', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const health = await provider.health();

      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.lastChecked).toBeGreaterThan(0);
    });

    it('returns UNAVAILABLE when not connected', async () => {
      const cdp = createMockCdpAdapter();
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      const health = await provider.health();

      expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });
  });

  // ---------------------------------------------------------------------------
  // Provenance validation
  // ---------------------------------------------------------------------------

  describe('provenance metadata', () => {
    it('every message carries valid provenance metadata', async () => {
      const cdp = createMockCdpAdapter(createSearchResult());
      const provider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await provider.initialize();

      const result = await provider.searchMessages({ text: 'test' });

      for (const msg of result.items) {
        expect(msg.identity.uri).toBeTruthy();
        expect(msg.identity.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(msg.identity.discoveredAt).toBeGreaterThan(0);

        const provenance = ChatProvenanceSchema.safeParse({
          providerId: 'teams-chat',
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
  // Normalisation parity
  // ---------------------------------------------------------------------------

  describe('normalisation parity with Slack adapter', () => {
    it('produces ChatMessages with the same shape as the Slack adapter', async () => {
      const cdp = createMockCdpAdapter(createSearchResult());
      const teamsProvider = factory.create({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });
      await teamsProvider.initialize();

      const teamsResult = await teamsProvider.searchMessages({
        text: 'test',
      });

      // Verify every Teams message has the exact same field set as defined
      // by ChatMessageSchema (which the Slack adapter also produces).
      for (const msg of teamsResult.items) {
        expect(msg).toHaveProperty('id');
        expect(msg).toHaveProperty('channel');
        expect(msg).toHaveProperty('author');
        expect(msg).toHaveProperty('content');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('identity');
        expect(msg.identity).toHaveProperty('uri');
        expect(msg.identity).toHaveProperty('hash');
        expect(msg.identity).toHaveProperty('discoveredAt');

        const parsed = ChatMessageSchema.safeParse(msg);
        expect(parsed.success).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Factory integration
  // ---------------------------------------------------------------------------

  describe('ChatProviderFactory', () => {
    it('createAndInitialise returns a connected Teams provider', async () => {
      const cdp = createMockCdpAdapter();

      const provider = await factory.createAndInitialise({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: DEFAULT_BROWSER_CONFIG,
      });

      expect(provider.status).toBe(ProviderStatus.CONNECTED);
    });
  });
});
