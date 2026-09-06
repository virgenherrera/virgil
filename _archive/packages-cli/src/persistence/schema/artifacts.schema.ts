import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sources } from './sources.schema.js';

/**
 * ARTIFACT — a normalized, provider-agnostic piece of ingested content.
 *
 * Content identity is global and content-addressed: `contentHash` is
 * unique across the whole table (D3). Identical content discovered through
 * two different sources/providers collapses into a single artifact row;
 * the per-discovery event is recorded separately in `provenance_records`,
 * which references both this artifact and the source that produced it.
 *
 * Column names mirror `KnowledgeArtifact` (`src/shared/knowledge.types.ts`)
 * where the concepts overlap (`content_hash`, `title`, `provider_id`,
 * `provider_capability`, `discovered_at` -> `createdAt`, `updated_at`) so
 * the repository layer can map a row onto that contract with a pure field
 * rename, plus persistence-only extensions (`source_id`, `content_length`,
 * `normalized_content`, `lifecycle_state`) that the contract does not carry.
 */
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    // Lazy FK-reference thunk: invoked only by drizzle-kit's own
    // migration generator, never by the runtime query engine, so it is
    // not exercised by app-level integration tests.
    sourceId: text('source_id')
      .notNull()
      .references(/* v8 ignore start */ () => sources.id /* v8 ignore stop */, {
        onDelete: 'cascade',
      }),

    // D3 — content identity and deduplication
    contentHash: text('content_hash').notNull(),
    contentLength: integer('content_length').notNull(),

    contentType: text('content_type').notNull(),
    title: text('title').notNull(),
    sourceUri: text('source_uri').notNull(),
    normalizedContent: text('normalized_content').notNull(),

    /** H15 hot/warm/cold lifecycle state; opaque to this handoff. */
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
