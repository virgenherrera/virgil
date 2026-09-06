import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PersistenceModule } from '../../src/persistence/persistence.module.js';
import type { DatabaseConnection } from '../../src/persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../../src/persistence/persistence.constants.js';

export async function createTestModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      PersistenceModule.forRoot({
        databasePath: ':memory:',
        runMigrations: true,
      }),
    ],
  }).compile();
}

export function getConnection(module: TestingModule): DatabaseConnection {
  return module.get<DatabaseConnection>(DATABASE_CONNECTION);
}
