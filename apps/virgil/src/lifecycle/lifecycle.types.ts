import type { LifecycleState } from '../persistence/persistence.types.js';

export interface ArtifactMetricsSnapshot {
  readonly artifactId: string;
  readonly lifecycleState: LifecycleState;
  readonly accessCount: number;
  readonly lastAccessTs: number | null;
  readonly hasProvenance: boolean;
  readonly chunkCount: number;
  readonly embeddingCount: number;
}

export interface TransitionRecommendation {
  readonly artifactId: string;
  readonly currentState: LifecycleState;
  readonly recommendedState: LifecycleState;
  readonly reason: string;
  readonly rehydrationCost: number;
}

export interface CompactionReport {
  readonly bytesReclaimed: number;
  readonly artifactsAffected: number;
  readonly chunksRemoved: number;
  readonly embeddingsRemoved: number;
  readonly elapsedMs: number;
}

export interface RehydrationProvider {
  rehydrate(artifactId: string): Promise<void>;
}
