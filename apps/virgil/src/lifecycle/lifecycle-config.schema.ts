import { z } from 'zod';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_HUNDRED_MB = 500 * 1024 * 1024;

export const LifecycleConfigSchema = z.object({
  observation_window: z
    .number()
    .int()
    .positive()
    .default(7 * ONE_DAY_MS),
  hot_access_threshold: z.number().int().nonnegative().default(5),
  warm_access_threshold: z.number().int().nonnegative().default(1),
  storage_budget_bytes: z.number().int().positive().default(FIVE_HUNDRED_MB),
  compaction_policy: z.enum(['manual', 'on-pressure']).default('manual'),
});

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;
export type LifecycleConfigInput = z.input<typeof LifecycleConfigSchema>;
