import { Injectable } from '@nestjs/common';
import type { ChatProvider } from '../contracts/chat-provider.types.js';
import { ChatError } from './chat.errors.js';
import type { SlackHttpClient } from './slack/slack-http.client.js';
import { SlackRateLimiter } from './slack/slack-rate-limiter.js';
import type { RateLimiterOptions } from './slack/slack-rate-limiter.js';
import {
  SlackChatAdapter,
  type SlackChatAdapterConfig,
} from './slack/slack-chat.adapter.js';
import type { CdpBrowserPort } from './teams/cdp-browser.port.js';
import {
  TeamsChatAdapter,
  type TeamsChatAdapterConfig,
} from './teams/teams-chat.adapter.js';

/** Configuration for creating a Slack chat provider. */
export interface SlackProviderConfig extends SlackChatAdapterConfig {
  readonly type: 'slack';
  readonly httpClient: SlackHttpClient;
  readonly rateLimiter?: RateLimiterOptions;
}

/** Configuration for creating a Teams chat provider. */
export interface TeamsProviderConfig extends TeamsChatAdapterConfig {
  readonly type: 'teams';
  readonly cdpAdapter: CdpBrowserPort;
}

export type ChatProviderConfig = SlackProviderConfig | TeamsProviderConfig;

/**
 * NestJS-injectable factory that creates {@link ChatProvider} instances
 * from validated configuration entries.
 */
@Injectable()
export class ChatProviderFactory {
  /**
   * Creates a configured (but not yet initialised) chat provider.
   * Call `initialize()` on the returned provider before using it.
   */
  create(config: ChatProviderConfig): ChatProvider {
    switch (config.type) {
      case 'slack': {
        const rateLimiter = new SlackRateLimiter(config.rateLimiter);
        return new SlackChatAdapter(config.httpClient, rateLimiter, config);
      }
      case 'teams':
        return new TeamsChatAdapter(config.cdpAdapter, config);
      default:
        throw new ChatError(
          `Unknown chat provider type: ${(config as { type: string }).type}`,
          { code: 'UNKNOWN_PROVIDER_TYPE' },
        );
    }
  }

  /**
   * Creates and immediately initialises a chat provider.
   * Convenience method combining `create()` and `initialize()`.
   */
  async createAndInitialise(config: ChatProviderConfig): Promise<ChatProvider> {
    const provider = this.create(config);
    await provider.initialize();
    return provider;
  }
}
