import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * SOURCE — the registered origin of knowledge (a provider instance's
 * canonical URI/path). Carries provenance identity (D2), cache/invalidation
 * metadata (D6), and refresh scheduling metadata (D7) in one row, matching
 * the `SOURCE` entity in the H06 knowledge data model ERD.
 *
 * Source identity is stable across re-ingestion: the same
 * (provider_type, provider_instance_id, canonical_uri) triple always
 * resolves to the same row via `sourcesIdentityUnique`.
 */
export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),

    // D2 — provenance identity
    providerType: text('provider_type').notNull(),
    providerInstanceId: text('provider_instance_id').notNull(),
    canonicalUri: text('canonical_uri').notNull(),
    displayName: text('display_name').notNull(),
    authScope: text('auth_scope'),

    // D6 — cache identity and invalidation metadata
    contentHash: text('content_hash'),
    etag: text('etag'),
    contentLength: integer('content_length'),
    lastModified: text('last_modified'),
    ttlSeconds: integer('ttl_seconds'),
    isStale: integer('is_stale', { mode: 'boolean' }).notNull().default(false),
    lastCheckedAt: text('last_checked_at'),
    lastSuccessfulRefreshAt: text('last_successful_refresh_at'),
    lastFailureAt: text('last_failure_at'),
    failureCount: integer('failure_count').notNull().default(0),

    // D7 — refresh scheduling metadata
    refreshIntervalSeconds: integer('refresh_interval_seconds').notNull(),
    nextRefreshDueAt: text('next_refresh_due_at'),

    discoveredAt: text('discovered_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('sources_identity_unique').on(
      table.providerType,
      table.providerInstanceId,
      table.canonicalUri,
    ),
    index('sources_content_hash_idx').on(table.contentHash),
    index('sources_next_refresh_due_idx').on(table.nextRefreshDueAt),
    index('sources_provider_type_idx').on(table.providerType),
  ],
);
