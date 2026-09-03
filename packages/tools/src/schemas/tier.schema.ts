import { z } from 'zod';

export const TierSchema = z.enum(['worker', 'reasoning', 'pro']);
export type Tier = z.infer<typeof TierSchema>;
