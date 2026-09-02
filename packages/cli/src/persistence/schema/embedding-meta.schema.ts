import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { chunks } from './chunks.schema.js';

/**
 * EMBEDDING_META — identity and dimensional metadata for a chunk's
 * embedding, intentionally metadata-only. Vector storage, similarity
 * search, and embedding generation belong to H07; this table exists so
 * H07 can extend the knowledge graph without migrating `chunks` (D1,
 * out-of-scope boundary documented in the handoff).
 */
export const embeddingMeta = sqliteTable(
  'embedding_meta',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunk: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
    chunkId: text('chunk_id')
      .notNull()
      .references(/* v8 ignore start */ () => chunks.id /* v8 ignore stop */, {
        onDelete: 'cascade',
      }),
    modelId: text('model_id').notNull(),
    dimensions: integer('dimensions').notNull(),
    generatedAt: text('generated_at'),
    status: text('status').notNull().default('pending'),
  },
  (table) => [
    uniqueIndex('embedding_meta_chunk_id_unique').on(table.chunkId),
    index('embedding_meta_status_idx').on(table.status),
  ],
);
