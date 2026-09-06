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

/**
 * Resolves the generated Drizzle Kit migrations folder (D10), relative to
 * this compiled module so it works identically from `dist/`
 * (development/`start:prod`) and from `src/` under vitest.
 *
 * `import.meta.url` is only evaluated in the non-SEA branch — same
 * constraint as `getCliVersion` in `src/package-info.ts`: once esbuild
 * bundles this module to CJS for SEA packaging, `import.meta.url` is
 * `undefined`, and evaluating it unconditionally at module scope (or even
 * lazily, but on every command's bootstrap) would throw
 * `ERR_INVALID_ARG_TYPE` before the SEA branch below ever gets a chance to
 * run. Embedding migrations inside the SEA blob itself (so they can be
 * applied from a packaged binary) is the coordinated H02 follow-up the
 * handoff's risk table calls out; until then, `runMigrations` defaults to
 * `false` under `isSea()` so opening the connection never crashes the
 * packaged binary.
 */
function resolveDefaultMigrationsFolder(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, 'migrations');
}

export interface PersistenceModuleOptions {
  /**
   * Filesystem path to the SQLite database file, or `:memory:` for an
   * ephemeral in-process database (used by the test suite). Defaults to
   * {@link DEFAULT_DATABASE_PATH} relative to `process.cwd()`.
   */
  readonly databasePath?: string;
  /**
   * Applies pending Drizzle Kit migrations on connection. Defaults to
   * `true` under the normal Node runtime, and `false` under a SEA binary
   * (see {@link resolveDefaultMigrationsFolder}) unless explicitly
   * overridden.
   */
  readonly runMigrations?: boolean;
  /** Overrides the migrations folder (primarily for testing). */
  readonly migrationsFolder?: string;
}

export type KnowledgeDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnection {
  /** The raw `better-sqlite3` handle, used by direct-SQL repository operations (D9). */
  readonly sqlite: Database.Database;
  /** The Drizzle ORM query-builder handle. */
  readonly db: KnowledgeDatabase;
}

/**
 * Opens (creating if necessary) the knowledge SQLite database and applies
 * pending migrations. This is the single point where `better-sqlite3` is
 * constructed — no other file in `src/persistence/` imports it directly
 * except the repositories that need the raw handle for direct-SQL
 * operations (D9), which receive it through this connection object rather
 * than opening their own.
 */
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
