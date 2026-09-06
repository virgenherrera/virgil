import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type {
  DatabaseConnection,
  PersistenceModuleOptions,
} from './database.provider.js';
import { createDatabaseConnection } from './database.provider.js';
import {
  DATABASE_CONNECTION,
  PERSISTENCE_OPTIONS,
} from './persistence.constants.js';
import {
  ArtifactRepository,
  ChunkRepository,
  EmbeddingMetaRepository,
  IngestionRepository,
  ProvenanceRepository,
  RelationshipRepository,
  SourceRepository,
  TaskAssociationRepository,
} from './repositories/index.js';

const REPOSITORIES = [
  SourceRepository,
  ArtifactRepository,
  ProvenanceRepository,
  ChunkRepository,
  EmbeddingMetaRepository,
  RelationshipRepository,
  TaskAssociationRepository,
  IngestionRepository,
];

@Module({})
export class PersistenceModule {
  static forRoot(options: PersistenceModuleOptions = {}): DynamicModule {
    return {
      module: PersistenceModule,
      providers: [
        { provide: PERSISTENCE_OPTIONS, useValue: options },
        {
          provide: DATABASE_CONNECTION,
          useFactory: (opts: PersistenceModuleOptions): DatabaseConnection =>
            createDatabaseConnection(opts),
          inject: [PERSISTENCE_OPTIONS],
        },
        ...REPOSITORIES,
      ],
      exports: [DATABASE_CONNECTION, ...REPOSITORIES],
    };
  }
}
