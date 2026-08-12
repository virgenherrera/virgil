# Handoff: Executive Secretary T0 Runtime

## Branch

`feat/takeover-conclude-executive-secretary` (takeover from `refactor/executive-secretary-docs`)

## Summary

Complete reconstruction of Virgil as an Executive Secretary architecture with
a standalone Go 1.25 binary implementing the T0 runtime vertical: `virgil.init`
through the `repo-docs` adapter, black-box certification via fresh subprocesses,
and fail-closed evidence publication.

## Status

| Step (from go-runtime.md) | Status |
|---------------------------|--------|
| 1. App-level selectors (Red) | Done (dc39c7e) |
| 2. invoke + virgil.init + repo-docs | Done (03b6190, 851fc70, 66fd43d) |
| 3. run_t0 + fresh-process + recovery | Done (66fd43d) |
| 4. EvidenceBundle publication | Done (9880913, 0fc7cd4, 6114127, 8bd8426) |
| 5. Evaluate G1 Production-Safe Green | Blocked: requires Go 1.25 |

## Prerequisites for G1 Evaluation

1. **Install Go 1.25+** on the build machine
2. **Generate `go.sum`**: run `go mod tidy` (file was deleted in the reset commit
   and never regenerated)
3. **Run**: `go test ./test/app -run '^TestApp_' -v -count=1`
4. All three TestApp_* scenarios must pass with evidence publication

## Commits (14 total, main..HEAD)

| Hash | Message |
|------|---------|
| 814e564 | refactor!: reset Virgil around executive secretary |
| c0b0e3c | docs: define validation and slice 1 protocol |
| 937c43c | docs: remove legacy methodology corpus |
| 9e3ba03 | docs: add app-level t0 validation contracts |
| c09b92a | docs: select standalone Go runtime |
| dc39c7e | feat: scaffold app-level T0 red harness |
| 03b6190 | feat: enforce repo-docs policy boundary |
| 7ba0722 | docs: type T0 evidence resources |
| 851fc70 | feat: add durable repo-docs init store |
| 66fd43d | feat: execute repo-docs T0 operations |
| 9880913 | feat: publish typed T0 evidence |
| 0fc7cd4 | feat: certify T0 scenarios with evidence |
| 6114127 | test: harden app-level T0 evidence oracles |
| 8bd8426 | pausa porque el imbecil sol se agoto sus tokens |

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

### Package boundary rules

- `internal/t0` NEVER imports `internal/runtime` (spawns real subprocesses)
- `test/app` NEVER imports internal packages (black-box only)
- `internal/repodocs` receives explicit roots, never discovers target
- Only `assets.go` (module root) owns `go:embed`

### Dependencies (exactly 2, pinned)

| Dependency | Version | Purpose |
|------------|---------|---------|
| github.com/gowebpki/jcs | v1.0.1 | RFC 8785 canonical JSON |
| github.com/santhosh-tekuri/jsonschema/v6 | v6.0.3 | JSON Schema Draft 2020-12 |

## Files Changed

### New files (this branch)

| File | Purpose |
|------|---------|
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

## Known Gaps

### Blocking

1. **No `go.sum`**: deleted in reset, requires Go 1.25 to regenerate
2. **Go 1.25 not available locally**: the installed version is 1.19.3

### Non-blocking (documented, by design)

3. **Boundary violation in `internal/repodocs`**: imports `internal/contracts`
   and `internal/wire` beyond the documented allowlist (`internal/protocol`,
   `os.Root`). No circular dependency. Used for schema validation and
   unambiguous JSON parsing. Requires architectural decision: either update the
   documented boundary or refactor validators into a shared package.
4. **Deterministic staging crash lockout**: a crash leaves deterministic staging
   dirs that permanently block the same retry. Known since the adversarial audit.
   Recovery requires external intervention or a lease mechanism (future work).
4. **Trace causality is linear**: the trace is built by walking expected fixture
   steps; non-operation steps are marked `observed=true` without an independent
   runtime observation. Acceptable for T0 with deterministic fixtures.
5. **`virgil.new` and `virgil.continue`**: deliberately return `unsupported` per
   contract. Not part of this vertical.
6. **`omitempty` on `RunT0Envelope.Limits`**: a no-op on a non-pointer struct
   field in `encoding/json`. Latent (nothing marshals this struct directly).
7. **`entrypoint.go:writeError`** discards the JSON-encoding error with `_`.
   Process still exits with code 2 and stderr message, but stdout may be
   empty/partial. Minor.
8. **`t0/evidence.go:observedProjectAuthority`** reads via plain `os.ReadFile`
   instead of `os.Root`-confined handle. Read-only, post-hoc observation on an
   already-validated namespace. Not exploitable today but breaks the
   traversal-resistant pattern.

### Fixed in this takeover

9. Removed dead code `firstInvoke` in `internal/t0/runner.go`
10. Removed unused `fixture` parameter from `validateHappyScenario` and
    `validateRetryScenario`

---

## Test Plan

### Philosophy

Virgil certifies with **app-level black-box scenarios** that enter through the
public binary surface and observe requests, guards, effects, diffs, recovery,
and Evidence Bundles. Unit tests are NOT certification evidence and do NOT close
Red, Green, Refactor, or Verify gates.

### Test Runner

```sh
go test ./test/app -run '^TestApp_' -v -count=1
```

### Selector Conventions

| Selector | Command |
|----------|---------|
| All app-level T0 | `go test ./test/app -run '^TestApp_T0'` |
| Single scenario | `go test ./test/app -run '^TestApp_T0InitRepoDocsHappy$'` |
| By build tag (CI) | `go test -tags applevel ./test/app` |
| By package | `go test ./test/app` |

The `applevel` build tag MAY be added as a CI filter but does not replace
package + name selection.

### Current Scenarios (T0)

#### TestApp_T0InitRepoDocsHappy

**What it tests**: The full happy path of `virgil.init` through `repo-docs`.

**Flow**:
1. Build the real `virgil` binary from source
2. Create isolated workspace + evidence directories via `t.TempDir()`
3. Send `run_t0` envelope with `t0-init-repo-docs-happy` fixture
4. Assert: outcome `passed`, single fresh process with valid PID
5. Assert: workspace contains exactly `project.json` + `events.jsonl` under
   the correct namespace
6. Assert: EvidenceBundle published atomically with:
   - Valid manifest with JCS integrity seal (RFC 8785)
   - AgentInteractionTrace with causal ordering and process correlation
   - RunnerObservationReport with PID correlation and checkpoint diffs
   - All filesystem snapshots and diffs present and digest-verified
   - Content cardinality: 1 trace, 1 event_log, 1 runner_report,
     1 project_state, 2+ snapshots, 2+ diffs
   - No symlinks, no unexpected files in the evidence tree

#### TestApp_T0InitUnmanagedWriteBlocked

**What it tests**: Policy enforcement blocks writes outside the managed namespace.

**Flow**:
1. Same binary build and isolation setup
2. Send `run_t0` with `t0-init-unmanaged-write-blocked` fixture
3. Assert: outcome `passed` (the SCENARIO passes because blocking is correct)
4. Assert: workspace has ZERO files (no writes occurred)
5. Assert: EvidenceBundle has no `project_state` resource (nothing was created)
6. Assert: all other evidence artifacts present and valid

#### TestApp_T0InitIdempotentRetryFreshProcess

**What it tests**: Idempotent replay from a fresh process after initial success.

**Flow**:
1. Same binary build and isolation setup
2. Send `run_t0` with `t0-init-idempotent-retry` fixture
3. Assert: outcome `passed` with exactly 2 fresh processes
4. Assert: process-a and process-b have distinct PIDs (never reused)
5. Assert: workspace has exactly the same 2 files (no duplicates from replay)
6. Assert: events.jsonl contains exactly 1 event (not duplicated by replay)
7. Assert: EvidenceBundle complete with all integrity checks

### What Each Test Independently Verifies

Every passing scenario independently verifies these 12 oracles:

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
| 12 | Evidence tree closure | No unexpected files, no symlinks, no non-regular nodes |

### Future T0 Scenarios (not in scope for this branch)

These scenarios should be added as new fixtures when the codebase evolves:

| Scenario | Fixture ID (proposed) | What it would test |
|----------|-----------------------|-------------------|
| Corrupt envelope | `t0-init-corrupt-envelope` | Reject malformed JSON, duplicates, depth >64 |
| Invalid bindings | `t0-init-invalid-bindings` | Reject symlink target, missing dogma, wrong digest |
| Conflict on retry | `t0-init-idempotency-conflict` | Different intent same key returns IDEMPOTENCY_CONFLICT |
| Evidence failure | `t0-init-evidence-failure` | Scenario passes but evidence publication fails gracefully |
| Timeout | `t0-init-subprocess-timeout` | Subprocess killed after deadline |

### Non-Certifying Tests (allowed but separate)

Unit tests MAY exist under any `internal/` package for development feedback.
They:
- MUST NOT be named `TestApp_*`
- MUST NOT be in `test/app/`
- Do NOT close any quality gate
- Are NOT referenced by Evidence Bundles

---

## Cleanup at Merge

Delete this directory:

```sh
rm -rf .handoff/
```

Also delete `.atl/` if the skill registry is not desired in the target branch.
