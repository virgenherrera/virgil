import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  ArtifactSchema,
  CreateArtifactInputSchema,
  isoToTimestamp,
  nowIso,
} from '../persistence.types.js';
import type { Artifact, CreateArtifactInput } from '../persistence.types.js';
import { createUlid } from '../../shared/primitives.js';
import { artifacts } from '../schema/index.js';

type ArtifactRow = typeof artifacts.$inferSelect;

function toDomain(row: ArtifactRow): Artifact {
  return ArtifactSchema.parse({
    id: row.id,
    sourceId: row.sourceId,
    contentHash: row.contentHash,
    contentLength: row.contentLength,
    mimeType: row.contentType,
    title: row.title,
    sourceUri: row.sourceUri,
    normalizedContent: row.normalizedContent,
    lifecycleState: row.lifecycleState,
    providerId: row.providerId,
    providerCapability: row.providerCapability,
    createdAt: isoToTimestamp(row.discoveredAt),
    updatedAt: isoToTimestamp(row.updatedAt),
  });
}

export interface FindOrCreateArtifactResult {
  readonly artifact: Artifact;
  readonly cacheHit: boolean;
}

@Injectable()
export class ArtifactRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  findById(id: string): Artifact | undefined {
    const row = this.connection.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .get();
    return row ? toDomain(row) : undefined;
  }

  findByContentHash(contentHash: string): Artifact | undefined {
    const row = this.connection.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.contentHash, contentHash))
      .get();
    return row ? toDomain(row) : undefined;
  }

  findOrCreate(rawInput: CreateArtifactInput): FindOrCreateArtifactResult {
    const input = CreateArtifactInputSchema.parse(rawInput);
    const existing = this.findByContentHash(input.contentHash);
    if (existing) {
      if (existing.contentLength !== input.contentLength) {
        throw new Error(
          `Content hash collision detected for "${input.contentHash}": ` +
            `existing artifact has length ${existing.contentLength}, incoming content has length ${input.contentLength}`,
        );
      }
      return { artifact: existing, cacheHit: true };
    }

    const artifact = this.insert(input);
    return { artifact, cacheHit: false };
  }

  insert(rawInput: CreateArtifactInput): Artifact {
    const input = CreateArtifactInputSchema.parse(rawInput);
    const now = nowIso();
    const row = {
      id: createUlid(),
      sourceId: input.sourceId,
      contentHash: input.contentHash,
      contentLength: input.contentLength,
      contentType: input.mimeType,
      title: input.title,
      sourceUri: input.sourceUri,
      normalizedContent: input.normalizedContent,
      lifecycleState: input.lifecycleState,
      providerId: input.providerId,
      providerCapability: input.providerCapability,
      discoveredAt: now,
      updatedAt: now,
    };

    this.connection.db.insert(artifacts).values(row).run();
    return toDomain(row);
  }

  updateLifecycleState(
    id: string,
    lifecycleState: Artifact['lifecycleState'],
  ): Artifact {
    const current = this.findById(id);
    if (!current) {
      throw new Error(`Cannot update unknown artifact "${id}"`);
    }

    const updatedAt = nowIso();
    this.connection.db
      .update(artifacts)
      .set({ lifecycleState, updatedAt })
      .where(eq(artifacts.id, id))
      .run();

    return ArtifactSchema.parse({
      ...current,
      lifecycleState,
      updatedAt: isoToTimestamp(updatedAt),
    });
  }

  listBySource(sourceId: string): Artifact[] {
    const rows = this.connection.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.sourceId, sourceId))
      .all();
    return rows.map(toDomain);
  }

  count(): number {
    return this.connection.db.select().from(artifacts).all().length;
  }
}
