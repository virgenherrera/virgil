import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../persistence/persistence.constants.js';
import { LifecycleState } from '../persistence/persistence.types.js';
import { artifacts } from '../persistence/schema/artifacts.schema.js';
import { chunks } from '../persistence/schema/chunks.schema.js';
import { embeddingMeta } from '../persistence/schema/embedding-meta.schema.js';
import { provenanceRecords } from '../persistence/schema/provenance-records.schema.js';
import type {
  AggregateStats,
  LifecycleMetricsPort,
  StorageMetrics,
} from './lifecycle-metrics.port.js';
import type { ArtifactMetricsSnapshot } from './lifecycle.types.js';

interface AccessRecord {
  count: number;
  lastTs: number | null;
  latencies: number[];
}

/**
 * Collects and persists lifecycle metrics (D2). Storage metrics are
 * computed on-the-fly from SQLite; access metrics are tracked in memory
 * and persisted as metric snapshots in lifecycle transition records.
 */
@Injectable()
export class LifecycleMetricsService implements LifecycleMetricsPort {
  private readonly accessMap = new Map<string, AccessRecord>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  getStorageMetrics(): StorageMetrics {
    const pageCount = this.connection.sqlite.pragma('page_count', {
      simple: true,
    }) as number;
    const pageSize = this.connection.sqlite.pragma('page_size', {
      simple: true,
    }) as number;
    const dbSizeBytes = pageCount * pageSize;

    const chunkCount = this.connection.db.select().from(chunks).all().length;

    // Approximate embedding footprint: count * dimensions * 4 bytes (float32)
    const embeddingRows = this.connection.db
      .select()
      .from(embeddingMeta)
      .all();
    const embeddingFootprintBytes = embeddingRows.reduce(
      (sum, row) => sum + row.dimensions * 4,
      0,
    );

    const allArtifacts = this.connection.db.select().from(artifacts).all();
    const artifactCountByState: Record<string, number> = {
      [LifecycleState.HOT]: 0,
      [LifecycleState.WARM]: 0,
      [LifecycleState.COLD]: 0,
    };
    for (const a of allArtifacts) {
      artifactCountByState[a.lifecycleState] =
        (artifactCountByState[a.lifecycleState] ?? 0) + 1;
    }

    return {
      dbSizeBytes,
      embeddingFootprintBytes,
      chunkCount,
      artifactCountByState,
    };
  }

  getPerArtifactMetrics(): ArtifactMetricsSnapshot[] {
    const allArtifacts = this.connection.db.select().from(artifacts).all();

    return allArtifacts.map((artifact) => {
      const artifactChunks = this.connection.db
        .select({ id: chunks.id })
        .from(chunks)
        .where(eq(chunks.artifactId, artifact.id))
        .all();

      let embeddingCount = 0;
      for (const chunk of artifactChunks) {
        embeddingCount += this.connection.db
          .select()
          .from(embeddingMeta)
          .where(eq(embeddingMeta.chunkId, chunk.id))
          .all().length;
      }

      const hasProvenance =
        this.connection.db
          .select()
          .from(provenanceRecords)
          .where(eq(provenanceRecords.artifactId, artifact.id))
          .all().length > 0;

      const access = this.accessMap.get(artifact.id);

      return {
        artifactId: artifact.id,
        lifecycleState: artifact.lifecycleState as ArtifactMetricsSnapshot['lifecycleState'],
        accessCount: access?.count ?? 0,
        lastAccessTs: access?.lastTs ?? null,
        hasProvenance,
        chunkCount: artifactChunks.length,
        embeddingCount,
      };
    });
  }

  getAggregateStats(): AggregateStats {
    const perArtifact = this.getPerArtifactMetrics();

    const countByState: Record<string, number> = {};
    const storageByState: Record<string, number> = {};
    const latencySumByState: Record<
      string,
      { total: number; count: number }
    > = {};

    for (const metric of perArtifact) {
      const state = metric.lifecycleState;
      countByState[state] = (countByState[state] ?? 0) + 1;
      storageByState[state] =
        (storageByState[state] ?? 0) + metric.chunkCount;

      const access = this.accessMap.get(metric.artifactId);
      if (access && access.latencies.length > 0) {
        if (!latencySumByState[state]) {
          latencySumByState[state] = { total: 0, count: 0 };
        }
        const avg =
          access.latencies.reduce((s, l) => s + l, 0) /
          access.latencies.length;
        latencySumByState[state]!.total += avg;
        latencySumByState[state]!.count += 1;
      }
    }

    const avgLatencyByState: Record<string, number> = {};
    for (const [state, { total, count }] of Object.entries(
      latencySumByState,
    )) {
      avgLatencyByState[state] = count > 0 ? total / count : 0;
    }

    return { countByState, storageByState, avgLatencyByState };
  }

  recordAccess(artifactId: string, latencyMs = 0): void {
    const existing = this.accessMap.get(artifactId) ?? {
      count: 0,
      lastTs: null,
      latencies: [],
    };
    existing.count += 1;
    existing.lastTs = Date.now();
    existing.latencies.push(latencyMs);
    this.accessMap.set(artifactId, existing);
  }

  /** Returns a JSON-serializable snapshot for embedding in transition records. */
  createMetricSnapshot(artifactId: string): string {
    const access = this.accessMap.get(artifactId);
    return JSON.stringify({
      timestamp: Date.now(),
      accessCount: access?.count ?? 0,
      lastAccessTs: access?.lastTs ?? null,
    });
  }
}
