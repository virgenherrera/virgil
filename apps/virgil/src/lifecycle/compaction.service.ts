import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../persistence/persistence.constants.js';
import { ChunkRepository } from '../persistence/repositories/chunk.repository.js';
import { artifacts } from '../persistence/schema/artifacts.schema.js';
import { chunks } from '../persistence/schema/chunks.schema.js';
import { embeddingMeta } from '../persistence/schema/embedding-meta.schema.js';
import type { CompactionReport } from './lifecycle.types.js';

@Injectable()
export class CompactionService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    private readonly chunkRepository: ChunkRepository,
  ) {}

  compact(): CompactionReport {
    const start = Date.now();

    const coldArtifacts = this.connection.db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(eq(artifacts.lifecycleState, 'cold'))
      .all();

    let totalChunksRemoved = 0;
    let totalEmbeddingsRemoved = 0;
    let artifactsAffected = 0;

    for (const { id } of coldArtifacts) {
      const artifactChunks = this.connection.db
        .select({ id: chunks.id })
        .from(chunks)
        .where(eq(chunks.artifactId, id))
        .all();

      if (artifactChunks.length === 0) {
        continue;
      }

      let embeddingCount = 0;
      for (const chunk of artifactChunks) {
        embeddingCount += this.connection.db
          .select()
          .from(embeddingMeta)
          .where(eq(embeddingMeta.chunkId, chunk.id))
          .all().length;
      }

      const deleted = this.chunkRepository.deleteByArtifact(id);

      totalChunksRemoved += deleted;
      totalEmbeddingsRemoved += embeddingCount;
      artifactsAffected++;
    }

    const sizeBefore = this.getDbSizeBytes();
    this.connection.sqlite.exec('VACUUM');
    const sizeAfter = this.getDbSizeBytes();
    const bytesReclaimed = Math.max(0, sizeBefore - sizeAfter);

    const elapsedMs = Date.now() - start;

    return {
      bytesReclaimed,
      artifactsAffected,
      chunksRemoved: totalChunksRemoved,
      embeddingsRemoved: totalEmbeddingsRemoved,
      elapsedMs,
    };
  }

  private getDbSizeBytes(): number {
    const pageCount = this.connection.sqlite.pragma('page_count', {
      simple: true,
    }) as number;
    const pageSize = this.connection.sqlite.pragma('page_size', {
      simple: true,
    }) as number;
    return pageCount * pageSize;
  }
}
