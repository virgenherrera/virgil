import { z } from 'zod';

export const RetrievalFiltersSchema = z.object({
  sourceIds: z.array(z.string().min(1)).optional(),
  providers: z.array(z.string().min(1)).optional(),
  afterDate: z.number().int().nonnegative().optional(),
  beforeDate: z.number().int().nonnegative().optional(),
});

export type RetrievalFilters = z.infer<typeof RetrievalFiltersSchema>;

export const RetrievalQuerySchema = z.object({
  text: z.string().min(1, { error: 'Query text must not be empty' }),
  filters: RetrievalFiltersSchema.optional(),
  limit: z.number().int().positive().default(10),
  minScore: z.number().min(0).max(1).optional(),
  includeCode: z.boolean().default(false),
});

export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export type RetrievalQueryInput = z.input<typeof RetrievalQuerySchema>;
