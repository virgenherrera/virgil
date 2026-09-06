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

export interface SlackProviderConfig extends SlackChatAdapterConfig {
  readonly type: 'slack';
  readonly httpClient: SlackHttpClient;
  readonly rateLimiter?: RateLimiterOptions;
}

export interface TeamsProviderConfig extends TeamsChatAdapterConfig {
  readonly type: 'teams';
  readonly cdpAdapter: CdpBrowserPort;
}

export type ChatProviderConfig = SlackProviderConfig | TeamsProviderConfig;

@Injectable()
export class ChatProviderFactory {
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

  async createAndInitialise(config: ChatProviderConfig): Promise<ChatProvider> {
    const provider = this.create(config);
    await provider.initialize();
    return provider;
  }
}
