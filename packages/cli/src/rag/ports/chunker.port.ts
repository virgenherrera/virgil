import { z } from 'zod';
import { ContentHashSchema } from '../../shared/primitives.js';

/** Metadata accompanying the content passed to a {@link Chunker}. */
export const ChunkMetadataInputSchema = z.object({
  sourceId: z.string().min(1, { error: 'Source id must not be empty' }),
  title: z.string().optional(),
  mimeType: z.string().optional(),
});

export type ChunkMetadataInput = z.infer<typeof ChunkMetadataInputSchema>;

/** A single chunk produced by a {@link Chunker}, carrying positional and identity metadata. */
export const ChunkOutputSchema = z.object({
  id: z.string().min(1, { error: 'Chunk id must not be empty' }),
  content: z.string(),
  contentHash: ContentHashSchema,
  sourceId: z.string().min(1, { error: 'Source id must not be empty' }),
  position: z.number().int().nonnegative(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
});

export type ChunkOutput = z.infer<typeof ChunkOutputSchema>;

/**
 * Strategy-agnostic port for splitting normalized content into indexable
 * chunks. The default adapter uses fixed-size overlapping windows (D1);
 * alternative strategies (e.g. semantic chunking) can be swapped via DI.
 *
 * This port applies to document/prose content ONLY. Source code uses
 * structural retrieval through the {@link CodeRetriever} port.
 */
export interface Chunker {
  chunk(content: string, metadata: ChunkMetadataInput): ChunkOutput[];
}
