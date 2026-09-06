import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseConnection } from '../../persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../../persistence/persistence.constants.js';

/** A single BM25-ranked full-text search hit. */
export interface LexicalMatch {
  readonly chunkId: string;
  readonly content: string;
  readonly score: number;
}

/**
 * Lexical search module (D4) backed by SQLite FTS5 with BM25 scoring.
 * Owns the FTS5 virtual table definition — the base `chunks` table is
 * owned by H06 persistence.
 */
@Injectable()
export class LexicalSearchService {
  private initialized = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  /**
   * Ensures the FTS5 virtual table exists. Called lazily on first
   * search or index operation.
   */
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

  /** Indexes a single chunk for full-text search. */
  indexChunk(chunkId: string, content: string): void {
    this.ensureIndex();
    this.connection.sqlite
      .prepare('INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)')
      .run(chunkId, content);
  }

  /** Indexes multiple chunks atomically inside a single transaction. */
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

  /** Removes a chunk from the FTS index. */
  removeChunk(chunkId: string): void {
    this.ensureIndex();
    this.connection.sqlite
      .prepare('DELETE FROM chunks_fts WHERE chunk_id = ?')
      .run(chunkId);
  }

  /**
   * Searches the FTS5 index using BM25 ranking.
   *
   * The query is sanitized to prevent FTS5 syntax injection: special
   * characters and reserved keywords are stripped, and each remaining
   * token is double-quoted.
   */
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

  /**
   * Sanitizes user input to prevent FTS5 syntax injection. Strips
   * special FTS5 operators and wraps each surviving token in double
   * quotes so they are treated as literal terms.
   */
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
