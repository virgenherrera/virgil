#!/usr/bin/env node
// Applies pending Drizzle Kit migrations (D10) to the on-disk knowledge
// database, outside of the NestJS bootstrap path. Run after `pnpm build`
// against the compiled schema in `dist/`, matching what the packaged CLI
// (and SEA binary) run at first startup.
//
// Usage: pnpm db:migrate [databasePath]

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { createDatabaseConnection } = await import(
  join(packageRoot, 'dist/persistence/database.provider.js')
);

const databasePath = process.argv[2] ?? '.virgil/knowledge.db';

const { sqlite } = createDatabaseConnection({ databasePath, runMigrations: true });

console.log(`Migrations applied to "${databasePath}".`);
sqlite.close();
