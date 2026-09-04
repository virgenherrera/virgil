import { z } from 'zod';
import { JsonOptionSchema, WorkspaceSlugSchema } from '../shared/schemas.js';

// --- Create ---
export const WorkspaceCreateInputSchema = z.object({
  slug: WorkspaceSlugSchema,
  name: z.string().min(1).optional(),
});
export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateInputSchema>;

export const WorkspaceCreateOutputSchema = z.object({
  slug: WorkspaceSlugSchema,
  name: z.string().min(1),
  created: z.boolean(),
});
export type WorkspaceCreateOutput = z.infer<typeof WorkspaceCreateOutputSchema>;

// --- List ---
export const WorkspaceListInputSchema = z.object({});
export type WorkspaceListInput = z.infer<typeof WorkspaceListInputSchema>;

export const WorkspaceListOutputSchema = z.object({
  workspaces: z.array(
    z.object({
      slug: WorkspaceSlugSchema,
      name: z.string().min(1),
      active: z.boolean(),
    }),
  ),
});
export type WorkspaceListOutput = z.infer<typeof WorkspaceListOutputSchema>;

// --- Select ---
export const WorkspaceSelectInputSchema = z.object({
  slug: WorkspaceSlugSchema,
});
export type WorkspaceSelectInput = z.infer<typeof WorkspaceSelectInputSchema>;

export const WorkspaceSelectOutputSchema = z.object({
  slug: WorkspaceSlugSchema,
  selected: z.boolean(),
});
export type WorkspaceSelectOutput = z.infer<typeof WorkspaceSelectOutputSchema>;

// --- Show ---
export const WorkspaceShowInputSchema = z.object({
  slug: WorkspaceSlugSchema,
});
export type WorkspaceShowInput = z.infer<typeof WorkspaceShowInputSchema>;

export const WorkspaceShowOutputSchema = z.object({
  slug: WorkspaceSlugSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  active: z.boolean(),
});
export type WorkspaceShowOutput = z.infer<typeof WorkspaceShowOutputSchema>;

// --- Delete ---
export const WorkspaceDeleteInputSchema = z.object({
  slug: WorkspaceSlugSchema,
  confirm: z.boolean().default(false),
});
export type WorkspaceDeleteInput = z.infer<typeof WorkspaceDeleteInputSchema>;

export const WorkspaceDeleteOutputSchema = z.object({
  slug: WorkspaceSlugSchema,
  deleted: z.boolean(),
});
export type WorkspaceDeleteOutput = z.infer<typeof WorkspaceDeleteOutputSchema>;

export const WorkspaceDeleteOptionsSchema = JsonOptionSchema.extend({
  confirm: z.coerce.boolean().default(false),
});
export type WorkspaceDeleteOptions = z.infer<typeof WorkspaceDeleteOptionsSchema>;
