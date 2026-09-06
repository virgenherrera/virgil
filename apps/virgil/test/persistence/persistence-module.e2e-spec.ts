import type { TestingModule } from '@nestjs/testing';
import { DATABASE_CONNECTION } from '../../src/persistence/persistence.constants.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { EmbeddingMetaRepository } from '../../src/persistence/repositories/embedding-meta.repository.js';
import { ProvenanceRepository } from '../../src/persistence/repositories/provenance.repository.js';
import { RelationshipRepository } from '../../src/persistence/repositories/relationship.repository.js';
import { TaskAssociationRepository } from '../../src/persistence/repositories/task-association.repository.js';
import { IngestionRepository } from '../../src/persistence/repositories/ingestion.repository.js';
import type { DatabaseConnection } from '../../src/persistence/database.provider.js';
import { createTestModule } from './test-db.helper.js';

describe('PersistenceModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await createTestModule();
  });

  afterEach(async () => {
    await module.close();
  });

  it('provides DATABASE_CONNECTION', () => {
    const connection = module.get<DatabaseConnection>(DATABASE_CONNECTION);
    expect(connection).toBeDefined();
    expect(connection.sqlite).toBeDefined();
    expect(connection.db).toBeDefined();
  });

  it('provides SourceRepository', () => {
    expect(module.get(SourceRepository)).toBeInstanceOf(SourceRepository);
  });

  it('provides ArtifactRepository', () => {
    expect(module.get(ArtifactRepository)).toBeInstanceOf(ArtifactRepository);
  });

  it('provides ChunkRepository', () => {
    expect(module.get(ChunkRepository)).toBeInstanceOf(ChunkRepository);
  });

  it('provides EmbeddingMetaRepository', () => {
    expect(module.get(EmbeddingMetaRepository)).toBeInstanceOf(
      EmbeddingMetaRepository,
    );
  });

  it('provides ProvenanceRepository', () => {
    expect(module.get(ProvenanceRepository)).toBeInstanceOf(
      ProvenanceRepository,
    );
  });

  it('provides RelationshipRepository', () => {
    expect(module.get(RelationshipRepository)).toBeInstanceOf(
      RelationshipRepository,
    );
  });

  it('provides TaskAssociationRepository', () => {
    expect(module.get(TaskAssociationRepository)).toBeInstanceOf(
      TaskAssociationRepository,
    );
  });

  it('provides IngestionRepository', () => {
    expect(module.get(IngestionRepository)).toBeInstanceOf(IngestionRepository);
  });

  it('runs migrations on :memory: database', () => {
    const connection = module.get<DatabaseConnection>(DATABASE_CONNECTION);
    const tables = connection.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('sources');
    expect(names).toContain('artifacts');
    expect(names).toContain('chunks');
  });

  it('enables foreign keys', () => {
    const connection = module.get<DatabaseConnection>(DATABASE_CONNECTION);
    const result = connection.sqlite.pragma('foreign_keys') as {
      foreign_keys: number;
    }[];
    expect(result[0].foreign_keys).toBe(1);
  });
});
