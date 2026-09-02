import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseConnection } from '../database.provider.js';
import { DATABASE_CONNECTION } from '../persistence.constants.js';
import { IngestArtifactInputSchema } from '../persistence.types.js';
import type {
  IngestArtifactInput,
  IngestArtifactResult,
} from '../persistence.types.js';
import { ArtifactRepository } from './artifact.repository.js';
import { ChunkRepository } from './chunk.repository.js';
import { ProvenanceRepository } from './provenance.repository.js';
import { RelationshipRepository } from './relationship.repository.js';
import { TaskAssociationRepository } from './task-association.repository.js';

/**
 * Composes the artifact + chunk + provenance + relationship + task
 * association repositories into the single atomic write the content
 * ingestion lifecycle requires (D8, handoff "Atomic multi-table writes"
 * invariant): "artifact creation, chunk storage, provenance recording,
 * and relationship creation occur within a single transaction."
 *
 * `better-sqlite3` holds exactly one connection per `Database` instance
 * and executes synchronously, so wrapping the composed repository calls
 * in `sqlite.transaction(fn)` is sufficient to make them atomic — no
 * separate transactional handle needs to be threaded through the
 * individual repositories.
 */
@Injectable()
export class IngestionRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    private readonly artifacts: ArtifactRepository,
    private readonly provenance: ProvenanceRepository,
    private readonly chunks: ChunkRepository,
    private readonly relationships: RelationshipRepository,
    private readonly taskAssociations: TaskAssociationRepository,
  ) {}

  /**
   * Runs the full ingestion write in one atomic transaction. On a
   * cache hit (identical content already exists), chunks are not
   * re-inserted — matching the "cache-hit short circuit" lifecycle
   * invariant — but provenance, relationships, and task associations are
   * still recorded, since discovering already-known content through a
   * new source, task, or relationship is itself provenance-worthy.
   */
  ingest(rawInput: IngestArtifactInput): IngestArtifactResult {
    const input = IngestArtifactInputSchema.parse(rawInput);
    const run = this.connection.sqlite.transaction(() => {
      const { artifact, cacheHit } = this.artifacts.findOrCreate(
        input.artifact,
      );

      const provenanceRecord = this.provenance.create({
        ...input.provenance,
        artifactId: artifact.id,
      });

      const insertedChunks = cacheHit
        ? []
        : this.chunks.insertMany(artifact.id, input.chunks);

      const insertedRelationships = input.relationships.map((relationship) =>
        this.relationships.create({
          ...relationship,
          sourceArtifactId: artifact.id,
        }),
      );

      const insertedTaskAssociations = input.taskAssociations.map(
        (association) =>
          this.taskAssociations.create({
            ...association,
            artifactId: artifact.id,
          }),
      );

      return {
        artifact,
        provenance: provenanceRecord,
        chunks: insertedChunks,
        relationships: insertedRelationships,
        taskAssociations: insertedTaskAssociations,
      };
    });

    return run();
  }
}
