import type {
  ChatChannel,
  ChatMessage,
  ChatProvider,
  ChatSearchQuery,
  ChatThread,
} from '../../contracts/chat-provider.types.js';
import type {
  ContentIdentity,
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from '../../contracts/common.types.js';
import { ProviderHealthStatus } from '../../contracts/common.types.js';
import type { SemVer, Timestamp } from '../../shared/primitives.js';
import { createContentHash, createTimestamp } from '../../shared/primitives.js';
import type { ProviderMetadata } from '../../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../../shared/provider.types.js';
import { ChatProvenanceSchema } from '../chat-provenance.schema.js';
import { ChatError } from '../chat.errors.js';
import type {
  CdpBrowserConfig,
  CdpBrowserPort,
  CdpExecutionResult,
} from './cdp-browser.port.js';
import {
  teamsChannelsPom,
  teamsSearchPom,
  teamsThreadPom,
} from './teams-pom.definitions.js';

/** Maximum items per page for Teams results. */
const MAX_PAGE_SIZE = 50;
/** Default page size. */
const DEFAULT_PAGE_SIZE = 20;

export interface TeamsChatAdapterConfig {
  /** Unique identifier for this provider instance. */
  readonly providerId?: string;
  /** Default page size for paginated results. */
  readonly pageSize?: number;
  /** Base URL for the Teams web client. */
  readonly teamsBaseUrl?: string;
  /** Browser configuration for CDP session launch. */
  readonly browserConfig: CdpBrowserConfig;
}

/**
 * Microsoft Teams {@link ChatProvider} adapter backed by PW CDP browser
 * automation. Targeted discovery: search navigates the Teams search UI
 * (not channel listing or history crawling).
 */
export class TeamsChatAdapter implements ChatProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private readonly cdp: CdpBrowserPort;
  private readonly pageSize: number;
  private readonly teamsBaseUrl: string;
  private readonly browserConfig: CdpBrowserConfig;

  constructor(cdp: CdpBrowserPort, config: TeamsChatAdapterConfig) {
    this.cdp = cdp;
    this.pageSize = Math.min(
      config.pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    this.teamsBaseUrl = config.teamsBaseUrl ?? 'https://teams.microsoft.com';
    this.browserConfig = config.browserConfig;

    const id = config.providerId ?? 'teams-chat';
    this.metadata = {
      id,
      name: 'Teams Chat',
      version: '0.0.1' as SemVer,
      capabilities: [ProviderCapability.CHAT],
    };
  }

  get status(): ProviderStatus {
    return this._status;
  }

  // ---------------------------------------------------------------------------
  // Provider lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    try {
      await this.cdp.launch(this.browserConfig);
      this._status = ProviderStatus.CONNECTED;
    } catch (error) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new ChatError('Failed to launch Teams browser session', {
        code: 'BROWSER_LAUNCH_FAILED',
        provider: this.metadata,
        cause: error,
      });
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }
    return this._status;
  }

  async dispose(): Promise<void> {
    try {
      await this.cdp.close();
    } finally {
      this._status = ProviderStatus.DISCONNECTED;
    }
  }

  // ---------------------------------------------------------------------------
  // ChatProvider contract — targeted discovery via Teams search UI
  // ---------------------------------------------------------------------------

  async searchMessages(
    query: ChatSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>> {
    this.assertConnected('searchMessages');

    const limit = Math.min(scope?.maxItems ?? this.pageSize, MAX_PAGE_SIZE);

    const searchUrl = this.buildSearchUrl(query.text, query.channel);
    const result = await this.executePomSafe(teamsSearchPom, searchUrl);

    if (!result) {
      return { items: [], hasMore: false };
    }

    const items = this.extractSearchMessages(result, limit);
    return { items, hasMore: items.length >= limit };
  }

  async getThread(id: string): Promise<ChatThread> {
    this.assertConnected('getThread');

    const threadUrl = `${this.teamsBaseUrl}/_#/conversations/${encodeURIComponent(id)}`;
    const result = await this.executePomSafe(teamsThreadPom, threadUrl);

    if (!result) {
      return { id, channel: '', messages: [], participants: [] };
    }

    const messages = this.extractThreadMessages(result, id);
    const channel = messages[0]?.channel ?? '';
    const participants = [...new Set(messages.map((m) => m.author))];

    return { id, channel, messages, participants };
  }

  async listChannels(
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatChannel>> {
    this.assertConnected('listChannels');

    const limit = Math.min(scope?.maxItems ?? this.pageSize, MAX_PAGE_SIZE);

    const teamsUrl = `${this.teamsBaseUrl}/_#/conversations`;
    const result = await this.executePomSafe(teamsChannelsPom, teamsUrl);

    if (!result) {
      return { items: [], hasMore: false };
    }

    const ids = this.toStringArray(result.content.channelIds);
    const names = this.toStringArray(result.content.channelNames);
    const topics = this.toStringArray(result.content.channelTopics);

    const items: ChatChannel[] = [];
    const count = Math.min(ids.length, names.length, limit);

    for (let i = 0; i < count; i++) {
      items.push({
        id: ids[i] ?? `channel-${i}`,
        name: names[i] ?? '',
        topic: topics[i] || undefined,
      });
    }

    return { items, hasMore: items.length >= limit };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();

    if (this._status === ProviderStatus.CONNECTED) {
      return {
        status: ProviderHealthStatus.HEALTHY,
        lastChecked,
        message: 'Teams browser session active',
      };
    }

    return {
      status: ProviderHealthStatus.UNAVAILABLE,
      lastChecked,
      message: 'Teams browser session not active',
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private buildSearchUrl(text: string, channel?: string): string {
    const query = channel ? `${text} channel:${channel}` : text;
    return `${this.teamsBaseUrl}/_#/search?q=${encodeURIComponent(query)}`;
  }

  private async executePomSafe(
    pom: typeof teamsSearchPom,
    url: string,
  ): Promise<CdpExecutionResult | undefined> {
    try {
      return await this.cdp.executePom(pom, url);
    } catch (error) {
      throw new ChatError(`Teams CDP extraction failed for ${pom.version}`, {
        code: 'CDP_EXTRACTION_FAILED',
        provider: this.metadata,
        recoverable: true,
        cause: error,
      });
    }
  }

  private extractSearchMessages(
    result: CdpExecutionResult,
    limit: number,
  ): ChatMessage[] {
    const authors = this.toStringArray(result.content.authors);
    const messages = this.toStringArray(result.content.messages);
    const timestamps = this.toStringArray(result.content.timestamps);
    const channels = this.toStringArray(result.content.channels);
    const permalinks = this.toStringArray(result.content.permalinks);

    const retrievedAt = createTimestamp();
    const count = Math.min(authors.length, messages.length, limit);
    const items: ChatMessage[] = [];

    for (let i = 0; i < count; i++) {
      items.push(
        this.buildMessage({
          id: `teams-search-${i}`,
          channel: channels[i] ?? 'unknown',
          author: authors[i] ?? 'unknown',
          content: messages[i] ?? '',
          timestamp: this.parseTimestamp(timestamps[i]),
          permalink: permalinks[i] ?? `${this.teamsBaseUrl}/search/${i}`,
          retrievedAt,
        }),
      );
    }

    return items;
  }

  private extractThreadMessages(
    result: CdpExecutionResult,
    threadId: string,
  ): ChatMessage[] {
    const authors = this.toStringArray(result.content.authors);
    const messages = this.toStringArray(result.content.messages);
    const timestamps = this.toStringArray(result.content.timestamps);

    const retrievedAt = createTimestamp();
    const count = Math.min(authors.length, messages.length);
    const items: ChatMessage[] = [];

    for (let i = 0; i < count; i++) {
      items.push(
        this.buildMessage({
          id: `teams-thread-${threadId}-${i}`,
          channel: threadId.split('/')[0] ?? 'unknown',
          author: authors[i] ?? 'unknown',
          content: messages[i] ?? '',
          timestamp: this.parseTimestamp(timestamps[i]),
          permalink: `${this.teamsBaseUrl}/_#/conversations/${threadId}/${i}`,
          retrievedAt,
          threadId,
        }),
      );
    }

    return items;
  }

  private buildMessage(params: {
    id: string;
    channel: string;
    author: string;
    content: string;
    timestamp: Timestamp;
    permalink: string;
    retrievedAt: Timestamp;
    threadId?: string;
  }): ChatMessage {
    const contentHash = createContentHash(params.content);

    const identity: ContentIdentity = {
      uri: params.permalink,
      hash: contentHash,
      discoveredAt: params.retrievedAt,
    };

    // Validate provenance at the adapter boundary.
    ChatProvenanceSchema.parse({
      providerId: this.metadata.id,
      channelId: params.channel,
      threadId: params.threadId,
      messageId: params.id,
      authorId: params.author,
      timestamp: params.timestamp,
      permalink: params.permalink,
      contentHash,
      retrievedAt: params.retrievedAt,
    });

    return {
      id: params.id,
      channel: params.channel,
      author: params.author,
      content: params.content,
      timestamp: params.timestamp,
      threadId: params.threadId,
      identity,
    };
  }

  private parseTimestamp(raw?: string): Timestamp {
    if (!raw) return createTimestamp();
    const parsed = Date.parse(raw);
    return (Number.isFinite(parsed) ? parsed : Date.now()) as Timestamp;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private assertConnected(operation: string): void {
    if (this._status !== ProviderStatus.CONNECTED) {
      throw new ChatError(`Cannot call ${operation} before initialise()`, {
        code: 'NOT_CONNECTED',
        provider: this.metadata,
      });
    }
  }
}
