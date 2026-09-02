import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  CreateProvenanceRecordInputSchema,
  ProvenanceRecordSchema,
  isoToTimestamp,
  nowIso,
} from '../persistence.types.js';
import type { CreateProvenanceRecordInput } from '../persistence.types.js';
import type { ProvenanceRecord } from '../../shared/knowledge.types.js';
import { createUlid } from '../../shared/primitives.js';
import { provenanceRecords } from '../schema/index.js';

type ProvenanceRow = typeof provenanceRecords.$inferSelect;

/**
 * Maps a raw row onto the shared `ProvenanceRecord` contract
 * (`src/shared/knowledge.types.ts`) exactly, through
 * `ProvenanceRecordSchema.parse`. The row's `sourceId` column exists for
 * indexing/joins (`listBySource`) but is intentionally not part of the
 * contract shape returned here.
 */
function toDomain(row: ProvenanceRow): ProvenanceRecord {
  return ProvenanceRecordSchema.parse({
    id: row.id,
    artifactId: row.artifactId,
    sourceUri: row.sourceUri,
    fetchedAt: isoToTimestamp(row.fetchedAt),
    fetchedBy: row.fetchedBy,
    contentHashAtFetch: row.contentHashAtFetch,
  });
}

/**
 * Data access for `PROVENANCE_RECORD` rows (D2): the audit trail
 * answering "where did this knowledge come from, and when was it
 * fetched?" for a given artifact.
 */
@Injectable()
export class ProvenanceRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  create(rawInput: CreateProvenanceRecordInput): ProvenanceRecord {
    const input = CreateProvenanceRecordInputSchema.parse(rawInput);
    const row = {
      id: createUlid(),
      artifactId: input.artifactId,
      sourceId: input.sourceId,
      sourceUri: input.sourceUri,
      fetchedAt: nowIso(),
      fetchedBy: input.fetchedBy,
      contentHashAtFetch: input.contentHashAtFetch,
    };

    this.connection.db.insert(provenanceRecords).values(row).run();
    return toDomain(row);
  }

  /** Answers "where did this artifact come from?" — full fetch history, oldest first. */
  listByArtifact(artifactId: string): ProvenanceRecord[] {
    const rows = this.connection.db
      .select()
      .from(provenanceRecords)
      .where(eq(provenanceRecords.artifactId, artifactId))
      .all();
    return rows.map(toDomain);
  }

  /** Every artifact fetch attributed to a given source. */
  listBySource(sourceId: string): ProvenanceRecord[] {
    const rows = this.connection.db
      .select()
      .from(provenanceRecords)
      .where(eq(provenanceRecords.sourceId, sourceId))
      .all();
    return rows.map(toDomain);
  }
}
