import { z } from 'zod';

export const BudgetPolicySchema = z.object({
  workerTokenLimit: z.number().positive(),
  reasoningTokenLimit: z.number().positive(),
  proTokenLimit: z.number().positive(),
  sessionTokenCeiling: z.number().positive(),
  warningThresholdPercent: z.number().min(1).max(100).default(80),
});

export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;
