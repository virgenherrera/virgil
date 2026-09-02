import { z } from 'zod';
import { WorkspaceSlugSchema } from './workspace-metadata.schema.js';

export const GLOBAL_CONFIG_SCHEMA_VERSION = 1;

/** Persisted content of the state root's `global.config.json`. */
export const GlobalConfigSchema = z.object({
  schemaVersion: z.literal(GLOBAL_CONFIG_SCHEMA_VERSION),
  activeWorkspace: WorkspaceSlugSchema.optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/** The default global configuration used before `global.config.json` first exists. */
export function createEmptyGlobalConfig(): GlobalConfig {
  return { schemaVersion: GLOBAL_CONFIG_SCHEMA_VERSION };
}
