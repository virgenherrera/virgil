import { z } from 'zod';
import { JsonOptionSchema, WorkspaceSlugSchema } from '../shared/schemas.js';

export const InitInputSchema = z.object({
  path: z.string().min(1).default(process.cwd()),
  slug: WorkspaceSlugSchema.optional(),
  name: z.string().min(1).optional(),
  skipProviders: z.boolean().default(false),
});

export type InitInput = z.infer<typeof InitInputSchema>;

export const InitOutputSchema = z.object({
  workspace: WorkspaceSlugSchema,
  path: z.string().min(1),
  name: z.string().min(1),
  created: z.boolean(),
});

export type InitOutput = z.infer<typeof InitOutputSchema>;

export const InitOptionsSchema = JsonOptionSchema.extend({
  slug: z.string().optional(),
  name: z.string().optional(),
  skipProviders: z.coerce.boolean().default(false),
});

export type InitOptions = z.infer<typeof InitOptionsSchema>;
