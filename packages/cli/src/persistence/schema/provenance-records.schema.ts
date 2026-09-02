import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { artifacts } from './artifacts.schema.js';
import { sources } from './sources.schema.js';

/**
 * PROVENANCE_RECORD — an immutable audit-trail row answering "where did
 * this knowledge come from, and when was it fetched?" (D2).
 *
 * One artifact can accumulate multiple provenance records over time: a
 * re-check that resulted in a cache hit still records a provenance event
 * (`fetchedAt` advances, `contentHashAtFetch` stays the same), and content
 * discovered independently through a second source/provider links the
 * existing artifact to that source without creating a duplicate artifact
 * row (see `artifacts.schema.ts`).
 *
 * Column names mirror `ProvenanceRecord`
 * (`src/shared/knowledge.types.ts`) exactly, so a row maps onto that
 * contract with a pure field rename.
 */
export const provenanceRecords = sqliteTable(
  'provenance_records',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunks below: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine.
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
