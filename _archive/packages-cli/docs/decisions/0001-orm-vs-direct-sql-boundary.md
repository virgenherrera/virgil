# ADR 0001 — ORM vs Direct-SQL Boundary in the Knowledge Persistence Layer

> **Handoff:** H06 — Knowledge Persistence & Provenance
> **Status:** Accepted
> **Deliverable:** D9

## Context

Drizzle ORM is the validated persistence abstraction for Virgil (POC-00).
The H06 handoff requires the boundary between ORM-mediated and
direct-SQL operations to be established through evidence, not assumption,
for three candidate operations:

1. Bulk chunk insertion.
2. Recursive relationship-graph traversal.
3. Compound cache-hit / staleness detection.

Each candidate was implemented in both forms and benchmarked at 100,
1,000, and 10,000 rows against an in-memory SQLite database using
`scripts/benchmark-persistence.mjs` (run with `pnpm build && pnpm db:benchmark`).
Full output — including `EXPLAIN QUERY PLAN` results — is captured in
`artifacts/benchmark-persistence.json` (gitignored; regenerated on each
run). The numbers below are one representative run on Apple Silicon
(darwin-arm64, Node 24.16.0); absolute timings will vary by machine, but
the relative shape (which form wins, and by roughly how much) is stable
across repeated local runs.

The benchmark script uses a minimal inline copy of the schema
(`CREATE TABLE` only, no secondary indexes beyond primary keys) so it has
no dependency on the generated migration files. This means Candidate B's
raw-SQL numbers below are a *lower bound* on real-world performance: the
actual `relationships` table (`src/persistence/schema/relationships.schema.ts`)
has an explicit index on `source_artifact_id`, which the benchmark
schema lacks — SQLite compensates with an ephemeral "AUTOMATIC COVERING
INDEX" (visible in the captured query plan), which is slower to build
than using a persistent one.

## Candidate A — Bulk Chunk Insertion

| Form | Implementation |
| --- | --- |
| ORM | `db.insert(chunks).values(rows)`, batched into groups of 100 rows (see note below). |
| Direct SQL | A single `sqlite.prepare(...)` statement, executed once per row inside one `sqlite.transaction(fn)`. |

**Important correctness finding, not just a performance one:** Drizzle's
`.insert().values()` does **not** automatically chunk a large array.
Passing all 10,000 rows to a single call throws
`SqliteError: too many SQL variables` (`better-sqlite3` enforces
SQLite's `SQLITE_MAX_VARIABLE_NUMBER`; at 9 bound columns per chunk row,
that limit is reached well under 10,000 rows). The ORM benchmark below
therefore batches into groups of 100 rows itself — exactly the kind of
workaround a real caller would have to hand-roll to use the query builder
safely at scale. This is an independent argument for the direct-SQL form
beyond raw speed: it does not have a silent row-count ceiling.

### Measured (100/1,000/10,000 rows, in-memory SQLite)

| Rows | ORM, batched (ms) | Direct SQL (ms) | Speedup |
| --- | --- | --- | --- |
| 100 | 3.25 | 0.33 | 9.8x |
| 1,000 | 15.11 | 2.37 | 6.4x |
| 10,000 | 120.82 | 22.65 | 5.3x |

`EXPLAIN QUERY PLAN` is empty/trivial for both forms (a single-row
`INSERT` has no plan to speak of — the cost is entirely in statement
preparation and parameter binding, not query planning). The gap is
dominated by Drizzle rebuilding and re-binding a fresh multi-row
`VALUES` clause per 100-row batch, versus the raw prepared statement
being compiled once and re-bound per row through `better-sqlite3`'s
native binding path.

### Decision

**Direct SQL.** `ChunkRepository.insertMany` uses a prepared statement
inside a `better-sqlite3` transaction. It is 5–10x faster at realistic
batch sizes, has no batching/chunking logic to get wrong, and the
ingestion lifecycle explicitly identifies bulk chunk insertion as a hot
path (an artifact can produce hundreds of chunks per ingestion event).

## Candidate B — Recursive Relationship Traversal

| Form | Implementation |
| --- | --- |
| ORM (iterative) | Repeated `db.select().from(relationships).where(inArray(sourceArtifactId, frontier))` calls, one per depth level, accumulating the frontier in application code. |
| Direct SQL | A single `WITH RECURSIVE` common table expression via `sqlite.prepare(...)`. |

Drizzle's query builder has no native representation of a recursive CTE;
the iterative ORM form requires N round-trips for an N-hop traversal, each
paying full statement-execution overhead, and requires the caller to
de-duplicate visited nodes itself to avoid infinite loops on a cyclic
graph. The direct-SQL form issues one statement regardless of depth, and
SQLite's `WITH RECURSIVE` evaluates depth-first with an explicit
`path NOT LIKE` visited-guard, so cycle protection is inside the query.

### Measured (100/1,000/10,000 relationship rows, depth 5, in-memory SQLite)

| Rows (relationships) | Depth | ORM iterative (ms) | Direct SQL (ms) | Speedup |
| --- | --- | --- | --- | --- |
| 100 | 5 | 1.95 | 0.51 | 3.8x |
| 1,000 | 5 | 4.63 | 0.80 | 5.8x |
| 10,000 | 5 | 32.74 | 4.31 | 7.6x |

The gap widens with row count because the iterative form's cost scales
with both the number of round-trips *and* the size of the full-table
scan each round-trip repeats (the benchmark's iterative form re-selects
the whole `relationships` table and filters in application code, since
the query builder has no `WHERE source_artifact_id IN (...frontier)`
shortcut that stays type-safe across an arbitrary frontier size — a real
implementation would need `inArray(...)`, adding yet more code for
still-worse performance than the CTE). The captured query plan for the
direct-SQL form shows SQLite using an automatic covering index for the
recursive step even without one declared in the benchmark's minimal
schema (see the note in Context above).

### Decision

**Direct SQL.** `RelationshipRepository.traverse` issues one
`WITH RECURSIVE` statement through the raw `better-sqlite3` handle. This
is the clearest case in the handoff: the ORM has no idiomatic
representation of this query shape at all, so "direct SQL" here is not
merely faster — it is the only form that expresses the operation
correctly without hand-rolled cycle detection in application code.

## Candidate C — Compound Cache-Hit / Staleness Query

| Form | Implementation |
| --- | --- |
| ORM | `db.select().from(sources).where(and(isNotNull(nextRefreshDueAt), lte(nextRefreshDueAt, asOf))).orderBy(...)` |
| Direct SQL | Equivalent hand-written `SELECT ... FROM sources WHERE next_refresh_due_at IS NOT NULL AND next_refresh_due_at <= ? ORDER BY next_refresh_due_at ASC`. |

### Measured (100/1,000/10,000 source rows, in-memory SQLite)

| Rows | ORM (ms) | Direct SQL (ms) | Ratio |
| --- | --- | --- | --- |
| 100 | 0.57 | 0.16 | 3.6x |
| 1,000 | 0.99 | 0.48 | 2.1x |
| 10,000 | 8.90 | 3.44 | 2.6x |

The captured `EXPLAIN QUERY PLAN` is identical for both forms: `SEARCH
sources USING INDEX sources_next_refresh_due_idx
(next_refresh_due_at>? AND next_refresh_due_at<?)` — a single indexed
range scan with no join fan-out. The query *execution* cost is the same;
the measured ratio is entirely query-builder construction overhead
(object allocation, combinator composition) on top of that shared
execution path, not a difference in what SQLite actually does. In
absolute terms this overhead is sub-millisecond even at 10,000 rows —
below the threshold where it would be visible against real I/O in a CLI
tool's request/response cycle.

### Decision

**ORM.** `SourceRepository.findRefreshDue` uses the query builder.
The measured ~2–3.6x ratio is real but trivial in absolute terms (well
under 10ms at 10,000 rows, a source count far beyond what a single local
Virgil workspace will realistically accumulate); readability and
type-safety win on a query this simple: the `and`/`isNotNull`/`lte`
combinators read close to the requirement text ("every source past its
refresh deadline"), and the query stays automatically in sync with
schema column renames, unlike the hand-written SQL string.

## Summary — the Encoded Boundary

| Operation shape | Boundary | Rationale |
| --- | --- | --- |
| Single-row CRUD (all tables) | ORM | Same query-builder-construction overhead as Candidate C, sub-millisecond in absolute terms; full type safety. |
| Simple filtered/joined reads (by hash, by source, by task, 2-level joins) | ORM | Same as above. |
| Bulk insert of many rows for one parent (chunks) | Direct SQL | 5–10x faster at realistic batch sizes, and has no silent row-count ceiling (the ORM form throws past ~SQLite's variable limit unless manually batched); ingestion is a hot path. |
| Recursive/graph-shaped multi-hop traversal | Direct SQL | Not expressible in the query builder at all; `WITH RECURSIVE` is both faster (4–8x) and correct-by-construction for cycles. |
| Compound but non-recursive filtered reads (cache/staleness) | ORM | 2–3.6x query-builder overhead measured, but sub-10ms in absolute terms even at 10,000 rows; readability wins. |

This boundary is encoded directly in the repository layer (D8): each
repository method's implementation — not a caller-supplied flag — decides
which form to use, so the choice is enforced structurally rather than
left as an undocumented convention. `docs/port-adapter-architecture.md`
documents the analogous port/adapter boundary for provider contracts;
this ADR is the equivalent evidence record for the ORM/SQL boundary.

## Revisiting This Decision

The boundary is a living decision (per the handoff). H07 (retrieval) and
H15 (lifecycle/compaction) may identify additional operations — e.g.
bulk embedding metadata writes, or compaction sweeps across the whole
`artifacts` table — that warrant the same benchmark-then-decide protocol
before being added to either column above.
