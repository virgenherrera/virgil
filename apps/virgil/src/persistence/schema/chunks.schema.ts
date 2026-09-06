import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';

export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').primaryKey(),
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
