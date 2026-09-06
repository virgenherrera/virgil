import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  CreateEmbeddingMetaInputSchema,
  EmbeddingMetaSchema,
  isoToTimestamp,
} from '../persistence.types.js';
import type {
  CreateEmbeddingMetaInput,
  EmbeddingMeta,
  EmbeddingStatus,
} from '../persistence.types.js';
import { createTimestamp, createUlid } from '../../shared/primitives.js';
import { embeddingMeta } from '../schema/index.js';

type EmbeddingMetaRow = typeof embeddingMeta.$inferSelect;

function toDomain(row: EmbeddingMetaRow): EmbeddingMeta {
  return EmbeddingMetaSchema.parse({
    id: row.id,
    chunkId: row.chunkId,
    modelId: row.modelId,
    dimensions: row.dimensions,
    generatedAt: row.generatedAt ? isoToTimestamp(row.generatedAt) : undefined,
    status: row.status,
  });
}

/**
 * Data access for `EMBEDDING_META` rows: identity and dimensional
 * metadata only, per the H06/H07 boundary — vector storage, similarity
 * search, and embedding generation belong to H07.
 */
@Injectable()
export class EmbeddingMetaRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  create(rawInput: CreateEmbeddingMetaInput): EmbeddingMeta {
    const input = CreateEmbeddingMetaInputSchema.parse(rawInput);
    const row = {
      id: createUlid(),
      chunkId: input.chunkId,
      modelId: input.modelId,
      dimensions: input.dimensions,
      generatedAt: null,
      status: input.status,
    };

    this.connection.db.insert(embeddingMeta).values(row).run();
    return toDomain(row);
  }

  findById(id: string): EmbeddingMeta | undefined {
    const row = this.connection.db
      .select()
      .from(embeddingMeta)
      .where(eq(embeddingMeta.id, id))
      .get();
    return row ? toDomain(row) : undefined;
  }

  findByChunk(chunkId: string): EmbeddingMeta | undefined {
    const row = this.connection.db
      .select()
      .from(embeddingMeta)
      .where(eq(embeddingMeta.chunkId, chunkId))
      .get();
    return row ? toDomain(row) : undefined;
  }

  updateStatus(
    id: string,
    status: EmbeddingStatus,
    generatedAt?: EmbeddingMeta['generatedAt'],
  ): EmbeddingMeta {
    const current = this.findById(id);
    if (!current) {
      throw new Error(`Cannot update unknown embedding metadata "${id}"`);
    }

    const resolvedGeneratedAt = generatedAt ?? createTimestamp();
    this.connection.db
      .update(embeddingMeta)
      .set({ status, generatedAt: new Date(resolvedGeneratedAt).toISOString() })
      .where(eq(embeddingMeta.id, id))
      .run();

    return EmbeddingMetaSchema.parse({
      ...current,
      status,
      generatedAt: resolvedGeneratedAt,
    });
  }
}
