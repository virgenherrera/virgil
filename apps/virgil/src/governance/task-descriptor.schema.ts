import { z } from 'zod';

export const COMPLEXITY_SIGNALS = [
  'mechanical',
  'synthesis',
  'review',
  'architecture',
  'search',
  'extraction',
] as const;

export type ComplexitySignal = (typeof COMPLEXITY_SIGNALS)[number];

export const TaskDescriptorSchema = z.object({
  taskType: z.string().min(1),
  estimatedTokenWeight: z.number().nonnegative(),
  complexitySignal: z.enum(COMPLEXITY_SIGNALS),
  isMechanical: z.boolean(),
});

export type TaskDescriptor = z.infer<typeof TaskDescriptorSchema>;
