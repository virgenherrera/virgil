import { z } from 'zod';
import { ContentHashSchema, TimestampSchema } from '../../shared/primitives.js';

/** Provenance metadata tracing a retrieval result back to its source. */
export const RetrievalProvenanceSchema = z.object({
  provider: z.string().min(1, { error: 'Provider must not be empty' }),
  uri: z.string().min(1, { error: 'URI must not be empty' }),
  contentHash: ContentHashSchema,
  discoveredAt: TimestampSchema,
});

export type RetrievalProvenance = z.infer<typeof RetrievalProvenanceSchema>;

/**
 * Zod-validated result contract returned by the retrieval pipeline.
 * Each result carries the fused score alongside the component scores
 * (lexical and vector) that contributed to it.
 */
export const RetrievalResultSchema = z.object({
  chunkId: z.string().min(1, { error: 'Chunk id must not be empty' }),
  content: z.string(),
  score: z.number(),
  lexicalScore: z.number().nullable(),
  vectorScore: z.number().nullable(),
  sourceId: z.string().min(1, { error: 'Source id must not be empty' }),
  provenance: RetrievalProvenanceSchema,
});

export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;
