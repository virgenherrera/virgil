import { z } from 'zod';
import type { ContentHash, Timestamp } from '../shared/primitives.js';
import {
  ContentHashSchema,
  SemVerSchema,
  TimestampSchema,
} from '../shared/primitives.js';
import { ProviderCapability } from '../shared/provider.types.js';

export enum AdapterType {
  API = 'api',
  BROWSER = 'browser',
  FILESYSTEM = 'filesystem',
}

export const AdapterTypeSchema = z.nativeEnum(AdapterType);

export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
}

export interface ProviderHealth {
  readonly status: ProviderHealthStatus;
  readonly lastChecked: Timestamp;
  readonly message?: string;
}

export const ProviderHealthSchema = z.object({
  status: z.nativeEnum(ProviderHealthStatus),
  lastChecked: TimestampSchema,
  message: z.string().min(1, { error: 'Message must not be empty' }).optional(),
});

export type ProviderHealthShape = z.infer<typeof ProviderHealthSchema>;

export const ProviderMetadataSchema = z.object({
  id: z.string().min(1, { error: 'Provider id must not be empty' }),
  name: z.string().min(1, { error: 'Provider name must not be empty' }),
  version: SemVerSchema,
  capabilities: z.array(z.nativeEnum(ProviderCapability)).readonly(),
});

export type ProviderMetadataShape = z.infer<typeof ProviderMetadataSchema>;

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

export function createPaginatedResultSchema<ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) {
  return z.object({
    items: z.array(itemSchema).readonly(),
    cursor: z.string().min(1, { error: 'Cursor must not be empty' }).optional(),
    hasMore: z.boolean(),
  });
}

export interface ProviderError {
  readonly provider: z.infer<typeof ProviderMetadataSchema>;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

export const ProviderErrorSchema = z.object({
  provider: ProviderMetadataSchema,
  code: z.string().min(1, { error: 'Error code must not be empty' }),
  message: z.string().min(1, { error: 'Error message must not be empty' }),
  recoverable: z.boolean(),
  cause: z.unknown().optional(),
});

export type ProviderErrorShape = z.infer<typeof ProviderErrorSchema>;

export interface ContentIdentity {
  readonly uri: string;
  readonly hash: ContentHash;
  readonly version?: string;
  readonly discoveredAt: Timestamp;
}

export const ContentIdentitySchema = z.object({
  uri: z.string().min(1, { error: 'URI must not be empty' }),
  hash: ContentHashSchema,
  version: z.string().min(1, { error: 'Version must not be empty' }).optional(),
  discoveredAt: TimestampSchema,
});

export type ContentIdentityShape = z.infer<typeof ContentIdentitySchema>;

export interface DiscoveryScope {
  readonly maxDepth?: number;
  readonly maxItems?: number;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly since?: Timestamp;
}

export const DiscoveryScopeSchema = z.object({
  maxDepth: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
  since: TimestampSchema.optional(),
});

export type DiscoveryScopeShape = z.infer<typeof DiscoveryScopeSchema>;
