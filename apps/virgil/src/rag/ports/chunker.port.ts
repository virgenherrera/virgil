import { z } from 'zod';
import { ContentHashSchema } from '../../shared/primitives.js';

export const ChunkMetadataInputSchema = z.object({
  sourceId: z.string().min(1, { error: 'Source id must not be empty' }),
  title: z.string().optional(),
  mimeType: z.string().optional(),
});

export type ChunkMetadataInput = z.infer<typeof ChunkMetadataInputSchema>;

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

export interface Chunker {
  chunk(content: string, metadata: ChunkMetadataInput): ChunkOutput[];
}
