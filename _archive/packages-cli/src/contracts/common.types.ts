import { z } from 'zod';
import type { ContentHash, Timestamp } from '../shared/primitives.js';
import {
  ContentHashSchema,
  SemVerSchema,
  TimestampSchema,
} from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import { ProviderCapability } from '../shared/provider.types.js';

/**
 * Adapter implementation family. Every concrete adapter belongs to exactly
 * one family: a vendor REST/GraphQL API client, a PW CDP browser-automation
 * session, or a local filesystem indexer. Contracts never depend on this
 * enum for behavior — it exists purely as registration metadata so the
 * {@link ProviderRegistry} can report which family backs a resolved
 * provider without inspecting its implementation.
 */
export enum AdapterType {
  API = 'api',
  BROWSER = 'browser',
  FILESYSTEM = 'filesystem',
}

/** Validates an {@link AdapterType} value. */
export const AdapterTypeSchema = z.nativeEnum(AdapterType);

/** Connectivity/readiness classification reported by a provider's `health()` method. */
export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
}

/**
 * Rich health snapshot returned by capability-specific contract methods.
 *
 * This is distinct from {@link ProviderStatus} (the base `Provider`
 * connection lifecycle state returned by `healthCheck()`): `ProviderHealth`
 * captures a point-in-time readiness assessment intended for operator-facing
 * diagnostics, while `ProviderStatus` tracks the adapter's own lifecycle.
 */
export interface ProviderHealth {
  readonly status: ProviderHealthStatus;
  readonly lastChecked: Timestamp;
  readonly message?: string;
}

/** Validates the shape of a {@link ProviderHealth}. */
export const ProviderHealthSchema = z.object({
  status: z.nativeEnum(ProviderHealthStatus),
  lastChecked: TimestampSchema,
  message: z.string().min(1, { error: 'Message must not be empty' }).optional(),
});

export type ProviderHealthShape = z.infer<typeof ProviderHealthSchema>;

/**
 * Validates the shape of a {@link ProviderMetadata}.
 *
 * `ProviderMetadata` is defined in the shared foundation layer without a
 * companion schema; this contract layer supplies the runtime validator
 * needed to validate {@link ProviderError.provider} payloads.
 */
export const ProviderMetadataSchema = z.object({
  id: z.string().min(1, { error: 'Provider id must not be empty' }),
  name: z.string().min(1, { error: 'Provider name must not be empty' }),
  version: SemVerSchema,
  capabilities: z.array(z.nativeEnum(ProviderCapability)).readonly(),
});

export type ProviderMetadataShape = z.infer<typeof ProviderMetadataSchema>;

/** Cursor-paginated result envelope shared by every discovery/listing method. */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

/** Builds a Zod schema validating a {@link PaginatedResult} of `itemSchema`. */
export function createPaginatedResultSchema<ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) {
  return z.object({
    items: z.array(itemSchema).readonly(),
    cursor: z.string().min(1, { error: 'Cursor must not be empty' }).optional(),
    hasMore: z.boolean(),
  });
}

/** Structured, provider-attributed error surfaced by any contract method. */
export interface ProviderError {
  readonly provider: ProviderMetadata;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

/** Validates the shape of a {@link ProviderError}. */
export const ProviderErrorSchema = z.object({
  provider: ProviderMetadataSchema,
  code: z.string().min(1, { error: 'Error code must not be empty' }),
  message: z.string().min(1, { error: 'Error message must not be empty' }),
  recoverable: z.boolean(),
  cause: z.unknown().optional(),
});

export type ProviderErrorShape = z.infer<typeof ProviderErrorSchema>;

/**
 * Identity of a piece of fetched content, used for deduplication and
 * provenance tracking across every provider contract.
 */
export interface ContentIdentity {
  readonly uri: string;
  readonly hash: ContentHash;
  readonly version?: string;
  readonly discoveredAt: Timestamp;
}

/** Validates the shape of a {@link ContentIdentity}. */
export const ContentIdentitySchema = z.object({
  uri: z.string().min(1, { error: 'URI must not be empty' }),
  hash: ContentHashSchema,
  version: z.string().min(1, { error: 'Version must not be empty' }).optional(),
  discoveredAt: TimestampSchema,
});

export type ContentIdentityShape = z.infer<typeof ContentIdentitySchema>;

/**
 * Progressive-discovery boundary: what to fetch and how deep/wide/recent the
 * discovery should reach. Every discovery-shaped contract method accepts
 * this to bound cost and scope.
 */
export interface DiscoveryScope {
  readonly maxDepth?: number;
  readonly maxItems?: number;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly since?: Timestamp;
}

/** Validates the shape of a {@link DiscoveryScope}. */
export const DiscoveryScopeSchema = z.object({
  maxDepth: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
  since: TimestampSchema.optional(),
});

export type DiscoveryScopeShape = z.infer<typeof DiscoveryScopeSchema>;
