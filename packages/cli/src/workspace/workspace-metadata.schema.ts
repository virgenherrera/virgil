import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';
import type { WorkspaceId } from '../shared/workspace.types.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Validates and brands a workspace slug: lowercase alphanumeric plus
 * hyphens, 1-64 characters, must start with a lowercase letter. Enforced
 * as lowercase-only to avoid slug collisions on case-insensitive
 * filesystems (e.g. macOS HFS+). The slug doubles as the workspace's
 * {@link WorkspaceId} (imported from the shared foundation layer) and as
 * its directory name under `<state-root>/workspaces/`.
 */
export const WorkspaceSlugSchema = z
  .string()
  .regex(SLUG_PATTERN, {
    error:
      'Workspace slug must start with a lowercase letter and contain only lowercase letters, digits, and hyphens (1-64 characters total)',
  })
  .transform((value) => value as WorkspaceId);

export const WORKSPACE_CONFIG_SCHEMA_VERSION = 1;

/** Persisted content of a workspace's `workspace.config.json`. */
export const WorkspaceMetadataSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_CONFIG_SCHEMA_VERSION),
  slug: WorkspaceSlugSchema,
  displayName: z
    .string()
    .min(1, { error: 'Display name must not be empty' })
    .optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type WorkspaceMetadata = z.infer<typeof WorkspaceMetadataSchema>;
