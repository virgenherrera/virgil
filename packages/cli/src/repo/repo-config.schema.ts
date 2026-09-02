import { isAbsolute } from 'node:path';
import { z } from 'zod';

/**
 * Configuration entry for a single local repository within a workspace.
 * Each entry declares the absolute path and optional tuning knobs for
 * bounded discovery operations.
 */
export const LocalRepoConfigEntrySchema = z.object({
  path: z
    .string()
    .min(1, { error: 'Repository path must not be empty' })
    .refine((value) => isAbsolute(value), {
      error: 'Repository path must be an absolute filesystem path',
    }),
  alias: z.string().min(1, { error: 'Alias must not be empty' }).optional(),
  maxCommits: z.number().int().positive().default(20),
  maxFiles: z.number().int().positive().default(1000),
  maxFileSize: z.number().int().positive().default(102_400),
});

export type LocalRepoConfigEntry = z.infer<typeof LocalRepoConfigEntrySchema>;
export type LocalRepoConfigEntryInput = z.input<
  typeof LocalRepoConfigEntrySchema
>;

/**
 * Top-level configuration for the local repository provider. A workspace
 * may configure one or more local repository paths.
 */
export const LocalRepoConfigSchema = z.object({
  repositories: z
    .array(LocalRepoConfigEntrySchema)
    .min(1, { error: 'At least one repository must be configured' }),
});

export type LocalRepoConfig = z.infer<typeof LocalRepoConfigSchema>;
