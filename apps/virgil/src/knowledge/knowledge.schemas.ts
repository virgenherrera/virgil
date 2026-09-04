import { z } from 'zod';

export const KnowledgeSearchInputSchema = z.object({
  query: z.string().min(1),
});

export type KnowledgeSearchInput = z.infer<typeof KnowledgeSearchInputSchema>;

export const KnowledgeSearchOutputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number().min(0).max(1),
  source: z.string().min(1),
});

export type KnowledgeSearchOutput = z.infer<typeof KnowledgeSearchOutputSchema>;

export const KnowledgeStatsOutputSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  hotItems: z.number().int().nonnegative(),
  warmItems: z.number().int().nonnegative(),
  coldItems: z.number().int().nonnegative(),
  lastCompaction: z.string().optional(),
});

export type KnowledgeStatsOutput = z.infer<typeof KnowledgeStatsOutputSchema>;

export const KnowledgeCompactOutputSchema = z.object({
  compacted: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  duration: z.string().min(1),
});

export type KnowledgeCompactOutput = z.infer<typeof KnowledgeCompactOutputSchema>;
