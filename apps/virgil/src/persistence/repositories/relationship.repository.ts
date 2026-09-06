import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import {
  CreateRelationshipInputSchema,
  RelationshipSchema,
  RelationshipTraversalNodeSchema,
  isoToTimestamp,
  nowIso,
} from '../persistence.types.js';
import type {
  CreateRelationshipInput,
  Relationship,
  RelationshipTraversalNode,
} from '../persistence.types.js';
import { createUlid } from '../../shared/primitives.js';
import { relationships } from '../schema/index.js';

type RelationshipRow = typeof relationships.$inferSelect;

function toDomain(row: RelationshipRow): Relationship {
  return RelationshipSchema.parse({
    id: row.id,
    sourceArtifactId: row.sourceArtifactId,
    targetArtifactId: row.targetArtifactId,
    relationshipType: row.relationshipType,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: isoToTimestamp(row.createdAt),
  });
}

interface RawTraversalRow {
  readonly artifact_id: string;
  readonly depth: number;
  readonly via_relationship_id: string | null;
  readonly via_relationship_type: string | null;
}

@Injectable()
export class RelationshipRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  create(rawInput: CreateRelationshipInput): Relationship {
    const input = CreateRelationshipInputSchema.parse(rawInput);
    const row = {
      id: createUlid(),
      sourceArtifactId: input.sourceArtifactId,
      targetArtifactId: input.targetArtifactId,
      relationshipType: input.relationshipType,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: nowIso(),
    };

    this.connection.db.insert(relationships).values(row).run();
    return toDomain(row);
  }

  findOutgoing(artifactId: string, relationshipType?: string): Relationship[] {
    const condition = relationshipType
      ? and(
          eq(relationships.sourceArtifactId, artifactId),
          eq(relationships.relationshipType, relationshipType),
        )
      : eq(relationships.sourceArtifactId, artifactId);

    const rows = this.connection.db
      .select()
      .from(relationships)
      .where(condition)
      .all();
    return rows.map(toDomain);
  }

  findIncoming(artifactId: string, relationshipType?: string): Relationship[] {
    const condition = relationshipType
      ? and(
          eq(relationships.targetArtifactId, artifactId),
          eq(relationships.relationshipType, relationshipType),
        )
      : eq(relationships.targetArtifactId, artifactId);

    const rows = this.connection.db
      .select()
      .from(relationships)
      .where(condition)
      .all();
    return rows.map(toDomain);
  }

  traverse(startArtifactId: string, maxDepth = 5): RelationshipTraversalNode[] {
    const statement = this.connection.sqlite.prepare(`
      WITH RECURSIVE traversal(artifact_id, depth, via_relationship_id, via_relationship_type, path) AS (
        SELECT
          r.target_artifact_id,
          1,
          r.id,
          r.relationship_type,
          '/' || r.id
        FROM relationships r
        WHERE r.source_artifact_id = @startArtifactId

        UNION ALL

        SELECT
          r.target_artifact_id,
          t.depth + 1,
          r.id,
          r.relationship_type,
          t.path || '/' || r.id
        FROM relationships r
        JOIN traversal t ON r.source_artifact_id = t.artifact_id
        WHERE t.depth < @maxDepth
          AND t.path NOT LIKE '%/' || r.id || '/%'
          AND t.path NOT LIKE '%/' || r.id
      )
      SELECT artifact_id, depth, via_relationship_id, via_relationship_type
      FROM traversal
      ORDER BY depth ASC
    `);

    const rows = statement.all({
      startArtifactId,
      maxDepth,
    }) as RawTraversalRow[];

    return rows.map((row) =>
      RelationshipTraversalNodeSchema.parse({
        artifactId: row.artifact_id,
        depth: row.depth,
        viaRelationshipId: row.via_relationship_id ?? undefined,
        viaRelationshipType: row.via_relationship_type ?? undefined,
      }),
    );
  }
}
