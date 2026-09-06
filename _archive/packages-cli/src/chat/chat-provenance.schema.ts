import { z } from 'zod';
import { ContentHashSchema, TimestampSchema } from '../shared/primitives.js';

/**
 * Extended provenance metadata validated at the adapter boundary for every
 * chat message. Combines message-level fields with content-identity data
 * to produce a complete audit trail.
 */
export const ChatProvenanceSchema = z.object({
  providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
  channelId: z.string().min(1, { error: 'Channel id must not be empty' }),
  channelName: z
    .string()
    .min(1, { error: 'Channel name must not be empty' })
    .optional(),
  threadId: z
    .string()
    .min(1, { error: 'Thread id must not be empty' })
    .optional(),
  messageId: z.string().min(1, { error: 'Message id must not be empty' }),
  authorId: z.string().min(1, { error: 'Author id must not be empty' }),
  authorName: z
    .string()
    .min(1, { error: 'Author name must not be empty' })
    .optional(),
  timestamp: TimestampSchema,
  permalink: z.string().min(1, { error: 'Permalink must not be empty' }),
  contentHash: ContentHashSchema,
  retrievedAt: TimestampSchema,
});

export type ChatProvenance = z.infer<typeof ChatProvenanceSchema>;
