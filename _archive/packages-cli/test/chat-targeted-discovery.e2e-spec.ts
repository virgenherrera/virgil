import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatModule,
  ChatProviderFactory,
  TargetedDiscoveryService,
} from '../src/chat/index.js';
import type {
  SlackHttpClient,
  SlackApiResponse,
  CdpBrowserPort,
  CdpExecutionResult,
} from '../src/chat/index.js';
import { ChatMessageSchema, ChatThreadSchema } from '../src/contracts/index.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSlackClient(
  responses: Record<string, SlackApiResponse>,
): SlackHttpClient {
  return {
    call: vi.fn(async (method: string): Promise<SlackApiResponse> => {
      return responses[method] ?? { ok: false, error: 'unknown_method' };
    }),
  };
}

function createMockCdpAdapter(result?: CdpExecutionResult): CdpBrowserPort {
  return {
    launch: vi.fn(async () => {}),
    executePom: vi.fn(async (): Promise<CdpExecutionResult> => {
      if (!result) throw new Error('No CDP result');
      return result;
    }),
    detach: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TargetedDiscoveryService (e2e)', () => {
  let moduleRef: TestingModule;
  let factory: ChatProviderFactory;
  let discovery: TargetedDiscoveryService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ChatModule],
    }).compile();
    factory = moduleRef.get(ChatProviderFactory);
    discovery = moduleRef.get(TargetedDiscoveryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ---------------------------------------------------------------------------
  // discoverForIssue
  // ---------------------------------------------------------------------------

  describe('discoverForIssue', () => {
    it('searches Slack provider for issue-related messages', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true, user: 'bot' },
        'search.messages': {
          ok: true,
          messages: {
            matches: [
              {
                ts: '1700000000.000100',
                user: 'U123',
                text: 'Fix for JIRA-123',
                channel: { id: 'C1', name: 'dev' },
                permalink: 'https://slack.com/msg/1',
              },
            ],
            paging: { page: 1, pages: 1 },
          },
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      const result = await discovery.discoverForIssue(provider, 'JIRA-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toContain('JIRA-123');
      for (const msg of result.items) {
        expect(ChatMessageSchema.safeParse(msg).success).toBe(true);
      }
    });

    it('searches Teams provider for issue-related messages', async () => {
      const cdp = createMockCdpAdapter({
        content: {
          authors: ['Alice'],
          messages: ['Discussion about BUG-456'],
          timestamps: ['2024-06-15T10:00:00Z'],
          channels: ['engineering'],
          permalinks: ['https://teams.microsoft.com/msg/1'],
        },
        provenance: {
          targetApp: 'teams',
          url: 'https://teams.microsoft.com/_#/search?q=BUG-456',
          pomVersion: 'teams-search-v1',
        },
        contentHash: 'a'.repeat(64),
        extractedAt: '2024-06-15T10:06:00Z',
        metadata: {
          browser: 'chromium',
          profilePath: '/tmp/profile',
          durationMs: 500,
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: { browser: 'chromium', headless: true },
      });

      const result = await discovery.discoverForIssue(provider, 'BUG-456');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toContain('BUG-456');
    });

    it('respects discovery scope bounds', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true },
        'search.messages': {
          ok: true,
          messages: {
            matches: [
              {
                ts: '1700000000.000100',
                user: 'U1',
                text: 'msg1',
                channel: { id: 'C1', name: 'ch' },
                permalink: 'https://slack.com/msg/1',
              },
            ],
            paging: { page: 1, pages: 1 },
          },
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      const result = await discovery.discoverForIssue(provider, 'TEST-1', {
        maxItems: 5,
      });

      // Verify the search was called with bounded count
      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const searchCall = callFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'search.messages',
      );
      expect((searchCall?.[1] as Record<string, string>)?.count).toBe('5');
      expect(result.items.length).toBeLessThanOrEqual(5);
    });

    it('returns empty results gracefully', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true },
        'search.messages': {
          ok: true,
          messages: { matches: [], paging: { page: 1, pages: 1 } },
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      const result = await discovery.discoverForIssue(provider, 'NONEXISTENT');

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // discoverThread
  // ---------------------------------------------------------------------------

  describe('discoverThread', () => {
    it('retrieves a full thread via the provider', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true },
        'conversations.replies': {
          ok: true,
          messages: [
            {
              ts: '1700000000.000100',
              user: 'U1',
              text: 'Thread start',
              thread_ts: '1700000000.000100',
            },
            {
              ts: '1700000001.000200',
              user: 'U2',
              text: 'Reply',
              thread_ts: '1700000000.000100',
            },
          ],
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      const thread = await discovery.discoverThread(
        provider,
        'C123:1700000000.000100',
      );

      expect(ChatThreadSchema.safeParse(thread).success).toBe(true);
      expect(thread.messages).toHaveLength(2);
      expect(thread.participants).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // discoverInChannel
  // ---------------------------------------------------------------------------

  describe('discoverInChannel', () => {
    it('searches within a specific channel', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true },
        'search.messages': {
          ok: true,
          messages: {
            matches: [
              {
                ts: '1700000000.000100',
                user: 'U1',
                text: 'Deploy complete',
                channel: { id: 'C-ops', name: 'ops' },
                permalink: 'https://slack.com/msg/1',
              },
            ],
            paging: { page: 1, pages: 1 },
          },
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      const result = await discovery.discoverInChannel(
        provider,
        'ops',
        'deploy',
      );

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const searchCall = callFn.mock.calls.find(
        (c: unknown[]) => c[0] === 'search.messages',
      );
      expect((searchCall?.[1] as Record<string, string>)?.query).toBe(
        'deploy in:ops',
      );
      expect(result.items).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // No bulk enumeration
  // ---------------------------------------------------------------------------

  describe('no bulk enumeration', () => {
    it('discovery service never calls conversations.history', async () => {
      const httpClient = createMockSlackClient({
        'auth.test': { ok: true },
        'search.messages': {
          ok: true,
          messages: { matches: [], paging: { page: 1, pages: 1 } },
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'slack',
        httpClient,
      });

      await discovery.discoverForIssue(provider, 'test');
      await discovery.discoverInChannel(provider, 'ch', 'test');

      const callFn = httpClient.call as ReturnType<typeof vi.fn>;
      const methods = callFn.mock.calls.map((c: unknown[]) => c[0]);
      expect(methods).not.toContain('conversations.history');
    });

    it('Teams discovery navigates search UI, not channel listing', async () => {
      const cdp = createMockCdpAdapter({
        content: { authors: [], messages: [] },
        provenance: {
          targetApp: 'teams',
          url: 'https://teams.microsoft.com/_#/search?q=test',
          pomVersion: 'teams-search-v1',
        },
        contentHash: 'd'.repeat(64),
        extractedAt: '2024-06-15T10:00:00Z',
        metadata: {
          browser: 'chromium',
          profilePath: '/tmp/p',
          durationMs: 100,
        },
      });

      const provider = await factory.createAndInitialise({
        type: 'teams',
        cdpAdapter: cdp,
        browserConfig: { browser: 'chromium', headless: true },
      });

      await discovery.discoverForIssue(provider, 'test');

      const executePomFn = cdp.executePom as ReturnType<typeof vi.fn>;
      const [pom, url] = executePomFn.mock.calls[0] as [
        { version: string },
        string,
      ];
      expect(pom.version).toBe('teams-search-v1');
      expect(url).toContain('search');
    });
  });
});
