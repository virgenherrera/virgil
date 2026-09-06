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

export interface ChatMessage {
  readonly id: string;
  readonly channel: string;
  readonly author: string;
  readonly content: string;
  readonly timestamp: Timestamp;
  readonly threadId?: string;
  readonly identity: ContentIdentity;
}

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

export const ChatMessagePageSchema =
  createPaginatedResultSchema(ChatMessageSchema);

export interface ChatThread {
  readonly id: string;
  readonly channel: string;
  readonly messages: readonly ChatMessage[];
  readonly participants: readonly string[];
}

export const ChatThreadSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  channel: z.string().min(1, { error: 'Channel must not be empty' }),
  messages: z.array(ChatMessageSchema).readonly(),
  participants: z.array(z.string().min(1)).readonly(),
});

export type ChatThreadShape = z.infer<typeof ChatThreadSchema>;

export interface ChatChannel {
  readonly id: string;
  readonly name: string;
  readonly topic?: string;
}

export const ChatChannelSchema = z.object({
  id: z.string().min(1, { error: 'Id must not be empty' }),
  name: z.string().min(1, { error: 'Name must not be empty' }),
  topic: z.string().min(1, { error: 'Topic must not be empty' }).optional(),
});

export const ChatChannelPageSchema =
  createPaginatedResultSchema(ChatChannelSchema);

export interface ChatSearchQuery {
  readonly text: string;
  readonly channel?: string;
  readonly cursor?: string;
}

export const ChatSearchQuerySchema = z.object({
  text: z.string().min(1, { error: 'Search text must not be empty' }),
  channel: z.string().min(1, { error: 'Channel must not be empty' }).optional(),
  cursor: z.string().min(1, { error: 'Cursor must not be empty' }).optional(),
});

export type ChatSearchQueryShape = z.infer<typeof ChatSearchQuerySchema>;

export interface ChatProvider extends Provider {
  searchMessages(
    query: ChatSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<ChatMessage>>;
  getThread(id: string): Promise<ChatThread>;
  listChannels(scope?: DiscoveryScope): Promise<PaginatedResult<ChatChannel>>;
  health(): Promise<ProviderHealth>;
}
