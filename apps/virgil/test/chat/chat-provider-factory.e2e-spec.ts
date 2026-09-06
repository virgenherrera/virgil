import { ChatProviderFactory } from '../../src/chat/chat-provider.factory.js';
import { ChatError } from '../../src/chat/chat.errors.js';
import { SlackChatAdapter } from '../../src/chat/slack/slack-chat.adapter.js';
import { TeamsChatAdapter } from '../../src/chat/teams/teams-chat.adapter.js';
import type { SlackHttpClient } from '../../src/chat/slack/slack-http.client.js';
import type { CdpBrowserPort } from '../../src/chat/teams/cdp-browser.port.js';
import type { SlackProviderConfig, TeamsProviderConfig } from '../../src/chat/chat-provider.factory.js';

function mockSlackHttpClient(): SlackHttpClient {
  return {
    call: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function mockCdpBrowserPort(): CdpBrowserPort {
  return {
    launch: vi.fn().mockResolvedValue(undefined),
    executePom: vi.fn().mockResolvedValue({
      content: {},
      provenance: { targetApp: 'teams', url: '', pomVersion: 'v1' },
      contentHash: 'a'.repeat(64),
      extractedAt: new Date().toISOString(),
      metadata: { browser: 'chromium', profilePath: '', durationMs: 0 },
    }),
    detach: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ChatProviderFactory', () => {
  let factory: ChatProviderFactory;

  beforeEach(() => {
    factory = new ChatProviderFactory();
  });

  describe('create()', () => {
    it('returns a SlackChatAdapter for type slack', () => {
      const config: SlackProviderConfig = {
        type: 'slack',
        httpClient: mockSlackHttpClient(),
      };
      const provider = factory.create(config);
      expect(provider).toBeInstanceOf(SlackChatAdapter);
    });

    it('returns a TeamsChatAdapter for type teams', () => {
      const config: TeamsProviderConfig = {
        type: 'teams',
        cdpAdapter: mockCdpBrowserPort(),
        browserConfig: { browser: 'chromium', headless: true },
      };
      const provider = factory.create(config);
      expect(provider).toBeInstanceOf(TeamsChatAdapter);
    });

    it('throws ChatError for unknown provider type', () => {
      const config = { type: 'unknown' } as any;
      expect(() => factory.create(config)).toThrow(ChatError);
    });

    it('passes custom providerId through to Slack adapter', () => {
      const config: SlackProviderConfig = {
        type: 'slack',
        httpClient: mockSlackHttpClient(),
        providerId: 'custom-slack',
      };
      const provider = factory.create(config);
      expect(provider.metadata.id).toBe('custom-slack');
    });

    it('passes custom providerId through to Teams adapter', () => {
      const config: TeamsProviderConfig = {
        type: 'teams',
        cdpAdapter: mockCdpBrowserPort(),
        browserConfig: { browser: 'chromium', headless: true },
        providerId: 'custom-teams',
      };
      const provider = factory.create(config);
      expect(provider.metadata.id).toBe('custom-teams');
    });
  });

  describe('createAndInitialise()', () => {
    it('creates and initialises a Slack provider', async () => {
      const httpClient = mockSlackHttpClient();
      const config: SlackProviderConfig = {
        type: 'slack',
        httpClient,
      };
      const provider = await factory.createAndInitialise(config);
      expect(provider).toBeInstanceOf(SlackChatAdapter);
      expect(httpClient.call).toHaveBeenCalledWith('auth.test', {});
    });

    it('creates and initialises a Teams provider', async () => {
      const cdpAdapter = mockCdpBrowserPort();
      const config: TeamsProviderConfig = {
        type: 'teams',
        cdpAdapter,
        browserConfig: { browser: 'chromium', headless: true },
      };
      const provider = await factory.createAndInitialise(config);
      expect(provider).toBeInstanceOf(TeamsChatAdapter);
      expect(cdpAdapter.launch).toHaveBeenCalled();
    });
  });
});
