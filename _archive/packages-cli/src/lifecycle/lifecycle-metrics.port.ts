import { z } from 'zod';
import type { ArtifactMetricsSnapshot } from './lifecycle.types.js';

/**
 * Zod schema for storage metrics returned by the lifecycle metrics port.
 */
export const StorageMetricsSchema = z.object({
  dbSizeBytes: z.number().nonnegative(),
  embeddingFootprintBytes: z.number().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  artifactCountByState: z.record(z.string(), z.number().int().nonnegative()),
});

export type StorageMetrics = z.infer<typeof StorageMetricsSchema>;

/**
 * Zod schema for per-artifact lifecycle information.
 */
export const ArtifactLifecycleInfoSchema = z.object({
  artifactId: z.string().min(1),
  lifecycleState: z.enum(['hot', 'warm', 'cold']),
  accessCount: z.number().int().nonnegative(),
  lastAccessTs: z.number().nullable(),
  hasProvenance: z.boolean(),
  chunkCount: z.number().int().nonnegative(),
  embeddingCount: z.number().int().nonnegative(),
});

export type ArtifactLifecycleInfo = z.infer<typeof ArtifactLifecycleInfoSchema>;

/**
 * Zod schema for aggregate statistics across the knowledge base.
 */
export const AggregateStatsSchema = z.object({
  countByState: z.record(z.string(), z.number().int().nonnegative()),
  storageByState: z.record(z.string(), z.number().nonnegative()),
  avgLatencyByState: z.record(z.string(), z.number().nonnegative()),
});

export type AggregateStats = z.infer<typeof AggregateStatsSchema>;

/**
 * Query port for lifecycle metrics (D6). Exposes all metrics,
 * per-artifact state/access/reconstructability, and aggregate stats.
 */
export interface LifecycleMetricsPort {
  /** Aggregate storage metrics for the knowledge base. */
  getStorageMetrics(): StorageMetrics;
  /** Per-artifact lifecycle info (state, access, reconstructability). */
  getPerArtifactMetrics(): ArtifactMetricsSnapshot[];
  /** Aggregate statistics: count/storage/latency by lifecycle state. */
  getAggregateStats(): AggregateStats;
  /** Records an access event for an artifact. */
  recordAccess(artifactId: string, latencyMs?: number): void;
}
