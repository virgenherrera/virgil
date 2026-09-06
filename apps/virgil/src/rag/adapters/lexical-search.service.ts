import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseConnection } from '../../persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../../persistence/persistence.constants.js';

export interface LexicalMatch {
  readonly chunkId: string;
  readonly content: string;
  readonly score: number;
}

@Injectable()
export class LexicalSearchService {
  private initialized = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  ensureIndex(): void {
    if (this.initialized) return;

    this.connection.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        chunk_id UNINDEXED,
        content
      )
    `);
    this.initialized = true;
  }

  indexChunk(chunkId: string, content: string): void {
    this.ensureIndex();
    this.connection.sqlite
      .prepare('INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)')
      .run(chunkId, content);
  }

  indexChunks(entries: readonly { chunkId: string; content: string }[]): void {
    if (entries.length === 0) return;
    this.ensureIndex();

    const stmt = this.connection.sqlite.prepare(
      'INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)',
    );
    const insertAll = this.connection.sqlite.transaction(
      (batch: readonly { chunkId: string; content: string }[]) => {
        for (const entry of batch) {
          stmt.run(entry.chunkId, entry.content);
        }
      },
    );
    insertAll(entries);
  }

  removeChunk(chunkId: string): void {
    this.ensureIndex();
    this.connection.sqlite
      .prepare('DELETE FROM chunks_fts WHERE chunk_id = ?')
      .run(chunkId);
  }

  search(query: string, limit: number): LexicalMatch[] {
    this.ensureIndex();

    const sanitized = this.sanitizeQuery(query);
    if (!sanitized) return [];

    const rows = this.connection.sqlite
      .prepare(
        `SELECT chunk_id, content, bm25(chunks_fts) AS score
         FROM chunks_fts
         WHERE content MATCH ?
         ORDER BY bm25(chunks_fts)
         LIMIT ?`,
      )
      .all(sanitized, limit) as Array<{
      chunk_id: string;
      content: string;
      score: number;
    }>;

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      content: row.content,
      // FTS5 bm25() returns negative values (lower = better match).
      // Negate so that higher = better.
      score: -row.score,
    }));
  }

  private sanitizeQuery(query: string): string {
    const tokens = query
      .replace(/[*+\-^~":(){}[\]]/g, ' ')
      .split(/\s+/)
      .filter((token) => {
        const upper = token.toUpperCase();
        return (
          token.length > 0 &&
          upper !== 'AND' &&
          upper !== 'OR' &&
          upper !== 'NOT' &&
          upper !== 'NEAR'
        );
      });

    if (tokens.length === 0) return '';

    return tokens.map((t) => `"${t}"`).join(' ');
  }
}
