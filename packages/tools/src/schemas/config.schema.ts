import { z } from 'zod';
import { TierSchema } from './tier.schema.js';
import { EffectiveCeilingSchema } from './ceiling.schema.js';

export const VirgilLocalMinionsConfigSchema = z.object({
  ceiling: TierSchema,
  allowedTiers: z.array(TierSchema),
  model: z.string().nullable(),
  effectiveCeiling: EffectiveCeilingSchema.nullable(),
  hardwareProfileHash: z.string().nullable(),
  lastProbeDate: z.string().datetime({ offset: true }).nullable(),
});
export type VirgilLocalMinionsConfig = z.infer<
  typeof VirgilLocalMinionsConfigSchema
>;
