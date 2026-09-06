import type { LifecycleState } from '../persistence/persistence.types.js';

/**
 * Per-artifact metrics snapshot consumed by the policy engine.
 * This is a plain data transfer object — the policy engine is a
 * pure function of these values plus config.
 */
export interface ArtifactMetricsSnapshot {
  readonly artifactId: string;
  readonly lifecycleState: LifecycleState;
  readonly accessCount: number;
  readonly lastAccessTs: number | null;
  /** Whether the artifact has provenance records enabling reconstruction. */
  readonly hasProvenance: boolean;
  readonly chunkCount: number;
  readonly embeddingCount: number;
}

/**
 * A ranked recommendation for a lifecycle state transition.
 */
export interface TransitionRecommendation {
  readonly artifactId: string;
  readonly currentState: LifecycleState;
  readonly recommendedState: LifecycleState;
  readonly reason: string;
  /** Lower value = cheaper to rehydrate later. Used for sorting. */
  readonly rehydrationCost: number;
}

/**
 * Report returned by the compaction service after a compact operation.
 */
export interface CompactionReport {
  readonly bytesReclaimed: number;
  readonly artifactsAffected: number;
  readonly chunksRemoved: number;
  readonly embeddingsRemoved: number;
  readonly elapsedMs: number;
}

/**
 * Port interface for rehydrating a Cold artifact back to Warm state.
 * Implemented by the provider/ingestion layer; the lifecycle module
 * consumes this port without depending on specific providers.
 */
export interface RehydrationProvider {
  /** Re-fetches content from the original source and re-creates chunks/embeddings. */
  rehydrate(artifactId: string): Promise<void>;
}
