import { z } from 'zod';
import type { Brand, Timestamp } from './primitives.js';
import { TimestampSchema } from './primitives.js';
import { ProviderCapability } from './provider.types.js';

export type WorkspaceId = Brand<string, 'WorkspaceId'>;

export interface StateDirectoryPaths {
  readonly config: string;
  readonly data: string;
  readonly cache: string;
  readonly state: string;
}

export interface ProviderRegistration {
  readonly providerId: string;
  readonly capability: ProviderCapability;
  readonly configPath: string;
  readonly credentialRef?: string;
}

export interface WorkspaceConfig {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly createdAt: Timestamp;
  readonly providers: ReadonlyMap<string, ProviderRegistration>;
}

export const WorkspaceIdSchema = z
  .string()
  .min(1, { error: 'Workspace id must not be empty' })
  .transform((value) => value as WorkspaceId);

export const ProviderRegistrationSchema = z.object({
  providerId: z.string().min(1, { error: 'Provider id must not be empty' }),
  capability: z.nativeEnum(ProviderCapability),
  configPath: z.string().min(1, { error: 'Config path must not be empty' }),
  credentialRef: z.string().min(1).optional(),
});

export type ProviderRegistrationShape = z.infer<
  typeof ProviderRegistrationSchema
>;

export const WorkspaceConfigSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().min(1, { error: 'Workspace name must not be empty' }),
  createdAt: TimestampSchema,
  providers: z.map(z.string(), ProviderRegistrationSchema).readonly(),
});

export type WorkspaceConfigShape = z.infer<typeof WorkspaceConfigSchema>;
