import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sources } from './sources.schema.js';

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(/* v8 ignore start */ () => sources.id /* v8 ignore stop */, {
        onDelete: 'cascade',
      }),

    contentHash: text('content_hash').notNull(),
    contentLength: integer('content_length').notNull(),

    contentType: text('content_type').notNull(),
    title: text('title').notNull(),
    sourceUri: text('source_uri').notNull(),
    normalizedContent: text('normalized_content').notNull(),

    lifecycleState: text('lifecycle_state').notNull().default('hot'),

    providerId: text('provider_id').notNull(),
    providerCapability: text('provider_capability').notNull(),

    discoveredAt: text('discovered_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('artifacts_content_hash_unique').on(table.contentHash),
    index('artifacts_source_id_idx').on(table.sourceId),
    index('artifacts_provider_id_idx').on(table.providerId),
    index('artifacts_lifecycle_state_idx').on(table.lifecycleState),
  ],
);
