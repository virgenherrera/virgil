import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  ChunkContentInputSchema,
  ChunkSchema,
  isoToTimestamp,
  nowIso,
} from '../persistence.types.js';
import type { Chunk, ChunkContentInput } from '../persistence.types.js';
import { createUlid } from '../../shared/primitives.js';
import { chunks } from '../schema/index.js';

type ChunkRow = typeof chunks.$inferSelect;

function toDomain(row: ChunkRow): Chunk {
  return ChunkSchema.parse({
    id: row.id,
    artifactId: row.artifactId,
    contentHash: row.contentHash,
    content: row.content,
    position: row.position,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: isoToTimestamp(row.createdAt),
  });
}

interface PreparedChunkRow {
  readonly id: string;
  readonly artifactId: string;
  readonly contentHash: string;
  readonly content: string;
  readonly position: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly metadata: string | null;
  readonly createdAt: string;
}

function prepareRow(
  artifactId: string,
  rawInput: ChunkContentInput,
  now: string,
): PreparedChunkRow {
  const input = ChunkContentInputSchema.parse(rawInput);
  return {
    id: createUlid(),
    artifactId,
    contentHash: input.contentHash,
    content: input.content,
    position: input.position,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: now,
  };
}

/**
 * Data access for `CHUNK` rows (D1). `insertMany` is the D9 direct-SQL
 * boundary decision for bulk chunk insertion: it drives a single prepared
 * statement inside one `better-sqlite3` transaction instead of Drizzle's
 * query builder. See
 * `docs/decisions/0001-orm-vs-direct-sql-boundary.md` for the
 * measured rationale.
 */
@Injectable()
export class ChunkRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  /**
   * Inserts every chunk of an artifact in one atomic, direct-SQL batch
   * (D9 candidate A). Returns the inserted chunks in their original order.
   */
  insertMany(
    artifactId: string,
    inputs: readonly ChunkContentInput[],
  ): Chunk[] {
    if (inputs.length === 0) {
      return [];
    }

    const now = nowIso();
    const rows = inputs.map((input) => prepareRow(artifactId, input, now));

    const statement = this.connection.sqlite.prepare(
      `INSERT INTO chunks
         (id, artifact_id, content_hash, content, position, start_offset, end_offset, metadata, created_at)
       VALUES (@id, @artifactId, @contentHash, @content, @position, @startOffset, @endOffset, @metadata, @createdAt)`,
    );
    const insertAll = this.connection.sqlite.transaction(
      (batch: readonly PreparedChunkRow[]) => {
        for (const row of batch) {
          statement.run(row);
        }
      },
    );
    insertAll(rows);

    return rows.map((row) =>
      toDomain({
        id: row.id,
        artifactId: row.artifactId,
        contentHash: row.contentHash,
        content: row.content,
        position: row.position,
        startOffset: row.startOffset,
        endOffset: row.endOffset,
        metadata: row.metadata,
        createdAt: row.createdAt,
      }),
    );
  }

  findById(id: string): Chunk | undefined {
    const row = this.connection.db
      .select()
      .from(chunks)
      .where(eq(chunks.id, id))
      .get();
    return row ? toDomain(row) : undefined;
  }

  listByArtifact(artifactId: string): Chunk[] {
    const rows = this.connection.db
      .select()
      .from(chunks)
      .where(eq(chunks.artifactId, artifactId))
      .orderBy(asc(chunks.position))
      .all();
    return rows.map(toDomain);
  }

  deleteByArtifact(artifactId: string): number {
    const result = this.connection.db
      .delete(chunks)
      .where(eq(chunks.artifactId, artifactId))
      .run();
    return result.changes;
  }

  count(): number {
    return this.connection.db.select().from(chunks).all().length;
  }
}
