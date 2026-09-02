import { Injectable } from '@nestjs/common';
import type { LifecycleConfig } from './lifecycle-config.schema.js';
import type {
  ArtifactMetricsSnapshot,
  TransitionRecommendation,
} from './lifecycle.types.js';

/**
 * Pure-function policy engine (D3). Given per-artifact metrics and a
 * lifecycle configuration, returns ranked transition recommendations
 * sorted by rehydration cost (ascending — cheapest to rehydrate first).
 *
 * This service has NO side effects and NO dependencies on the database
 * or any stateful service. Determinism guarantee: identical inputs
 * always produce identical outputs.
 */
@Injectable()
export class LifecyclePolicyService {
  /**
   * Evaluates per-artifact metrics against config thresholds and
   * returns a list of recommended lifecycle transitions.
   *
   * Rules:
   * - Hot artifacts with access_count < hot_access_threshold -> recommend Warm
   * - Warm artifacts with access_count < warm_access_threshold -> recommend Cold
   *   (only if reconstructable — hasProvenance is true)
   * - Recommendations sorted by rehydration cost (ascending)
   */
  evaluate(
    perArtifact: readonly ArtifactMetricsSnapshot[],
    config: LifecycleConfig,
  ): TransitionRecommendation[] {
    const recommendations: TransitionRecommendation[] = [];

    for (const metric of perArtifact) {
      const rehydrationCost = metric.chunkCount + metric.embeddingCount;

      if (metric.lifecycleState === 'hot') {
        if (metric.accessCount < config.hot_access_threshold) {
          recommendations.push({
            artifactId: metric.artifactId,
            currentState: 'hot',
            recommendedState: 'warm',
            reason: `Access count ${metric.accessCount} below hot threshold ${config.hot_access_threshold}`,
            rehydrationCost,
          });
        }
      } else if (metric.lifecycleState === 'warm') {
        if (metric.accessCount < config.warm_access_threshold) {
          // Reconstructability gate: only recommend Cold if artifact
          // has provenance records enabling reconstruction
          if (metric.hasProvenance) {
            recommendations.push({
              artifactId: metric.artifactId,
              currentState: 'warm',
              recommendedState: 'cold',
              reason: `Access count ${metric.accessCount} below warm threshold ${config.warm_access_threshold} and reconstructable`,
              rehydrationCost,
            });
          }
        }
      }
    }

    // Sort by rehydration cost ascending (cheapest to rehydrate first)
    recommendations.sort((a, b) => a.rehydrationCost - b.rehydrationCost);

    return recommendations;
  }
}
