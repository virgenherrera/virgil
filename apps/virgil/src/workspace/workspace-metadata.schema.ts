import { z } from 'zod';
import { TimestampSchema } from '../shared/primitives.js';
import { WorkspaceSlugSchema } from '../shared/schemas.js';

export const WORKSPACE_CONFIG_SCHEMA_VERSION = 1;

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
