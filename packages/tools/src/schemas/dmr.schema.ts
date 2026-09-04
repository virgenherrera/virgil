import { z } from 'zod';
import {
  MAX_TOKENS_UPPER_BOUND,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
} from '../probe.constants.js';

export const ModelsResponseSchema = z.object({
  object: z.string(),
  data: z.array(
    z
      .object({
        id: z.string(),
        object: z.string(),
      })
      .passthrough(),
  ),
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

export const ChatResponseSchema = z.object({
  choices: z.array(
    z
      .object({
        index: z.number(),
        message: z.object({
          role: z.string(),
          content: z.string(),
        }),
      })
      .passthrough(),
  ),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const DelegateOptionsSchema = z.object({
  prompt: z
    .string({ error: '--prompt is required.' })
    .min(1, '--prompt is required and cannot be empty.'),
  system: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  maxTokens: z.coerce
    .number()
    .int()
    .positive('--max-tokens must be a positive integer.')
    .max(
      MAX_TOKENS_UPPER_BOUND,
      `--max-tokens must be at most ${MAX_TOKENS_UPPER_BOUND}.`,
    )
    .optional(),
  temperature: z.coerce
    .number()
    .min(
      TEMPERATURE_MIN,
      `--temperature must be between ${TEMPERATURE_MIN} and ${TEMPERATURE_MAX}.`,
    )
    .max(
      TEMPERATURE_MAX,
      `--temperature must be between ${TEMPERATURE_MIN} and ${TEMPERATURE_MAX}.`,
    )
    .optional(),
});
export type DelegateOptions = z.infer<typeof DelegateOptionsSchema>;

export const DelegateResultSchema = z.object({
  content: z.string(),
  model: z.string(),
  elapsed_ms: z.number().nonnegative(),
});
export type DelegateResult = z.infer<typeof DelegateResultSchema>;
