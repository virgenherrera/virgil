import { z } from 'zod';
import { WorkspaceSlugSchema } from '../shared/schemas.js';

export const RepoAddInputSchema = z.object({
  path: z.string().min(1),
  alias: z.string().optional(),
});

export type RepoAddInput = z.infer<typeof RepoAddInputSchema>;

export const RepoAddOutputSchema = z.object({
  slug: WorkspaceSlugSchema,
  path: z.string().min(1),
  alias: z.string().optional(),
  registered: z.boolean(),
});

export type RepoAddOutput = z.infer<typeof RepoAddOutputSchema>;

export const RepoListOutputSchema = z.array(
  z.object({
    alias: z.string(),
    path: z.string(),
  }),
);

export type RepoListOutput = z.infer<typeof RepoListOutputSchema>;

export const RepoShowOutputSchema = z.object({
  alias: z.string(),
  path: z.string(),
  branch: z.string().optional(),
  remoteUrl: z.string().optional(),
});

export type RepoShowOutput = z.infer<typeof RepoShowOutputSchema>;

export const RepoShowInputSchema = z.object({
  alias: z.string().min(1),
});

export type RepoShowInput = z.infer<typeof RepoShowInputSchema>;
