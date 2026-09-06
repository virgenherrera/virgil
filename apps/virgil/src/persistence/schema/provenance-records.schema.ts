import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';
import { sources } from './sources.schema.js';

export const provenanceRecords = sqliteTable(
  'provenance_records',
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
    sourceId: text('source_id')
      .notNull()
      .references(/* v8 ignore start */ () => sources.id /* v8 ignore stop */, {
        onDelete: 'cascade',
      }),
    sourceUri: text('source_uri').notNull(),
    fetchedAt: text('fetched_at').notNull(),
    fetchedBy: text('fetched_by').notNull(),
    contentHashAtFetch: text('content_hash_at_fetch').notNull(),
  },
  (table) => [
    index('provenance_records_artifact_idx').on(table.artifactId),
    index('provenance_records_source_idx').on(table.sourceId),
    index('provenance_records_fetched_at_idx').on(table.fetchedAt),
  ],
);
