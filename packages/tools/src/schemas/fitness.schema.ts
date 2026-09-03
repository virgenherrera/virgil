import { z } from 'zod';
import { TierSchema } from './tier.schema.js';

export const FitnessResultSchema = z.object({
  model: z.string(),
  fits: z.boolean(),
  score: z.number().min(0).max(1),
  ramNeededGb: z.number().positive(),
  diskNeededGb: z.number().positive(),
  ramAvailableGb: z.number().nonnegative(),
  tier: TierSchema,
});
export type FitnessResult = z.infer<typeof FitnessResultSchema>;
