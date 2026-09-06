import { createDatabaseConnection } from '../../src/persistence/database.provider.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/persistence/migrations',
);

describe('createDatabaseConnection', () => {
  it('creates an in-memory database with migrations', () => {
    const conn = createDatabaseConnection({
      databasePath: ':memory:',
      runMigrations: true,
      migrationsFolder,
    });
    expect(conn.sqlite).toBeDefined();
    expect(conn.db).toBeDefined();

    const tables = conn.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('sources');
    conn.sqlite.close();
  });

  it('creates an in-memory database without migrations', () => {
    const conn = createDatabaseConnection({
      databasePath: ':memory:',
      runMigrations: false,
    });

    const tables = conn.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    expect(tables.length).toBe(0);
    conn.sqlite.close();
  });

  it('enables foreign keys', () => {
    const conn = createDatabaseConnection({
      databasePath: ':memory:',
      runMigrations: false,
    });
    const result = conn.sqlite.pragma('foreign_keys') as {
      foreign_keys: number;
    }[];
    expect(result[0].foreign_keys).toBe(1);
    conn.sqlite.close();
  });
});
