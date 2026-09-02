import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration (D10 — migration infrastructure).
 *
 * Migrations are generated from `src/persistence/schema/**` — never
 * hand-written — via `pnpm db:generate`, and land in
 * `src/persistence/migrations/`. `nest-cli.json` copies that directory
 * into `dist/` as a build asset so the compiled CLI can apply them at
 * runtime with `drizzle-orm/better-sqlite3/migrator`.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/persistence/schema/index.ts',
  out: './src/persistence/migrations',
  strict: true,
  verbose: true,
});
