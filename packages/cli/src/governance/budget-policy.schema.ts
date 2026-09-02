import { z } from 'zod';

/**
 * Zod-validated configuration schema for budget policy (H11 D4).
 * Defines per-tier token limits, a session ceiling, and the threshold
 * percentage at which a warning is emitted.
 */
export const BudgetPolicySchema = z.object({
  workerTokenLimit: z.number().positive(),
  reasoningTokenLimit: z.number().positive(),
  proTokenLimit: z.number().positive(),
  sessionTokenCeiling: z.number().positive(),
  warningThresholdPercent: z.number().min(1).max(100).default(80),
});

export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;
