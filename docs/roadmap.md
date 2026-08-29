# Roadmap

Working plan for Virgil development. Derives from `principia/` and the
current implementation. Not a normative document.

## Current State

Virgil is a functional TypeScript CLI with 5 provider integrations, a
complete handoff lifecycle, and 47 app-level tests. The implementation
lives on `feat/virgil-cli`, built incrementally from `0aeb79e` (scaffold)
through `7203262` (test suite).

### Commit History

```
7203262 test: app-level tests — 47 scenarios, zero mocks, filterable
522c2c3 feat: principia enforcement — state machine, quality gates, ledger, break-glass
1bec100 feat(f5): proactive insights + ChatProvider Slack
26e77a4 feat(f4): reactive polling mode — RxJS events, cursors, EventRouter
dcc675b feat(f3): org + sourcecode providers, unified RefResolver
aa9c2a7 feat(f2): handoff generation + audit system
29aaa20 feat(f1): provider registry + DogmaLocal + Jira providers
0aeb79e feat: scaffold TypeScript CLI — NestJS standalone + nest-commander
2572287 chore: pivot to TypeScript CLI — principia to reference, drop MCP docs
```

## Completed Phases

### F1: Provider Registry + DogmaLocal + Jira

- `ContextProviderPort` / `SnapshotProviderPort<T>` / `ObservableProviderPort<E>` port hierarchy
- `ProviderRegistryService` with kind-based and capabilityId-based lookup
- `CapabilityRegistryService` with status tracking (configured-unverified / available / degraded)
- `DogmaLocalService`: local filesystem provider (md, txt, json, yaml)
- `JiraReaderService`: Jira REST API provider (boards, sprints, issues)
- `registerIfConfigured()` pattern for graceful degradation

### F2: Handoff Generation + Audit

- `HandoffService.create()` generating 4 files (TASK.md, CONTEXT.md, ACCEPTANCE_CHECKLIST.md, META.json)
- Guardrails: allowedPaths, forbiddenPaths, maxFilesChanged, maxLinesChanged
- FastForward levels 1-4 (ceremony compression)
- `AuditService` with 6 checks: scope, forbidden, file-count, line-count, conflict-markers, agent-output
- Gap classification: IMPLEMENTATION, TESTING, CONTRACT, COMPLIANCE
- Recommendation routing based on gap type
- AUDIT_REPORT.json + FEEDBACK.md output

### F3: Org + SourceCode + RefResolver

- `OrgLocalService`: JSON/YAML org data (members, roles, teams)
- `SourceCodeLocalService`: local git repos (branch, commits, status, poll for events)
- `RefResolverService`: cross-provider ref resolution via `{kind}://{backend}/{id}` URI scheme
- Semantic ref parsing and construction (`parseRef`, `buildRef`)

### F4: Reactive Polling Mode

- `PollingLoopService`: configurable interval (default 30s), tick-based polling
- `CursorStoreService`: persistent cursors in `.virgil/cursors.json`
- `EventRouterService`: kind-based event dispatch
- 5 event kinds: ticket-updated, ticket-created, commit-pushed, doc-changed, member-changed
- `SourceCodeLocalService` as first `ObservableProviderPort` implementation (commit-pushed events)

### F5: Proactive Insights + Slack

- `InsightEngineService` with pluggable `InsightAnalyzerPort`
- `StaleTicketAnalyzer`: detects stale tickets
- `UncommittedChangesAnalyzer`: detects dirty working directories
- 3 severity levels: critical, warning, info
- `SlackReaderService`: Slack API provider (channels, messages, ref resolution)

### Principia Enforcement

- `HandoffStateMachine`: 5-state lifecycle (draft -> handoff -> execution -> verify -> delivered)
- Transition preconditions (file existence, audit verdict)
- Break-glass override with 72h certification deadline
- `LedgerService`: append-only JSONL (created, transition, audit, break-glass events)
- Quality gates blocking invalid transitions

### App-Level Test Suite

- 6 test files, 47 scenarios
- Zero mocks -- full NestJS application bootstrap
- Covers: registry ops, context flow, handoff lifecycle, audit checks, reactive events, proactive insights
- Filterable by test name via Vitest

## Next Steps (Priority Order)

1. **RAG layer** -- vectorize provider snapshots for semantic retrieval
   instead of raw reads. Enforce token economy so handoff context stays
   within LLM context windows.

2. **Additional providers** -- extend the provider plugin pattern to more
   backends:
   - Confluence (dogma kind)
   - GitHub Issues (ticket kind)
   - Microsoft Teams (chat kind)
   - Azure DevOps (ticket kind)

3. **Execution tracking** -- sub-phases within the `execution` state:
   prePhase -> Red -> Green -> Refactor -> Verify. Finer-grained progress
   tracking without changing the top-level state machine.

4. **Mechanical verification gates** -- extend audit checks with:
   - Mutation score
   - CRAP index
   - Cyclomatic complexity
   - CVE scan
   - Coverage thresholds

5. **E2E tests** -- multi-service integration scenarios per the principia
   testing matrix. Currently all tests are app-level; E2E would exercise
   real provider backends (Jira, Slack) in a controlled environment.

6. **CLI polish** -- better error messages, `--json` output format for
   scripting, config file support (`.virgilrc` or similar), shell
   completions.

## Non-Goals for V1

- **Method Pack system** -- Scrum/Kanban/Shape Up abstraction layer. The
  current handoff lifecycle is methodology-agnostic by design. Method Packs
  add ceremony on top; not needed until there is a concrete second
  methodology to support.

- **MCP server mode** -- deliberate pivot away from this. Virgil was
  originally an MCP server (Go binary). The TypeScript CLI approach is
  simpler, more portable, and does not require MCP host support. The
  principia still describes MCP concepts; the runtime does not implement
  them.

- **GUI / web dashboard** -- Virgil is a CLI tool. Visualization is handled
  by reading the structured outputs (META.json, AUDIT_REPORT.json,
  ledger.jsonl) with existing tools.

- **codebaseMemory** -- AST-derived structural graph. Use CodeGraph as an
  external tool instead of building this into Virgil. The principia makes
  room for it (section 8f) but it is not a runtime requirement.
