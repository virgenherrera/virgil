import { z } from 'zod';

/** Complexity signals that drive tier selection. */
export const COMPLEXITY_SIGNALS = [
  'mechanical',
  'synthesis',
  'review',
  'architecture',
  'search',
  'extraction',
] as const;

export type ComplexitySignal = (typeof COMPLEXITY_SIGNALS)[number];

/**
 * Zod-validated schema for task descriptors (H11 D1).
 *
 * A task descriptor carries the classification metadata the TierResolver
 * needs to map a task to the appropriate {@link CapabilityTier}.
 */
export const TaskDescriptorSchema = z.object({
  taskType: z.string().min(1),
  estimatedTokenWeight: z.number().nonnegative(),
  complexitySignal: z.enum(COMPLEXITY_SIGNALS),
  isMechanical: z.boolean(),
});

export type TaskDescriptor = z.infer<typeof TaskDescriptorSchema>;
