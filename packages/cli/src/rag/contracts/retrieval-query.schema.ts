import { z } from 'zod';

/** Optional filters narrowing a retrieval query's scope. */
export const RetrievalFiltersSchema = z.object({
  sourceIds: z.array(z.string().min(1)).optional(),
  providers: z.array(z.string().min(1)).optional(),
  afterDate: z.number().int().nonnegative().optional(),
  beforeDate: z.number().int().nonnegative().optional(),
});

export type RetrievalFilters = z.infer<typeof RetrievalFiltersSchema>;

/**
 * Zod-validated query contract consumed by Virgil agents.
 * Hides all retrieval internals — callers specify natural-language text,
 * optional filters, and a result limit.
 */
export const RetrievalQuerySchema = z.object({
  text: z.string().min(1, { error: 'Query text must not be empty' }),
  filters: RetrievalFiltersSchema.optional(),
  limit: z.number().int().positive().default(10),
  minScore: z.number().min(0).max(1).optional(),
  includeCode: z.boolean().default(false),
});

export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

/** Input shape before Zod defaults are applied (`limit`, `includeCode` optional). */
export type RetrievalQueryInput = z.input<typeof RetrievalQuerySchema>;
