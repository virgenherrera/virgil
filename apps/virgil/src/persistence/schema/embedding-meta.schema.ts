import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { chunks } from './chunks.schema.js';

export const embeddingMeta = sqliteTable(
  'embedding_meta',
  {
    id: text('id').primaryKey(),
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
