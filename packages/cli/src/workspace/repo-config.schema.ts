import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';

const absolutePathSchema = z
  .string()
  .min(1, { error: 'Repository path must not be empty' })
  .refine((value) => isAbsolute(value), {
    error: 'Repository path must be an absolute filesystem path',
  });

const repoCommonFields = {
  path: absolutePathSchema,
  alias: z.string().min(1, { error: 'Alias must not be empty' }).optional(),
  remoteUrl: z.url({ error: 'Remote URL must be a valid URL' }).optional(),
  defaultBranch: z
    .string()
    .min(1, { error: 'Default branch must not be empty' })
    .optional(),
};

export const NewRepoConfigInputSchema = z.object({ ...repoCommonFields });

/** A repository registered within a workspace. */
export const RepoConfigSchema = z.object({
  id: z.uuid(),
  ...repoCommonFields,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type NewRepoConfigInput = z.infer<typeof NewRepoConfigInputSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
