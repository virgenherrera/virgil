import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../../src/persistence/schema/index.js';

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/persistence/migrations',
);

function createDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { sqlite, db };
}

describe('schema', () => {
  it('creates all tables after migration', () => {
    const { sqlite } = createDb();
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain('sources');
    expect(names).toContain('artifacts');
    expect(names).toContain('provenance_records');
    expect(names).toContain('chunks');
    expect(names).toContain('embedding_meta');
    expect(names).toContain('relationships');
    expect(names).toContain('task_associations');
    expect(names).toContain('lifecycle_transitions');
  });

  it('enforces sources identity unique index', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    const insert = sqlite.prepare(
      `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 3600, ?, ?)`,
    );
    insert.run('id1', 'git', 'inst-1', 'uri-1', 'Source 1', now, now);
    expect(() =>
      insert.run('id2', 'git', 'inst-1', 'uri-1', 'Source 2', now, now),
    ).toThrow();
  });

  it('enforces artifacts content_hash unique index', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 3600, ?, ?)`,
      )
      .run('src1', 'git', 'inst-1', 'uri-1', 'Source 1', now, now);

    const insertArtifact = sqlite.prepare(
      `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES (?, 'src1', ?, 100, 'text/plain', 'Title', 'uri', 'content', 'hot', 'p1', 'ingest', ?, ?)`,
    );
    insertArtifact.run('a1', 'hash1', now, now);
    expect(() => insertArtifact.run('a2', 'hash1', now, now)).toThrow();
  });

  it('cascades delete from sources to artifacts', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'Title', 'uri', 'content', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);

    sqlite.prepare("DELETE FROM sources WHERE id = 'src1'").run();
    const count = sqlite
      .prepare("SELECT count(*) as c FROM artifacts WHERE source_id = 'src1'")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('cascades delete from artifacts to chunks', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'Title', 'uri', 'content', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO chunks (id, artifact_id, content_hash, content, position, start_offset, end_offset, created_at)
       VALUES ('c1', 'a1', 'chash1', 'chunk text', 0, 0, 10, ?)`,
      )
      .run(now);

    sqlite.prepare("DELETE FROM artifacts WHERE id = 'a1'").run();
    const count = sqlite
      .prepare("SELECT count(*) as c FROM chunks WHERE artifact_id = 'a1'")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('enforces chunks artifact+position unique constraint', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'Title', 'uri', 'content', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);

    const insertChunk = sqlite.prepare(
      `INSERT INTO chunks (id, artifact_id, content_hash, content, position, start_offset, end_offset, created_at)
       VALUES (?, 'a1', ?, 'text', 0, 0, 4, ?)`,
    );
    insertChunk.run('c1', 'chash1', now);
    expect(() => insertChunk.run('c2', 'chash2', now)).toThrow();
  });

  it('enforces relationships unique edge constraint', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'T1', 'u1', 'c1', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a2', 'src1', 'hash2', 100, 'text/plain', 'T2', 'u2', 'c2', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);

    const insertRel = sqlite.prepare(
      `INSERT INTO relationships (id, source_artifact_id, target_artifact_id, relationship_type, created_at)
       VALUES (?, 'a1', 'a2', 'references', ?)`,
    );
    insertRel.run('r1', now);
    expect(() => insertRel.run('r2', now)).toThrow();
  });

  it('enforces embedding_meta chunk_id unique constraint', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'T1', 'u1', 'c1', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO chunks (id, artifact_id, content_hash, content, position, start_offset, end_offset, created_at)
       VALUES ('ch1', 'a1', 'chash1', 'text', 0, 0, 4, ?)`,
      )
      .run(now);

    const insertEmb = sqlite.prepare(
      `INSERT INTO embedding_meta (id, chunk_id, model_id, dimensions, status)
       VALUES (?, 'ch1', 'model-1', 1536, 'pending')`,
    );
    insertEmb.run('e1');
    expect(() => insertEmb.run('e2')).toThrow();
  });

  it('creates lifecycle_transitions table with FK to artifacts', () => {
    const { sqlite } = createDb();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at)
       VALUES ('src1', 'git', 'inst-1', 'uri-1', 'Source', 0, 0, 3600, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, lifecycle_state, provider_id, provider_capability, discovered_at, updated_at)
       VALUES ('a1', 'src1', 'hash1', 100, 'text/plain', 'T1', 'u1', 'c1', 'hot', 'p1', 'ingest', ?, ?)`,
      )
      .run(now, now);

    sqlite
      .prepare(
        `INSERT INTO lifecycle_transitions (id, artifact_id, previous_state, new_state, timestamp)
       VALUES ('lt1', 'a1', 'hot', 'warm', ?)`,
      )
      .run(Date.now());

    const row = sqlite
      .prepare("SELECT * FROM lifecycle_transitions WHERE id = 'lt1'")
      .get() as Record<string, unknown>;
    expect(row.artifact_id).toBe('a1');
    expect(row.previous_state).toBe('hot');
    expect(row.new_state).toBe('warm');
  });
});
