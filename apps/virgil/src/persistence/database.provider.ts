import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DEFAULT_DATABASE_PATH } from './persistence.constants.js';
import * as schema from './schema/index.js';

function resolveDefaultMigrationsFolder(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, 'migrations');
}

export interface PersistenceModuleOptions {
  readonly databasePath?: string;
  readonly runMigrations?: boolean;
  readonly migrationsFolder?: string;
}

export type KnowledgeDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  readonly sqlite: Database.Database;
  readonly db: KnowledgeDatabase;
}

export function createDatabaseConnection(
  options: PersistenceModuleOptions = {},
): DatabaseConnection {
  const databasePath = options.databasePath ?? DEFAULT_DATABASE_PATH;

  if (databasePath !== ':memory:') {
    const absolutePath = resolve(databasePath);
    const directory = dirname(absolutePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  const runningAsSea = isSea();
  const shouldRunMigrations = options.runMigrations ?? !runningAsSea;

  if (shouldRunMigrations) {
    const migrationsFolder =
      options.migrationsFolder ?? resolveDefaultMigrationsFolder();
    migrate(db, { migrationsFolder });
  }

  return { sqlite, db };
}
