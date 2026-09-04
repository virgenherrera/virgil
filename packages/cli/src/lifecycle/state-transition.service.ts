import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseConnection } from '../persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../persistence/persistence.constants.js';
import type {
  Artifact,
  LifecycleState,
} from '../persistence/persistence.types.js';
import { ArtifactRepository } from '../persistence/repositories/artifact.repository.js';
import { lifecycleTransitions } from '../persistence/schema/lifecycle.schema.js';
import { createUlid } from '../shared/primitives.js';
import { REHYDRATION_PROVIDER } from './lifecycle.constants.js';
import { LifecycleMetricsService } from './lifecycle-metrics.service.js';
import type { RehydrationProvider } from './lifecycle.types.js';

/**
 * Valid synchronous transitions. Cold has no valid sync transitions —
 * Cold -> Warm must use {@link StateTransitionService.rehydrate}.
 */
const VALID_SYNC_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  hot: ['warm'],
  warm: ['hot', 'cold'],
};

/**
 * Typed error for invalid lifecycle transitions (e.g. Hot -> Cold
 * direct or Cold -> Hot direct).
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid lifecycle transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Executes lifecycle state transitions (D4). All transitions are atomic:
 * the artifact state is updated and an audit record is written in one
 * synchronous operation. Rehydration (Cold -> Warm) is asynchronous
 * because it involves re-fetching content from the original provider.
 */
@Injectable()
export class StateTransitionService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    private readonly artifactRepository: ArtifactRepository,
    private readonly metricsService: LifecycleMetricsService,
    @Inject(REHYDRATION_PROVIDER)
    private readonly rehydrator: RehydrationProvider | null,
  ) {}

  /**
   * Synchronous lifecycle transition. Handles:
   * - Hot -> Warm: state update, lower refresh priority
   * - Warm -> Cold: state update, marks content for compaction
   * - Warm -> Hot: state update, restore priority
   *
   * Throws {@link InvalidTransitionError} for:
   * - Hot -> Cold (must go through Warm)
   * - Cold -> Hot (must go through Warm)
   * - Cold -> Warm (must use {@link rehydrate})
   */
  transition(artifactId: string, targetState: LifecycleState): Artifact {
    const current = this.artifactRepository.findById(artifactId);
    if (!current) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const currentState = current.lifecycleState;
    const validTargets = VALID_SYNC_TRANSITIONS[currentState] ?? [];

    if (!validTargets.includes(targetState)) {
      throw new InvalidTransitionError(currentState, targetState);
    }

    const updated = this.artifactRepository.updateLifecycleState(
      artifactId,
      targetState,
    );

    this.recordTransition(artifactId, currentState, targetState);

    return updated;
  }

  /**
   * Asynchronous Cold -> Warm rehydration. Calls the rehydration
   * provider to re-fetch content from the original source, then
   * updates state to Warm. On failure, records the error and leaves
   * the artifact in Cold state.
   */
  async rehydrate(artifactId: string): Promise<Artifact> {
    const current = this.artifactRepository.findById(artifactId);
    if (!current) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    if (current.lifecycleState !== 'cold') {
      throw new Error(
        `Cannot rehydrate artifact in state "${current.lifecycleState}" — must be cold`,
      );
    }

    if (!this.rehydrator) {
      throw new Error('No rehydration provider available');
    }

    try {
      await this.rehydrator.rehydrate(artifactId);

      const updated = this.artifactRepository.updateLifecycleState(
        artifactId,
        'warm',
      );

      this.recordTransition(artifactId, 'cold', 'warm');

      return updated;
    } catch (error) {
      // Record failed rehydration attempt: previous and new state are
      // both 'cold', and the error is captured in the metric snapshot.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.recordTransition(artifactId, 'cold', 'cold', {
        error: errorMessage,
        failedAt: Date.now(),
      });

      throw error;
    }
  }

  private recordTransition(
    artifactId: string,
    previousState: string,
    newState: string,
    errorInfo?: Record<string, unknown>,
  ): void {
    const snapshot = this.metricsService.createMetricSnapshot(artifactId);
    const metricSnapshot = errorInfo
      ? JSON.stringify({ ...JSON.parse(snapshot), ...errorInfo })
      : snapshot;

    this.connection.db
      .insert(lifecycleTransitions)
      .values({
        id: createUlid(),
        artifactId,
        previousState,
        newState,
        timestamp: Date.now(),
        metricSnapshot,
      })
      .run();
  }
}
