import { z } from 'zod';
import type { Timestamp } from '../shared/primitives.js';
import { TimestampSchema } from '../shared/primitives.js';
import type { Provider } from '../shared/provider.types.js';
import type {
  ContentIdentity,
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from './common.types.js';
import {
  ContentIdentitySchema,
  createPaginatedResultSchema,
} from './common.types.js';

/** A single message discovered within an organizational chat platform. */
export interface ChatMessage {
  readonly id: string;
  readonly channel: string;
  readonly author: string;
  readonly content: string;
  readonly timestamp: Timestamp;
  readonly threadId?: string;
  readonly identity: ContentIdentity;
}

/** Validates the shape of a {@link ChatMessage}. */
export const ChatMessageSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  channel: z.string().min(1, { error: 'Channel must not be empty' }),
  author: z.string().min(1, { error: 'Author must not be empty' }),
  content: z.string(),
  timestamp: TimestampSchema,
  threadId: z
    .string()
    .min(1, { error: 'Thread id must not be empty' })
    .optional(),
  identity: ContentIdentitySchema,
});

export type ChatMessageShape = z.infer<typeof ChatMessageSchema>;

/** Validates a paginated page of {@link ChatMessage}. */
export const ChatMessagePageSchema =
  createPaginatedResultSchema(ChatMessageSchema);

/** A discussion thread, with its constituent messages and participants. */
export interface ChatThread {
  readonly id: string;
  readonly channel: string;
  readonly messages: readonly ChatMessage[];
  readonly participants: readonly string[];
}

/** Validates the shape of a {@link ChatThread}. */
export const ChatThreadSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  channel: z.string().min(1, { error: 'Channel must not be empty' }),
  messages: z.array(ChatMessageSchema).readonly(),
  participants: z.array(z.string().min(1)).readonly(),
});

export type ChatThreadShape = z.infer<typeof ChatThreadSchema>;

/** A discoverable chat channel. */
export interface ChatChannel {
  readonly id: string;
  readonly name: string;
  readonly topic?: string;
}

/** Validates the shape of a {@link ChatChannel}. */
export const ChatChannelSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  name: z.string().min(1, { error: 'Name must not be empty' }),
  topic: z.string().min(1, { error: 'Topic must not be empty' }).optional(),
});

/** Validates a paginated page of {@link ChatChannel}. */
export const ChatChannelPageSchema =
  createPaginatedResultSchema(ChatChannelSchema);

/** A vendor-neutral search query against a chat platform. */
export interface ChatSearchQuery {
  readonly text: string;
  readonly channel?: string;
  readonly cursor?: string;
}

/** Validates the shape of a {@link ChatSearchQuery}. */
export const ChatSearchQuerySchema = z.object({
  text: z.string().min(1, { error: 'Search text must not be empty' }),
  channel: z.string().min(1, { error: 'Channel must not be empty' }).optional(),
  cursor: z.string().min(1, { error: 'Cursor must not be empty' }).optional(),
});

export type ChatSearchQueryShape = z.infer<typeof ChatSearchQuerySchema>;

/**
 * @experimental Port for targeted organizational chat discovery (Slack,
 * Teams, and similar platforms). Intentionally scoped for targeted
 * discovery of relevant conversations, not bulk archival ingestion. The
 * contract never references a specific chat vendor API.
 */
export interface ChatProvider extends Provider {
  /** Searches for messages matching `query`, bounded by an optional discovery scope. */
  searchMessages(
    query: ChatSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>>;
  /** Retrieves a full thread, including all its messages and participants. */
  getThread(id: string): Promise<ChatThread>;
  /** Lists discoverable channels, bounded by an optional discovery scope. */
  listChannels(scope?: DiscoveryScope): Promise<PaginatedResult<ChatChannel>>;
  /** Reports a rich, operator-facing health snapshot. */
  health(): Promise<ProviderHealth>;
}
