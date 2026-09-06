import { Injectable } from '@nestjs/common';
import type { LifecycleConfig } from './lifecycle-config.schema.js';
import type {
  ArtifactMetricsSnapshot,
  TransitionRecommendation,
} from './lifecycle.types.js';

@Injectable()
export class LifecyclePolicyService {
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
        if (metric.accessCount < config.warm_access_threshold && metric.hasProvenance) {
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

    recommendations.sort((a, b) => a.rehydrationCost - b.rehydrationCost);

    return recommendations;
  }
}
