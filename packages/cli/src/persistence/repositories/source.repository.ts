import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  CreateSourceInputSchema,
  RecordSourceFetchInputSchema,
  SourceSchema,
  isoToTimestamp,
  nowIso,
  timestampToIso,
} from '../persistence.types.js';
import type {
  CreateSourceInput,
  RecordSourceFetchInput,
  Source,
} from '../persistence.types.js';
import { createTimestamp, createUlid } from '../../shared/primitives.js';
import type { Timestamp } from '../../shared/primitives.js';
import { sources } from '../schema/index.js';

type SourceRow = typeof sources.$inferSelect;

/** Maps a raw row onto the {@link Source} domain shape through `SourceSchema.parse` (D8). */
function toDomain(row: SourceRow): Source {
  return SourceSchema.parse({
    id: row.id,
    providerType: row.providerType,
    providerInstanceId: row.providerInstanceId,
    canonicalUri: row.canonicalUri,
    displayName: row.displayName,
    authScope: row.authScope ?? undefined,
    contentHash: row.contentHash ?? undefined,
    etag: row.etag ?? undefined,
    contentLength: row.contentLength ?? undefined,
    lastModified: row.lastModified ?? undefined,
    ttlSeconds: row.ttlSeconds ?? undefined,
    isStale: row.isStale,
    lastCheckedAt: row.lastCheckedAt
      ? isoToTimestamp(row.lastCheckedAt)
      : undefined,
    lastSuccessfulRefreshAt: row.lastSuccessfulRefreshAt
      ? isoToTimestamp(row.lastSuccessfulRefreshAt)
      : undefined,
    lastFailureAt: row.lastFailureAt
      ? isoToTimestamp(row.lastFailureAt)
      : undefined,
    failureCount: row.failureCount,
    refreshIntervalSeconds: row.refreshIntervalSeconds,
    nextRefreshDueAt: row.nextRefreshDueAt
      ? isoToTimestamp(row.nextRefreshDueAt)
      : undefined,
    discoveredAt: isoToTimestamp(row.discoveredAt),
    updatedAt: isoToTimestamp(row.updatedAt),
  });
}

/**
 * Data access for `SOURCE` rows: provenance identity (D2), cache
 * identity/invalidation (D6), and refresh scheduling (D7). Every method
 * accepts and returns the {@link Source} domain shape — no Drizzle row
 * type crosses this class's public boundary.
 */
@Injectable()
export class SourceRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  /**
   * Finds the source by its stable identity triple
   * (`providerType`, `providerInstanceId`, `canonicalUri`) if one exists,
   * or creates it. Source identity is stable across re-ingestion (D2).
   */
  findOrCreate(rawInput: CreateSourceInput): Source {
    const input = CreateSourceInputSchema.parse(rawInput);
    const existing = this.findByIdentity(
      input.providerType,
      input.providerInstanceId,
      input.canonicalUri,
    );
    if (existing) {
      return existing;
    }

    const now = nowIso();
    const row = {
      id: createUlid(),
      providerType: input.providerType,
      providerInstanceId: input.providerInstanceId,
      canonicalUri: input.canonicalUri,
      displayName: input.displayName,
      authScope: input.authScope ?? null,
      contentHash: null,
      etag: null,
      contentLength: null,
      lastModified: null,
      ttlSeconds: null,
      isStale: false,
      lastCheckedAt: null,
      lastSuccessfulRefreshAt: null,
      lastFailureAt: null,
      failureCount: 0,
      refreshIntervalSeconds: input.refreshIntervalSeconds,
      nextRefreshDueAt: null,
      discoveredAt: now,
      updatedAt: now,
    };

    this.connection.db.insert(sources).values(row).run();
    return toDomain(row);
  }

  findById(id: string): Source | undefined {
    const row = this.connection.db
      .select()
      .from(sources)
      .where(eq(sources.id, id))
      .get();
    return row ? toDomain(row) : undefined;
  }

  findByIdentity(
    providerType: string,
    providerInstanceId: string,
    canonicalUri: string,
  ): Source | undefined {
    const row = this.connection.db
      .select()
      .from(sources)
      .where(
        and(
          eq(sources.providerType, providerType),
          eq(sources.providerInstanceId, providerInstanceId),
          eq(sources.canonicalUri, canonicalUri),
        ),
      )
      .get();
    return row ? toDomain(row) : undefined;
  }

  /**
   * Records the outcome of a fetch: updates cache identity (D6) and
   * computes the next refresh deadline (D7) from `refreshIntervalSeconds`.
   * A cache-hit re-check (unchanged content) should still call this — only
   * `lastCheckedAt`/`nextRefreshDueAt` advance in that case, matching the
   * "cache-hit short circuit" lifecycle invariant.
   */
  recordSuccessfulFetch(rawInput: RecordSourceFetchInput): Source {
    const input = RecordSourceFetchInputSchema.parse(rawInput);
    const current = this.findById(input.id);
    if (!current) {
      throw new Error(`Cannot record a fetch for unknown source "${input.id}"`);
    }

    const nowTimestamp = createTimestamp();
    const now = timestampToIso(nowTimestamp);
    const ttlSeconds = input.ttlSeconds ?? current.ttlSeconds;
    const nextRefreshDue = new Date(
      Date.now() + current.refreshIntervalSeconds * 1000,
    );

    this.connection.db
      .update(sources)
      .set({
        contentHash: input.contentHash,
        contentLength: input.contentLength,
        etag: input.etag ?? null,
        lastModified: input.lastModified ?? null,
        ttlSeconds: ttlSeconds ?? null,
        isStale: false,
        failureCount: 0,
        lastCheckedAt: now,
        lastSuccessfulRefreshAt: now,
        nextRefreshDueAt: nextRefreshDue.toISOString(),
        updatedAt: now,
      })
      .where(eq(sources.id, input.id))
      .run();

    return SourceSchema.parse({
      ...current,
      contentHash: input.contentHash,
      contentLength: input.contentLength,
      etag: input.etag,
      lastModified: input.lastModified,
      ttlSeconds,
      isStale: false,
      failureCount: 0,
      lastCheckedAt: nowTimestamp,
      lastSuccessfulRefreshAt: nowTimestamp,
      nextRefreshDueAt: nextRefreshDue.getTime(),
      updatedAt: nowTimestamp,
    });
  }

  /** Increments the consecutive failure counter and records the failure timestamp (D6). */
  recordFailedFetch(id: string): Source {
    const current = this.findById(id);
    if (!current) {
      throw new Error(`Cannot record a failure for unknown source "${id}"`);
    }

    const nowTimestamp = createTimestamp();
    const now = timestampToIso(nowTimestamp);
    this.connection.db
      .update(sources)
      .set({
        failureCount: current.failureCount + 1,
        lastFailureAt: now,
        lastCheckedAt: now,
        isStale: true,
        updatedAt: now,
      })
      .where(eq(sources.id, id))
      .run();

    return SourceSchema.parse({
      ...current,
      failureCount: current.failureCount + 1,
      lastFailureAt: nowTimestamp,
      lastCheckedAt: nowTimestamp,
      isStale: true,
      updatedAt: nowTimestamp,
    });
  }

  /**
   * Detects whether `freshHash`/`freshLength` differ from the last
   * processed content for this source, without mutating state (D6
   * cache-hit check).
   */
  isCacheHit(id: string, freshHash: string, freshLength: number): boolean {
    const current = this.findById(id);
    if (!current || !current.contentHash) {
      return false;
    }
    return (
      current.contentHash === freshHash && current.contentLength === freshLength
    );
  }

  /**
   * ORM-form compound cache-hit query (D9 candidate C): finds every
   * source whose `nextRefreshDueAt` has passed, joined against staleness
   * state, in a single query-builder call. Chosen over the raw-SQL form
   * for this operation — see `docs/decisions/0001-orm-vs-direct-sql-boundary.md`.
   */
  findRefreshDue(asOf: Timestamp = createTimestamp()): Source[] {
    const asOfIso = timestampToIso(asOf);
    const rows = this.connection.db
      .select()
      .from(sources)
      .where(
        and(
          isNotNull(sources.nextRefreshDueAt),
          lte(sources.nextRefreshDueAt, asOfIso),
        ),
      )
      .orderBy(sql`${sources.nextRefreshDueAt} asc`)
      .all();
    return rows.map(toDomain);
  }

  count(): number {
    const row = this.connection.db
      .select({ count: sql<number>`count(*)` })
      .from(sources)
      .get();
    return row?.count ?? 0;
  }
}
