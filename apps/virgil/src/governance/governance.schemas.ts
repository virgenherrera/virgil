import { z } from 'zod';
import { JsonOptionSchema } from '../shared/schemas.js';

export const BudgetOutputSchema = z.object({
  total: z.number(),
  used: z.number(),
  remaining: z.number(),
  period: z.string(),
});

export type BudgetOutput = z.infer<typeof BudgetOutputSchema>;

export const AuditOutputSchema = z.array(
  z.object({
    timestamp: z.string(),
    action: z.string(),
    agent: z.string(),
    tokens: z.number(),
  }),
);

export type AuditOutput = z.infer<typeof AuditOutputSchema>;

export const BudgetOptionsSchema = JsonOptionSchema.extend({
  period: z.string().optional(),
});

export type BudgetOptions = z.infer<typeof BudgetOptionsSchema>;

export const AuditOptionsSchema = JsonOptionSchema.extend({
  since: z.string().optional(),
});

export type AuditOptions = z.infer<typeof AuditOptionsSchema>;
