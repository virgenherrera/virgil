import { z } from 'zod';
import { TimestampSchema } from '../../shared/primitives.js';

/** Query targeting structural code retrieval via CodeGraph. */
export const CodeRetrievalQuerySchema = z.object({
  text: z.string().min(1, { error: 'Query text must not be empty' }),
  symbolNames: z.array(z.string().min(1)).optional(),
  filePaths: z.array(z.string().min(1)).optional(),
  limit: z.number().int().positive().default(10),
});

export type CodeRetrievalQuery = z.infer<typeof CodeRetrievalQuerySchema>;
export type CodeRetrievalQueryInput = z.input<typeof CodeRetrievalQuerySchema>;

/** A single structural code retrieval hit. */
export const CodeRetrievalResultSchema = z.object({
  symbolId: z.string().min(1, { error: 'Symbol id must not be empty' }),
  filePath: z.string().min(1, { error: 'File path must not be empty' }),
  lineRange: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }),
  content: z.string(),
  score: z.number(),
  callPaths: z.array(z.string()).optional(),
  blastRadius: z.number().int().nonnegative().optional(),
  provenance: z.object({
    provider: z.string().min(1),
    uri: z.string().min(1),
    discoveredAt: TimestampSchema,
  }),
});

export type CodeRetrievalResult = z.infer<typeof CodeRetrievalResultSchema>;

/** Structured notice explaining why code retrieval is degraded. */
export const CodeRetrieverDegradationNoticeSchema = z.object({
  available: z.literal(false),
  reason: z.string().min(1),
});

export type CodeRetrieverDegradationNotice = z.infer<
  typeof CodeRetrieverDegradationNoticeSchema
>;

/** Response envelope from a {@link CodeRetriever} query. */
export interface CodeRetrieverResponse {
  readonly results: readonly CodeRetrievalResult[];
  readonly notice?: CodeRetrieverDegradationNotice;
}

/**
 * Port for structural code retrieval that delegates to H05's
 * CodeGraphService. When CodeGraph is unavailable, the adapter returns
 * an empty result set with a structured degradation notice.
 */
export interface CodeRetriever {
  retrieveCode(query: CodeRetrievalQuery): Promise<CodeRetrieverResponse>;
  isAvailable(): Promise<boolean>;
}
