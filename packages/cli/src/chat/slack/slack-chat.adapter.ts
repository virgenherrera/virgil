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
import type { SlackHttpClient } from './slack-http.client.js';
import { SlackRateLimiter } from './slack-rate-limiter.js';

/** Maximum messages per page, capping both user-supplied and default values. */
const MAX_PAGE_SIZE = 100;
/** Default page size when none is configured. */
const DEFAULT_PAGE_SIZE = 20;

export interface SlackChatAdapterConfig {
  /** Unique identifier for this provider instance. */
  readonly providerId?: string;
  /** Default page size for paginated results. */
  readonly pageSize?: number;
}

/**
 * Slack {@link ChatProvider} adapter backed by the Slack Web API.
 *
 * Targeted discovery: `searchMessages` calls `search.messages` (not
 * `conversations.history` or `conversations.list`). Thread retrieval
 * uses `conversations.replies`.
 */
export class SlackChatAdapter implements ChatProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private readonly httpClient: SlackHttpClient;
  private readonly rateLimiter: SlackRateLimiter;
  private readonly pageSize: number;

  constructor(
    httpClient: SlackHttpClient,
    rateLimiter: SlackRateLimiter,
    config: SlackChatAdapterConfig = {},
  ) {
    this.httpClient = httpClient;
    this.rateLimiter = rateLimiter;
    this.pageSize = Math.min(
      config.pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const id = config.providerId ?? 'slack-chat';
    this.metadata = {
      id,
      name: 'Slack Chat',
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
      const response = await this.rateLimiter.execute(() =>
        this.httpClient.call('auth.test', {}),
      );

      if (!response.ok) {
        this._status = ProviderStatus.DISCONNECTED;
        throw new ChatError(`Slack auth.test failed: ${response.error}`, {
          code: 'AUTH_FAILED',
          provider: this.metadata,
        });
      }

      this._status = ProviderStatus.CONNECTED;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      this._status = ProviderStatus.DISCONNECTED;
      throw new ChatError('Failed to initialise Slack adapter', {
        code: 'INIT_FAILED',
        provider: this.metadata,
        cause: error,
      });
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }

    try {
      const response = await this.rateLimiter.execute(() =>
        this.httpClient.call('auth.test', {}),
      );
      this._status = response.ok
        ? ProviderStatus.CONNECTED
        : ProviderStatus.DEGRADED;
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
    }

    return this._status;
  }

  async dispose(): Promise<void> {
    this._status = ProviderStatus.DISCONNECTED;
  }

  // ---------------------------------------------------------------------------
  // ChatProvider contract — targeted discovery
  // ---------------------------------------------------------------------------

  async searchMessages(
    query: ChatSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>> {
    this.assertConnected('searchMessages');

    const limit = Math.min(scope?.maxItems ?? this.pageSize, MAX_PAGE_SIZE);

    const params: Record<string, string> = {
      query: query.channel ? `${query.text} in:${query.channel}` : query.text,
      count: String(limit),
    };

    if (query.cursor) {
      params.page = query.cursor;
    }

    const response = await this.rateLimiter.execute(() =>
      this.httpClient.call('search.messages', params),
    );

    if (!response.ok) {
      throw new ChatError(`search.messages failed: ${response.error}`, {
        code: 'SEARCH_FAILED',
        provider: this.metadata,
        recoverable: true,
      });
    }

    const envelope = response.messages as
      | {
          matches?: Array<Record<string, unknown>>;
          paging?: { pages?: number; page?: number };
        }
      | undefined;

    const matches = envelope?.matches ?? [];
    const paging = envelope?.paging;
    const currentPage = paging?.page ?? 1;
    const totalPages = paging?.pages ?? 1;
    const hasMore = currentPage < totalPages;
    const retrievedAt = createTimestamp();

    const items = matches.map((match) => this.toMessage(match, retrievedAt));

    return {
      items,
      cursor: hasMore ? String(currentPage + 1) : undefined,
      hasMore,
    };
  }

  async getThread(id: string): Promise<ChatThread> {
    this.assertConnected('getThread');

    const [channel, ts] = id.split(':');
    if (!channel || !ts) {
      throw new ChatError('Thread id must be in "channelId:threadTs" format', {
        code: 'INVALID_THREAD_ID',
        provider: this.metadata,
      });
    }

    const response = await this.rateLimiter.execute(() =>
      this.httpClient.call('conversations.replies', {
        channel,
        ts,
        limit: String(this.pageSize),
      }),
    );

    if (!response.ok) {
      throw new ChatError(`conversations.replies failed: ${response.error}`, {
        code: 'THREAD_FETCH_FAILED',
        provider: this.metadata,
        recoverable: true,
      });
    }

    const rawMessages = (response.messages ?? []) as Array<
      Record<string, unknown>
    >;
    const retrievedAt = createTimestamp();
    const messages = rawMessages.map((m) =>
      this.toMessage(
        { ...m, channel: { id: channel, name: channel } },
        retrievedAt,
      ),
    );

    const participants = [...new Set(messages.map((m) => m.author))];

    return { id, channel, messages, participants };
  }

  async listChannels(
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatChannel>> {
    this.assertConnected('listChannels');

    const limit = Math.min(scope?.maxItems ?? this.pageSize, MAX_PAGE_SIZE);

    const params: Record<string, string> = {
      limit: String(limit),
      exclude_archived: 'true',
    };

    if (scope?.include?.[0]) {
      params.cursor = scope.include[0];
    }

    const response = await this.rateLimiter.execute(() =>
      this.httpClient.call('conversations.list', params),
    );

    if (!response.ok) {
      throw new ChatError(`conversations.list failed: ${response.error}`, {
        code: 'LIST_CHANNELS_FAILED',
        provider: this.metadata,
        recoverable: true,
      });
    }

    const channels = (response.channels ?? []) as Array<
      Record<string, unknown>
    >;
    const nextCursor = (
      response.response_metadata as { next_cursor?: string } | undefined
    )?.next_cursor;

    const items: ChatChannel[] = channels.map((ch) => ({
      id: String(ch.id ?? ''),
      name: String(ch.name ?? ''),
      topic: ch.topic
        ? String((ch.topic as { value?: string }).value ?? '') || undefined
        : undefined,
    }));

    return {
      items,
      cursor: nextCursor || undefined,
      hasMore: Boolean(nextCursor),
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();

    try {
      const response = await this.rateLimiter.execute(() =>
        this.httpClient.call('auth.test', {}),
      );

      return {
        status: response.ok
          ? ProviderHealthStatus.HEALTHY
          : ProviderHealthStatus.DEGRADED,
        lastChecked,
        message: response.ok
          ? `Connected as ${String(response.user ?? 'unknown')}`
          : `Auth failed: ${String(response.error)}`,
      };
    } catch (error) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message:
          error instanceof Error ? error.message : 'Unknown health check error',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private toMessage(
    raw: Record<string, unknown>,
    retrievedAt: Timestamp,
  ): ChatMessage {
    const id = String(raw.ts ?? raw.iid ?? '');
    const channel =
      typeof raw.channel === 'object' && raw.channel !== null
        ? String((raw.channel as { id?: string }).id ?? '')
        : String(raw.channel ?? '');
    const author = String(raw.user ?? raw.username ?? '');
    const content = String(raw.text ?? '');
    const timestamp = this.slackTsToTimestamp(String(raw.ts ?? '0'));
    const threadId = raw.thread_ts
      ? `${channel}:${String(raw.thread_ts)}`
      : undefined;

    const permalink = String(
      raw.permalink ?? `slack://message/${channel}/${id}`,
    );
    const contentHash = createContentHash(content);

    const identity: ContentIdentity = {
      uri: permalink,
      hash: contentHash,
      discoveredAt: retrievedAt,
    };

    // Validate provenance at the adapter boundary.
    ChatProvenanceSchema.parse({
      providerId: this.metadata.id,
      channelId: channel,
      messageId: id,
      authorId: author,
      timestamp,
      permalink,
      contentHash,
      retrievedAt,
    });

    return { id, channel, author, content, timestamp, threadId, identity };
  }

  private slackTsToTimestamp(ts: string): Timestamp {
    const seconds = Number.parseFloat(ts);
    return (
      Number.isFinite(seconds) ? Math.floor(seconds * 1_000) : 0
    ) as Timestamp;
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
