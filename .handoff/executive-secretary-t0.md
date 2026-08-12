# Handoff: Executive Secretary T0 Runtime

## Branch

`feat/takeover-conclude-executive-secretary` (takeover from `refactor/executive-secretary-docs`)

## Summary

Complete reconstruction of Virgil as an Executive Secretary architecture with
a standalone Go 1.26.5 binary implementing the T0 runtime vertical: `virgil.init`
through the `repo-docs` adapter, black-box certification via fresh subprocesses,
and fail-closed evidence publication. Docker-based build/test pipeline for
absolute version control.

## Status

| Step (from go-runtime.md) | Status |
|---------------------------|--------|
| 1. App-level selectors (Red) | Done (dc39c7e) |
| 2. invoke + virgil.init + repo-docs | Done (03b6190, 851fc70, 66fd43d) |
| 3. run_t0 + fresh-process + recovery | Done (66fd43d) |
| 4. EvidenceBundle publication | Done (9880913, 0fc7cd4, 6114127) |
| 5. Evaluate G1 Production-Safe Green | **PASS** — all 3 TestApp_* pass |

## G1 Production-Safe Green

All three app-level certification scenarios pass:

```
=== RUN   TestApp_T0InitRepoDocsHappy
--- PASS: TestApp_T0InitRepoDocsHappy (2.03s)
=== RUN   TestApp_T0InitUnmanagedWriteBlocked
--- PASS: TestApp_T0InitUnmanagedWriteBlocked (0.26s)
=== RUN   TestApp_T0InitIdempotentRetryFreshProcess
--- PASS: TestApp_T0InitIdempotentRetryFreshProcess (0.28s)
PASS
ok  	github.com/virgenherrera/virgil/test/app	2.569s
```

Run command:
```sh
docker run --rm -v "$(pwd)":/src -w /src golang:1.26.5 \
  go test ./test/app -run '^TestApp_' -v -count=1
```

## Build Pipeline

Docker-based, no local Go installation required:

```sh
make build   # compile binary in Docker
make test    # run TestApp_* certification tests
make deps    # go mod tidy (regenerate go.sum)
make lint    # go vet
make clean   # remove build artifacts
```

All targets use `golang:1.26.5` image (exact latest LTS).

## Architecture

```text
cmd/virgil/main.go         stdin JSON -> stdout JSON, exit
    |
internal/entrypoint         dispatch: invoke | run_t0
    |                   |
internal/runtime        internal/t0
    |                       |
internal/repodocs       internal/evidence
internal/protocol       internal/contracts
internal/wire           internal/wire
```

### Package boundary rules (all verified)

- `internal/t0` NEVER imports `internal/runtime` (spawns real subprocesses)
- `test/app` NEVER imports internal packages (black-box only)
- `internal/repodocs` imports ONLY `internal/protocol` + `os.Root` (DI for validation)
- Only `assets.go` (module root) owns `go:embed`

### Dependencies (exactly 2, pinned)

| Dependency | Version | Purpose |
|------------|---------|---------|
| github.com/gowebpki/jcs | v1.0.1 | RFC 8785 canonical JSON |
| github.com/santhosh-tekuri/jsonschema/v6 | v6.0.3 | JSON Schema Draft 2020-12 |

## Code Quality Fixes (this takeover)

All 7 issues from the static audit are resolved. Zero gaps, zero warnings.

| # | Issue | Fix |
|---|-------|-----|
| 1 | `omitempty` no-op on `RunT0Envelope.Limits` | Removed misleading tag |
| 2 | `writeError` discarded JSON-encoding error | Added error handling with stderr fallback |
| 3 | `observedProjectAuthority` used plain `os.ReadFile` | Migrated to `os.Root` traversal-resistant reads |
| 4 | Magic path literals `"project.json"`, `"events.jsonl"` | Centralized as `protocol.RepoDocsProjectFile/EventsFile` |
| 5 | Boundary violation: repodocs imported contracts+wire | Dependency injection via `SchemaValidator`/`JSONValidator` interfaces |
| 6 | Deterministic staging crash lockout | Crash recovery: clean stale staging on `ErrExist`, retry once |
| 7 | Dead code (`firstInvoke`) + unused parameters | Removed in prior commit (f7705a6) |

## Files Changed

### New files (this branch)

| File | Purpose |
|------|---------|
| Dockerfile | Multi-stage: build, test, scratch (golang:1.26.5) |
| Makefile | deps, build, test, lint, clean targets |
| assets.go | go:embed of schemas and fixtures |
| cmd/virgil/main.go | 12-line CLI entrypoint |
| internal/contracts/fixtures.go | T0 fixture loader with semantic validation |
| internal/contracts/registry.go | Bundled-only JSON Schema compiler |
| internal/contracts/semantics.go | Cross-fixture invariant checks |
| internal/entrypoint/entrypoint.go | Envelope dispatch (invoke vs run_t0) |
| internal/evidence/filesystem.go | Atomic manifest-last publication |
| internal/evidence/json.go | Strict JSON/NDJSON, JCS integrity sealing |
| internal/evidence/prepare.go | Bundle validation, cross-references, diff recomputation |
| internal/evidence/secrets.go | Allowlisted secret scanning |
| internal/evidence/types.go | Publisher API, Input, Layout |
| internal/protocol/dto.go | All Slice-1 DTOs with strict decoders |
| internal/repodocs/repodocs.go | Durable repo-docs adapter (JCS, atomic, replay) |
| internal/runtime/runtime.go | Operation router and binding validator |
| internal/t0/evidence.go | T0 evidence assembly (trace, report, snapshots, diffs) |
| internal/t0/runner.go | Fresh-process T0 harness with filesystem oracles |
| internal/wire/decoder.go | Strict envelope decoder (rejects duplicates, depth >64) |
| internal/wire/envelope.go | Envelope/result types |
| test/app/runtime_t0_test.go | App-level black-box T0 certification tests |

### Documentation (docs/)

All files under `docs/` are canonical dogma. Key documents:

- `docs/architecture/executive-secretary.md` — role and components
- `docs/architecture/go-runtime.md` — T0 runtime contract (this feature's spec)
- `docs/architecture/system-boundaries.md` — isolation and identity rules
- `docs/quality/production-safe-green.md` — what Green means
- `docs/quality/validation-strategy.md` — app-level certification strategy
- `docs/slices/01-planning/` — Slice 1 protocol, conformance, state model

## Remaining Design Decisions (non-blocking)

These are documented by-design limitations, not gaps:

1. **Trace causality is linear**: built by walking expected fixture steps;
   acceptable for T0 with deterministic fixtures.
2. **`virgil.new` and `virgil.continue`**: deliberately return `unsupported`
   per contract. Not part of this vertical.

---

## Test Plan

### Philosophy

Virgil certifies with **app-level black-box scenarios** that enter through the
public binary surface and observe requests, guards, effects, diffs, recovery,
and Evidence Bundles. Unit tests are NOT certification evidence and do NOT close
Red, Green, Refactor, or Verify gates.

### Test Runner

```sh
make test
# or directly:
docker run --rm -v "$(pwd)":/src -w /src golang:1.26.5 \
  go test ./test/app -run '^TestApp_' -v -count=1
```

### Selector Conventions

| Selector | Command |
|----------|---------|
| All app-level T0 | `go test ./test/app -run '^TestApp_T0'` |
| Single scenario | `go test ./test/app -run '^TestApp_T0InitRepoDocsHappy$'` |
| By build tag (CI) | `go test -tags applevel ./test/app` |
| By package | `go test ./test/app` |

### Current Scenarios (T0)

#### TestApp_T0InitRepoDocsHappy

**What it tests**: The full happy path of `virgil.init` through `repo-docs`.

**Flow**:
1. Build the real `virgil` binary from source
2. Create isolated workspace + evidence directories via `t.TempDir()`
3. Send `run_t0` envelope with `t0-init-repo-docs-happy` fixture
4. Assert: outcome `passed`, single fresh process with valid PID
5. Assert: workspace contains exactly `project.json` + `events.jsonl`
6. Assert: EvidenceBundle published atomically with integrity seals

#### TestApp_T0InitUnmanagedWriteBlocked

**What it tests**: Policy enforcement blocks writes outside managed namespace.

**Flow**:
1. Same binary build and isolation setup
2. Send `run_t0` with `t0-init-unmanaged-write-blocked` fixture
3. Assert: outcome `passed` (blocking is correct behavior)
4. Assert: workspace has ZERO files
5. Assert: EvidenceBundle has no `project_state` resource

#### TestApp_T0InitIdempotentRetryFreshProcess

**What it tests**: Idempotent replay from a fresh process after initial success.

**Flow**:
1. Same binary build and isolation setup
2. Send `run_t0` with `t0-init-idempotent-retry` fixture
3. Assert: outcome `passed` with exactly 2 fresh processes
4. Assert: process-a and process-b have distinct PIDs
5. Assert: events.jsonl contains exactly 1 event (not duplicated)

### 12 Independent Oracles (per scenario)

| # | Oracle | Method |
|---|--------|--------|
| 1 | Runtime protocol identity | `runtime_protocol` + `kind` match |
| 2 | Scenario outcome | `outcome == "passed"` |
| 3 | Fresh process isolation | Distinct PIDs per process_id |
| 4 | Check completeness | All checks present and passed |
| 5 | Evidence manifest integrity | JCS RFC 8785 seal verification |
| 6 | Trace integrity | JCS RFC 8785 seal verification |
| 7 | Runner report integrity | JCS RFC 8785 seal verification |
| 8 | Trace causality | Entry sequence, process correlation, causation DAG |
| 9 | Report-process correlation | PID match between public and report |
| 10 | Content typing | Role/schemaID/mediaType contract validation |
| 11 | Resource digests | SHA-256 of every evidence file matches declared digest |
| 12 | Evidence tree closure | No unexpected files, no symlinks |

---

## Cleanup at Merge

Delete this directory:

```sh
rm -rf .handoff/
```

Also delete `.atl/` if the skill registry is not desired in the target branch.
