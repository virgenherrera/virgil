import { z } from 'zod';
import type { Brand, Timestamp } from './primitives.js';
import { TimestampSchema } from './primitives.js';
import { ProviderCapability } from './provider.types.js';

/** Stable identifier for a Virgil workspace. */
export type WorkspaceId = Brand<string, 'WorkspaceId'>;

/**
 * Platform-aware state directory resolution, following the XDG base
 * directory conventions (and their platform equivalents on macOS/Windows).
 */
export interface StateDirectoryPaths {
  /** User config (`~/.config/virgil` or platform equivalent). */
  readonly config: string;
  /** Persistent data (`~/.local/share/virgil` or platform equivalent). */
  readonly data: string;
  /** Ephemeral cache (`~/.cache/virgil` or platform equivalent). */
  readonly cache: string;
  /** Runtime state (`~/.local/state/virgil` or platform equivalent). */
  readonly state: string;
}

/** Registration of a single provider within a workspace. */
export interface ProviderRegistration {
  readonly providerId: string;
  readonly capability: ProviderCapability;
  readonly configPath: string;
  /** Opaque reference to a stored credential — never the credential itself. */
  readonly credentialRef?: string;
}

/** Persisted configuration for a Virgil workspace. */
export interface WorkspaceConfig {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly createdAt: Timestamp;
  readonly providers: ReadonlyMap<string, ProviderRegistration>;
}

/** Validates and brands a {@link WorkspaceId} string. */
export const WorkspaceIdSchema = z
  .string()
  .min(1, { error: 'Workspace id must not be empty' })
  .transform((value) => value as WorkspaceId);

/** Validates the shape of a {@link ProviderRegistration}. */
export const ProviderRegistrationSchema = z.object({
  providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
  capability: z.nativeEnum(ProviderCapability),
  configPath: z.string().min(1, { error: 'Config path must not be empty' }),
  credentialRef: z.string().min(1).optional(),
});

export type ProviderRegistrationShape = z.infer<
  typeof ProviderRegistrationSchema
>;

/** Validates the shape of a {@link WorkspaceConfig}. */
export const WorkspaceConfigSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().min(1, { error: 'Workspace name must not be empty' }),
  createdAt: TimestampSchema,
  providers: z.map(z.string(), ProviderRegistrationSchema).readonly(),
});

export type WorkspaceConfigShape = z.infer<typeof WorkspaceConfigSchema>;
