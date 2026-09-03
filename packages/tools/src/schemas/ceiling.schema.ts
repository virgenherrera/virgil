import { z } from 'zod';
import { TierSchema } from './tier.schema.js';

export const CeilingCanSchema = z.object({
  maxConcurrentModels: z.number().int().nonnegative(),
  totalRamBudgetGb: z.number().nonnegative(),
  availableDiskGb: z.number().nonnegative(),
  qualifiedModels: z.object({
    worker: z.array(z.string()),
    reasoning: z.array(z.string()),
    pro: z.array(z.string()),
  }),
});
export type CeilingCan = z.infer<typeof CeilingCanSchema>;

export const CeilingWantSchema = z.object({
  maxMinions: z.number().int().positive(),
  allowedTiers: z.array(TierSchema).min(1),
  selectedModels: z.record(z.string(), z.string()),
  ramReservationGb: z.number().nonnegative(),
});
export type CeilingWant = z.infer<typeof CeilingWantSchema>;

export const EffectiveCeilingSchema = z.object({
  maxMinions: z.number().int().nonnegative(),
  allowedTiers: z.array(TierSchema),
  selectedModels: z.record(z.string(), z.string()),
  explanation: z.record(z.string(), z.string()),
});
export type EffectiveCeiling = z.infer<typeof EffectiveCeilingSchema>;
