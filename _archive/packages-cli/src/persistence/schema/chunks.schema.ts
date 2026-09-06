import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

/**
 * CHUNK — a retrieval-sized subdivision of an artifact, with positional
 * metadata locating it within the parent's normalized content. Vector
 * storage and chunking strategy belong to H07; this table only persists
 * the chunk boundary and text (D1).
 */
export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunk: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
    artifactId: text('artifact_id')
      .notNull()
      .references(
        /* v8 ignore start */ () => artifacts.id /* v8 ignore stop */,
        {
          onDelete: 'cascade',
        },
      ),
    contentHash: text('content_hash').notNull(),
    content: text('content').notNull(),
    position: integer('position').notNull(),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    /** JSON — headings, surrounding context; validated by Zod on read. */
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('chunks_artifact_position_unique').on(
      table.artifactId,
      table.position,
    ),
    index('chunks_artifact_id_idx').on(table.artifactId),
    index('chunks_content_hash_idx').on(table.contentHash),
  ],
);
