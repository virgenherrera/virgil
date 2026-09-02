import { z } from 'zod';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_HUNDRED_MB = 500 * 1024 * 1024;

/**
 * Zod-validated configuration schema for the H15 knowledge lifecycle
 * module. All values have sensible defaults.
 */
export const LifecycleConfigSchema = z.object({
  /** Observation window for access-count evaluation (ms). Default: 7 days. */
  observation_window: z.number().int().positive().default(7 * ONE_DAY_MS),
  /** Minimum access count to remain in Hot state. Default: 5. */
  hot_access_threshold: z.number().int().nonnegative().default(5),
  /** Minimum access count to remain in Warm state. Default: 1. */
  warm_access_threshold: z.number().int().nonnegative().default(1),
  /** Storage budget in bytes. Default: 500 MB. */
  storage_budget_bytes: z.number().int().positive().default(FIVE_HUNDRED_MB),
  /** Compaction trigger policy. Default: 'manual'. */
  compaction_policy: z.enum(['manual', 'on-pressure']).default('manual'),
});

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;
export type LifecycleConfigInput = z.input<typeof LifecycleConfigSchema>;
