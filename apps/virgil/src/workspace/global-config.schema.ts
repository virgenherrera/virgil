import { z } from 'zod';
import { WorkspaceSlugSchema } from '../shared/schemas.js';

export const GLOBAL_CONFIG_SCHEMA_VERSION = 1;

export const GlobalConfigSchema = z.object({
  schemaVersion: z.literal(GLOBAL_CONFIG_SCHEMA_VERSION),
  activeWorkspace: WorkspaceSlugSchema.optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export function createEmptyGlobalConfig(): GlobalConfig {
  return { schemaVersion: GLOBAL_CONFIG_SCHEMA_VERSION };
}
