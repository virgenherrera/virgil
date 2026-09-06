#!/usr/bin/env node
// D9 — ORM vs direct-SQL boundary evidence.
//
// Benchmarks the three candidate operations named in
// docs/decisions/0001-orm-vs-direct-sql-boundary.md through both Drizzle's
// query builder and raw better-sqlite3, at 100/1000/10000 rows, and prints
// EXPLAIN QUERY PLAN output plus timing for each. Writes the full result set
// to artifacts/benchmark-persistence.json.
//
// This script is evidence-gathering tooling, run manually by a developer
// (`pnpm build && pnpm db:benchmark`) — it is intentionally self-contained
// (imports the compiled schema from dist/) and is not part of the
// automated test suite or coverage.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { and, isNotNull, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { sources, artifacts, chunks, relationships } = await import(
  join(packageRoot, 'dist/persistence/schema/index.js')
);

const ROW_COUNTS = [100, 1000, 10000];
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function fakeUlid(prefix, index) {
  const suffix = index.toString(32).toUpperCase().padStart(10, '0');
  return `${prefix}${suffix}`.padEnd(26, '0').slice(0, 26);
}

function nowIso() {
  return new Date().toISOString();
}

function time(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function freshDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema: { sources, artifacts, chunks, relationships } });

  // Minimal inline schema — mirrors src/persistence/migrations/0000_*.sql.
  // Kept independent of the migrations folder so this script never
  // silently drifts if a future migration changes column defaults it
  // does not use.
  sqlite.exec(`
    CREATE TABLE sources (
      id text PRIMARY KEY NOT NULL, provider_type text NOT NULL, provider_instance_id text NOT NULL,
      canonical_uri text NOT NULL, display_name text NOT NULL, auth_scope text, content_hash text,
      etag text, content_length integer, last_modified text, ttl_seconds integer,
      is_stale integer DEFAULT false NOT NULL, last_checked_at text, last_successful_refresh_at text,
      last_failure_at text, failure_count integer DEFAULT 0 NOT NULL, refresh_interval_seconds integer NOT NULL,
      next_refresh_due_at text, discovered_at text NOT NULL, updated_at text NOT NULL
    );
    CREATE INDEX sources_next_refresh_due_idx ON sources (next_refresh_due_at);
    CREATE TABLE artifacts (
      id text PRIMARY KEY NOT NULL, source_id text NOT NULL, content_hash text NOT NULL,
      content_length integer NOT NULL, content_type text NOT NULL, title text NOT NULL,
      source_uri text NOT NULL, normalized_content text NOT NULL, lifecycle_state text DEFAULT 'hot' NOT NULL,
      provider_id text NOT NULL, provider_capability text NOT NULL, discovered_at text NOT NULL, updated_at text NOT NULL,
      FOREIGN KEY (source_id) REFERENCES sources(id)
    );
    CREATE TABLE chunks (
      id text PRIMARY KEY NOT NULL, artifact_id text NOT NULL, content_hash text NOT NULL, content text NOT NULL,
      position integer NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL, metadata text, created_at text NOT NULL,
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
    );
    CREATE TABLE relationships (
      id text PRIMARY KEY NOT NULL, source_artifact_id text NOT NULL, target_artifact_id text NOT NULL,
      relationship_type text NOT NULL, metadata text, created_at text NOT NULL,
      FOREIGN KEY (source_artifact_id) REFERENCES artifacts(id), FOREIGN KEY (target_artifact_id) REFERENCES artifacts(id)
    );
  `);

  return { sqlite, db };
}

// ---------------------------------------------------------------------------
// Candidate A — bulk chunk insertion
// ---------------------------------------------------------------------------

function benchmarkBulkChunkInsertion(rowCount) {
  const artifactId = fakeUlid('ART', 0);
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    id: fakeUlid('CHK', i),
    artifactId,
    contentHash: 'a'.repeat(64),
    content: `chunk ${i}`,
    position: i,
    startOffset: i * 10,
    endOffset: i * 10 + 9,
    metadata: null,
    createdAt: nowIso(),
  }));

  // ORM form
  const orm = freshDb();
  orm.sqlite.prepare(
    `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at) VALUES ('SRC', 'x', 'x', 'x', 'x', 0, 0, 3600, ?, ?)`,
  ).run(nowIso(), nowIso());
  orm.sqlite.prepare(
    `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, provider_id, provider_capability, discovered_at, updated_at) VALUES (?, 'SRC', 'h', 1, 'text/plain', 't', 'u', 'n', 'p', 'c', ?, ?)`,
  ).run(artifactId, nowIso(), nowIso());
  // Drizzle's `.insert().values()` does NOT automatically chunk large
  // arrays: better-sqlite3 rejects a single statement bound with more
  // than ~32766 total parameters (SQLITE_MAX_VARIABLE_NUMBER), which a
  // naive single-call insert of `rowCount` rows x 9 columns exceeds well
  // before 10,000 rows. The ORM form below batches into
  // SQLite-variable-limit-safe chunks itself, matching how a real
  // caller would have to work around this — this is additional evidence
  // for the direct-SQL decision below, not just a benchmark artifact.
  const ormBatchSize = Math.max(1, Math.floor(900 / 9));
  const ormTime = time(() => {
    for (let i = 0; i < rows.length; i += ormBatchSize) {
      orm.db
        .insert(chunks)
        .values(rows.slice(i, i + ormBatchSize))
        .run();
    }
  });
  const ormPlan = orm.sqlite
    .prepare('EXPLAIN QUERY PLAN INSERT INTO chunks (id, artifact_id, content_hash, content, position, start_offset, end_offset, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .all('x', artifactId, 'h', 'c', 0, 0, 0, null, nowIso());
  orm.sqlite.close();

  // Direct-SQL form
  const raw = freshDb();
  raw.sqlite.prepare(
    `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at) VALUES ('SRC', 'x', 'x', 'x', 'x', 0, 0, 3600, ?, ?)`,
  ).run(nowIso(), nowIso());
  raw.sqlite.prepare(
    `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, provider_id, provider_capability, discovered_at, updated_at) VALUES (?, 'SRC', 'h', 1, 'text/plain', 't', 'u', 'n', 'p', 'c', ?, ?)`,
  ).run(artifactId, nowIso(), nowIso());
  const statement = raw.sqlite.prepare(
    `INSERT INTO chunks (id, artifact_id, content_hash, content, position, start_offset, end_offset, metadata, created_at)
     VALUES (@id, @artifactId, @contentHash, @content, @position, @startOffset, @endOffset, @metadata, @createdAt)`,
  );
  const insertAll = raw.sqlite.transaction((batch) => {
    for (const row of batch) statement.run(row);
  });
  const rawTime = time(() => insertAll(rows));
  raw.sqlite.close();

  return { rowCount, ormMs: ormTime, rawSqlMs: rawTime, ormQueryPlan: ormPlan };
}

// ---------------------------------------------------------------------------
// Candidate B — recursive relationship traversal
// ---------------------------------------------------------------------------

function benchmarkRelationshipTraversal(rowCount) {
  const setup = freshDb();
  setup.sqlite.prepare(
    `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, discovered_at, updated_at) VALUES ('SRC', 'x', 'x', 'x', 'x', 0, 0, 3600, ?, ?)`,
  ).run(nowIso(), nowIso());
  const artifactCount = Math.max(2, Math.floor(rowCount / 3) + 1);
  const insertArtifact = setup.sqlite.prepare(
    `INSERT INTO artifacts (id, source_id, content_hash, content_length, content_type, title, source_uri, normalized_content, provider_id, provider_capability, discovered_at, updated_at) VALUES (?, 'SRC', ?, 1, 'text/plain', 't', 'u', 'n', 'p', 'c', ?, ?)`,
  );
  for (let i = 0; i < artifactCount; i++) {
    insertArtifact.run(fakeUlid('ART', i), `h${i}`, nowIso(), nowIso());
  }
  const insertRelationship = setup.sqlite.prepare(
    `INSERT INTO relationships (id, source_artifact_id, target_artifact_id, relationship_type, metadata, created_at) VALUES (?, ?, ?, 'references', NULL, ?)`,
  );
  // Chain: ART0 -> ART1 -> ART2 -> ... plus fan-out edges to reach rowCount total edges.
  let edgeIndex = 0;
  for (let i = 0; i < artifactCount - 1 && edgeIndex < rowCount; i++, edgeIndex++) {
    insertRelationship.run(fakeUlid('REL', edgeIndex), fakeUlid('ART', i), fakeUlid('ART', i + 1), nowIso());
  }
  while (edgeIndex < rowCount) {
    const from = edgeIndex % artifactCount;
    const to = (edgeIndex + 1) % artifactCount;
    insertRelationship.run(fakeUlid('REL', edgeIndex), fakeUlid('ART', from), fakeUlid('ART', to), nowIso());
    edgeIndex++;
  }

  const startArtifactId = fakeUlid('ART', 0);
  const maxDepth = 5;

  // ORM iterative BFS
  const ormTime = time(() => {
    let frontier = [startArtifactId];
    const visited = new Set(frontier);
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const rows = setup.db
        .select()
        .from(relationships)
        .where(and(isNotNull(relationships.id)))
        .all()
        .filter((r) => frontier.includes(r.sourceArtifactId));
      const next = [];
      for (const row of rows) {
        if (!visited.has(row.targetArtifactId)) {
          visited.add(row.targetArtifactId);
          next.push(row.targetArtifactId);
        }
      }
      frontier = next;
    }
  });

  // Direct SQL recursive CTE
  const recursiveStatement = setup.sqlite.prepare(`
    WITH RECURSIVE traversal(artifact_id, depth, path) AS (
      SELECT target_artifact_id, 1, '/' || id FROM relationships WHERE source_artifact_id = @start
      UNION ALL
      SELECT r.target_artifact_id, t.depth + 1, t.path || '/' || r.id
      FROM relationships r JOIN traversal t ON r.source_artifact_id = t.artifact_id
      WHERE t.depth < @maxDepth AND t.path NOT LIKE '%/' || r.id || '/%' AND t.path NOT LIKE '%/' || r.id
    )
    SELECT artifact_id, depth FROM traversal ORDER BY depth ASC
  `);
  const rawTime = time(() => {
    recursiveStatement.all({ start: startArtifactId, maxDepth });
  });
  const rawPlan = setup.sqlite
    .prepare(
      `EXPLAIN QUERY PLAN WITH RECURSIVE traversal(artifact_id, depth, path) AS (SELECT target_artifact_id, 1, '/' || id FROM relationships WHERE source_artifact_id = @start UNION ALL SELECT r.target_artifact_id, t.depth + 1, t.path || '/' || r.id FROM relationships r JOIN traversal t ON r.source_artifact_id = t.artifact_id WHERE t.depth < @maxDepth) SELECT artifact_id, depth FROM traversal`,
    )
    .all({ start: startArtifactId, maxDepth });

  setup.sqlite.close();

  return { rowCount, ormMs: ormTime, rawSqlMs: rawTime, rawSqlQueryPlan: rawPlan };
}

// ---------------------------------------------------------------------------
// Candidate C — compound cache-hit / staleness query
// ---------------------------------------------------------------------------

function benchmarkStalenessQuery(rowCount) {
  const setup = freshDb();
  const insertSource = setup.sqlite.prepare(
    `INSERT INTO sources (id, provider_type, provider_instance_id, canonical_uri, display_name, is_stale, failure_count, refresh_interval_seconds, next_refresh_due_at, discovered_at, updated_at) VALUES (?, 'x', ?, ?, 'x', 0, 0, 3600, ?, ?, ?)`,
  );
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  for (let i = 0; i < rowCount; i++) {
    insertSource.run(fakeUlid('SRC', i), `inst${i}`, `uri${i}`, i % 2 === 0 ? past : future, nowIso(), nowIso());
  }

  const asOf = new Date().toISOString();

  const ormTime = time(() => {
    setup.db
      .select()
      .from(sources)
      .where(and(isNotNull(sources.nextRefreshDueAt), lte(sources.nextRefreshDueAt, asOf)))
      .all();
  });

  const rawStatement = setup.sqlite.prepare(
    `SELECT * FROM sources WHERE next_refresh_due_at IS NOT NULL AND next_refresh_due_at <= ? ORDER BY next_refresh_due_at ASC`,
  );
  const rawTime = time(() => {
    rawStatement.all(asOf);
  });
  const rawPlan = setup.sqlite
    .prepare(
      `EXPLAIN QUERY PLAN SELECT * FROM sources WHERE next_refresh_due_at IS NOT NULL AND next_refresh_due_at <= ? ORDER BY next_refresh_due_at ASC`,
    )
    .all(asOf);

  setup.sqlite.close();

  return { rowCount, ormMs: ormTime, rawSqlMs: rawTime, rawSqlQueryPlan: rawPlan };
}

// ---------------------------------------------------------------------------

function run() {
  const results = {
    generatedAt: nowIso(),
    bulkChunkInsertion: ROW_COUNTS.map(benchmarkBulkChunkInsertion),
    relationshipTraversal: ROW_COUNTS.map(benchmarkRelationshipTraversal),
    stalenessQuery: ROW_COUNTS.map(benchmarkStalenessQuery),
  };

  console.log('\n=== D9 — ORM vs Direct-SQL Benchmark ===\n');
  for (const [label, rows] of [
    ['Candidate A — bulk chunk insertion', results.bulkChunkInsertion],
    ['Candidate B — recursive relationship traversal', results.relationshipTraversal],
    ['Candidate C — compound cache-hit/staleness query', results.stalenessQuery],
  ]) {
    console.log(label);
    for (const row of rows) {
      const speedup = (row.ormMs / row.rawSqlMs).toFixed(2);
      console.log(
        `  rows=${row.rowCount.toString().padStart(5)}  orm=${row.ormMs.toFixed(2).padStart(8)}ms  rawSql=${row.rawSqlMs.toFixed(2).padStart(8)}ms  speedup=${speedup}x`,
      );
    }
    console.log('');
  }

  const outDir = join(packageRoot, 'artifacts');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'benchmark-persistence.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Full results (including query plans) written to ${outPath}`);
}

run();
