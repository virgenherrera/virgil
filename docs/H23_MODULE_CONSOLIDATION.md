# H23 -- Module Consolidation

## 1. Overview

This milestone migrates the 14 production modules from `packages/cli/` (179 source files, real services, persistence, RAG pipeline) into `apps/virgil/` (57 source files, scaffold command surface, 110+ tests at 98.7% coverage). The result is a single authoritative application package (`@virgil/app`) with real service implementations wired into the existing scaffold's command handlers, Zod validation, and NestJS DI graph. `packages/cli/` (`@virgil/cli`) ceases to be the product runtime.

### Success Criteria

- All 14 modules from `packages/cli/src/` have equivalents in `apps/virgil/src/`
- `apps/virgil` passes all existing tests plus new integration tests for migrated services
- Test coverage remains at or above 98%
- `apps/virgil` is the sole entry point for all Virgil commands (no runtime dependency on `packages/cli`)
- `packages/local-indexers` and `packages/pw-cdp` remain as library dependencies consumed by `apps/virgil`
- SQLite persistence works end-to-end within `apps/virgil`

---

## 2. Approach

Three migration strategies are viable. Each has distinct tradeoffs in velocity, risk, and code quality.

### Option A -- Move & Adapt

Copy module source from `packages/cli/src/<module>/` into `apps/virgil/src/`, adapt import paths and NestJS module wiring to match the scaffold's existing patterns. `packages/cli` becomes legacy/archive after full migration.

| Pros | Cons |
|------|------|
| Preserves battle-tested logic exactly | Carries forward any tech debt from `packages/cli` |
| Fastest path -- no rewrite | Import path adaptation may be tedious across 179 files |
| Existing tests can migrate with the code | Scaffold patterns (Zod schemas, OutputFormatter) may clash with moved code |

### Option B -- Extract to Shared Library

Create `packages/core/` as a shared domain library. Move service logic there, then import from both `apps/virgil` and `packages/cli` during transition. `packages/cli` gradually drops its local copies.

| Pros | Cons |
|------|------|
| Both packages work during transition | Introduces a third package to maintain |
| Clean separation of domain vs. CLI concerns | Adds indirection; domain types split across packages |
| Enables future consumers of core logic | Slows migration -- every module touches three packages |

### Option C -- Rewrite from Reference

Use `packages/cli/src/` as specification reference. Rewrite each module fresh in `apps/virgil/src/` following current scaffold patterns (Zod schemas, OutputFormatter, SharedModule). `packages/cli` becomes read-only reference.

| Pros | Cons |
|------|------|
| Cleanest result -- no inherited tech debt | Slowest path; risk of subtle behavioral divergence |
| Uses scaffold patterns natively (Zod, OutputFormatter) | Requires thorough behavioral tests to prove parity |
| Opportunity to simplify over-engineered modules | Higher effort per module |

> **OWNER DECISION REQUIRED**: Select a migration strategy before Wave 0 begins. A hybrid (e.g., Option A for complex modules, Option C for simple ones) is also viable but must be declared explicitly.

---

## 3. Migration Order

Modules are ordered by dependency topology. No module begins migration until all of its dependencies are complete.

### Wave 0 -- Foundation

| Module | Files | Key Exports | Depends On | Scaffold Overlap | Migration Scope |
|--------|-------|-------------|------------|------------------|-----------------|
| shared | 6 | Primitives (ulid, timestamps, content-hash), domain types (Provider, Workspace, Handoff, Knowledge) | none | `apps/virgil/src/shared/` has OutputFormatter, PromptService, NonTtyError, Zod schemas, SharedModule | Merge primitives and types into existing SharedModule without breaking current exports |

### Wave 1 -- Infrastructure

| Module | Files | Key Exports | Depends On | Scaffold Overlap | Migration Scope |
|--------|-------|-------------|------------|------------------|-----------------|
| persistence | 23 | 8 repositories, Drizzle schemas, DATABASE_CONNECTION token, SQLite via better-sqlite3 | shared | None | Full migration: schemas, repositories, connection factory, migrations |
| contracts | 11 | ProviderRegistryService (register/resolve/list/healthAll) | shared | `apps/virgil/src/provider/` has scaffold commands for add/list/test/remove | Wire ProviderRegistryService behind existing provider scaffold commands |
| workspace | 19 | WorkspaceService, WorkspaceFsService, StateDirectoryService + 5 CLI commands | shared | `apps/virgil/src/workspace/` has scaffold commands for create/list/select/show/delete | Replace fixture services with real WorkspaceService, WorkspaceFsService, StateDirectoryService |

### Wave 2 -- Core Services

| Module | Files | Key Exports | Depends On | Scaffold Overlap | Migration Scope |
|--------|-------|-------------|------------|------------------|-----------------|
| repo | 7 | LocalRepoProviderFactory, CodeGraphService | contracts, shared | `apps/virgil/src/repo/` has scaffold commands for add/list/show/remove | Wire real repo provider factory behind scaffold commands |
| rag | 19 | HybridRetrieverService, TextRetrieverService, LexicalSearchService, RetrievalCacheService | contracts, persistence | None | Full migration: retrieval services, cache layer, PersistenceModule integration |
| lifecycle | 10 | CompactionService, LifecycleMetricsService, LifecyclePolicyService, StateTransitionService | persistence, shared | None | Full migration: lifecycle services with PersistenceModule dependency |
| governance | 17 | BudgetGovernor, EscalationGate, HarnessRegistry, TierResolver, AuditTrailStore | none | `apps/virgil/src/governance/` has scaffold commands for budget/audit | Wire real governance services behind scaffold commands |

### Wave 3 -- Adapters

| Module | Files | Key Exports | Depends On | Scaffold Overlap | Migration Scope |
|--------|-------|-------------|------------|------------------|-----------------|
| handoff | 6 | HandoffProtocolFactory | shared | None | Migrate factory and protocol types |
| knowledge | 12 | KnowledgeAdapterFactory (Confluence API, CDP, LocalFS) | contracts, shared | `apps/virgil/src/knowledge/` has scaffold commands for search/inspect/maintain | Wire real adapter factory behind scaffold knowledge commands |
| chat | 12 | ChatProviderFactory, TargetedDiscoveryService | contracts, shared | None | Migrate chat provider factory and discovery service |
| issues | 10 | GitHubAdapterSelectorService, HTTP_CLIENT | contracts, shared | None | Migrate GitHub adapter and HTTP client setup |

### Wave 4 -- Orchestration

| Module | Files | Key Exports | Depends On | Scaffold Overlap | Migration Scope |
|--------|-------|-------------|------------|------------------|-----------------|
| discovery | 10 | IssueResolutionService, IntentExtractionService, GapAnalysisService, CrawlBoundaryService | contracts, rag, shared | None | Migrate discovery services; depends on RAG being complete |
| orchestration | 13 | AgentFactory, DependencyGraphService, ChildHandoffService, ResultCollectorService | handoff, shared | None | Migrate orchestration services; depends on handoff being complete |

---

## 4. Module Specifications Index

Individual module PRDs will be created one at a time as each wave begins.

| Module | Wave | PRD Status | Doc Path |
|--------|------|------------|----------|
| shared | 0 | **Done** | Rewrite from Reference — 52 tests |
| persistence | 1 | **Done** | Move & Adapt — 103 tests |
| contracts | 1 | **Done** | Rewrite from Reference — 102 tests |
| workspace | 1 | **Done** | Rewrite from Reference — 56 tests |
| repo | 2 | **Done** | Rewrite from Reference — 109 tests |
| rag | 2 | **Done** | Move & Adapt — 112 tests |
| lifecycle | 2 | **Done** | Rewrite from Reference — 46 tests |
| governance | 2 | **Done** | Rewrite from Reference — 70 tests |
| handoff | 3 | **Done** | Rewrite from Reference — 30 tests |
| knowledge | 3 | **Done** | Rewrite from Reference — 136 tests |
| chat | 3 | **Done** | Rewrite from Reference — 32 tests |
| issues | 3 | **Done** | Rewrite from Reference — 60 tests |
| discovery | 4 | **Done** | Move & Adapt — 103 tests |
| orchestration | 4 | **Done** | Move & Adapt — 95 tests |

---

## 5. Cross-Cutting Concerns

### Persistence Strategy

`packages/cli/` currently uses `:memory:` SQLite in its AppModule (intentional for SEA isolation). `apps/virgil` must decide on persistence topology before Wave 1.

- **Single SQLite DB**: One database file at the workspace `.virgil/db/` path, all 8 repository schemas share it. Simpler connection management, single transaction boundary.
- **Per-module DB**: Separate database files per domain (e.g., `knowledge.db`, `lifecycle.db`). Isolation at the cost of cross-domain query complexity.
- **Path resolution**: The `StateDirectoryService` from workspace module resolves `.virgil/db/` paths. This must be available before persistence module wires its connection.

> **OWNER DECISION REQUIRED**: Single DB vs. per-module DB topology.

### Testing Strategy

- TDD: tests and implementation paired per wave, never tests-last
- Maintain 98%+ line coverage (currently 98.7%)
- Unit tests for all services with mocked dependencies
- Integration tests with real SQLite (file-backed, not `:memory:`) for persistence-dependent modules (rag, lifecycle)
- Existing scaffold tests in `apps/virgil` must continue passing throughout migration
- Coverage enabled in vitest config -- one command, zero flags

### Dependency Management

- `packages/local-indexers` stays as a library; `apps/virgil` adds it as a workspace dependency when the knowledge module migrates (Wave 3)
- `packages/pw-cdp` stays as a library; `apps/virgil` adds it as a workspace dependency when CDP-based knowledge adapters migrate (Wave 3)
- `apps/virgil` currently has ZERO imports from `packages/*`; each wave introduces dependencies incrementally
- `packages/tools` is independent dev tooling and is not part of this migration

### packages/cli Disposition

After all 14 modules are migrated and verified in `apps/virgil`:

1. Remove `packages/cli` from the workspace's build/test pipeline
2. Archive the directory (rename to `packages/cli-archive/` or move to an `_archive/` folder)
3. Update any monorepo references (root `package.json`, CI configs, `pnpm-workspace.yaml`)

> **OWNER DECISION REQUIRED**: Archive strategy -- rename in-tree, move to separate branch, or delete entirely.

### Handoff Files

The `handoffs/` directory contains 23 files (H00 through H22). These are development methodology artifacts, not product code. They document completed milestones and are not affected by module consolidation. They remain as-is.

---

## 6. Out of Scope

- **Exploratory Ideas from PROJECT.md**: Meeting assistant mode, grooming/refinement mode, org-chart/role tagging, RPA browser automation implementation details, Node SEA distribution. These are explicitly "Not Committed Scope" per PROJECT.md.
- **Implementation**: This PRD is planning only. Code changes require explicit owner authorization per wave.
- **The probe system and packages/tools**: Independent dev tooling (`pnpm probe`), unrelated to product modules.
- **IDE plugin integration**: Not current scope per PROJECT.md ("Not an IDE plugin (yet)").
- **New feature development**: This milestone migrates existing logic. No new features, commands, or capabilities are introduced.
- **TOON syntax changes**: The output format is a product concern orthogonal to module consolidation.

---

## 7. Decisions (Resolved 2026-09-05)

1. **Migration strategy**: Hybrid -- Move & Adapt for complex modules (persistence, rag, discovery, orchestration), Rewrite from Reference for simpler ones (shared, contracts, governance, handoff, workspace, repo, knowledge, chat, issues). Balances velocity with code quality.

2. **Persistence topology**: Single SQLite database at the workspace `.virgil/db/` path, all repository schemas share it. Aligned with PROJECT.md on-disk layout.

3. **Unwired modules in packages/cli**: Treated as production-ready reference implementations. Verified during migration for completeness.

4. **Governance module dependency**: Remains in-memory for now. Persistence can be added as a future enhancement after consolidation.

5. **Wave cadence**: One branch per wave. Verification checkpoint at wave completion before merging.
