import { z } from 'zod';
import type { ArtifactMetricsSnapshot } from './lifecycle.types.js';

export const StorageMetricsSchema = z.object({
  dbSizeBytes: z.number().nonnegative(),
  embeddingFootprintBytes: z.number().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  artifactCountByState: z.record(z.string(), z.number().int().nonnegative()),
});

export type StorageMetrics = z.infer<typeof StorageMetricsSchema>;

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

export const AggregateStatsSchema = z.object({
  countByState: z.record(z.string(), z.number().int().nonnegative()),
  storageByState: z.record(z.string(), z.number().nonnegative()),
  avgLatencyByState: z.record(z.string(), z.number().nonnegative()),
});

export type AggregateStats = z.infer<typeof AggregateStatsSchema>;

export interface LifecycleMetricsPort {
  getStorageMetrics(): StorageMetrics;
  getPerArtifactMetrics(): ArtifactMetricsSnapshot[];
  getAggregateStats(): AggregateStats;
  recordAccess(artifactId: string, latencyMs?: number): void;
}
