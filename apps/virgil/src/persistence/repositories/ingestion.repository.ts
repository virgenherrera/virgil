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
