# Roadmap

Working plan for Virgil development. Derives from `principia/` and the
current implementation. Not a normative document.

## Current State

Virgil is a functional TypeScript CLI with 7 provider integrations
(dogma-local, dogma-github-wiki, ticket-jira, ticket-github, org-local,
sourcecode-local, chat-slack), a brief generation pipeline (RAG phase
1), a complete handoff lifecycle, and 77 app-level tests. The
implementation lives on `integration/virgil-cli`.

### Commit History (integration branch)

```
5435882 feat: brief generation pipeline (RAG layer phase 1)
146ac9e feat: GitHub Issues provider (ticket kind)
d247b6f docs: add AGENTS.md and AGENTS-DEV.md
589fd32 docs(principia): align constitution with CLI runtime
5ed9410 feat: virgil CLI — complete F1-F5 implementation
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

### GitHub Issues Provider (Ticket Kind)

- `GithubIssuesReaderService`: SnapshotProviderPort<GithubIssueSnapshot>
- `GithubHttpClientService`: native fetch, Bearer auth, rate-limit (429 + 403), exponential backoff
- Config: VIRGIL_GITHUB_TOKEN, VIRGIL_GITHUB_OWNER, VIRGIL_GITHUB_REPO, VIRGIL_GITHUB_API_URL (optional)
- Semantic refs: `ticket://github/{number}`
- `resolveRef` returns `html_url`

### Brief Generation Pipeline (RAG Phase 1)

- `BriefGeneratorService`: deterministic extraction + classification pipeline, zero LLM
- `extractSections()`: markdown heading splitter with paragraph fallback
- `classifySection()`: regex cascade → 6 BriefKind categories (risk, constraint, decision, glossary, open-question, principle)
- `summarizeSection()`: privacy-aware summarizer with pre-authored safe strings
- `BriefItem` IDs: SHA-256 deterministic hashing
- Watermark: git commit SHA for drift detection
- Output: .virgil/brief.json + .virgil/brief.md
- CLI: `virgil brief`

### GitHub Wiki Dogma Provider

- `GithubWikiService`: SnapshotProviderPort<DogmaDocument[]> via git clone
- Clone `.wiki.git` to `.virgil/cache/wiki-{owner}-{repo}/`, shallow depth 1
- Filters `_Sidebar`, `_Footer`, `_Header` (wiki chrome, not content)
- Graceful offline: cached data still usable when remote unreachable
- Config: VIRGIL_GITHUB_WIKI_OWNER, VIRGIL_GITHUB_WIKI_REPO, VIRGIL_GITHUB_WIKI_TOKEN (optional), VIRGIL_GITHUB_WIKI_CACHE_DIR (optional)
- Semantic refs: `dogma://github-wiki/{page}` → resolves to GitHub wiki URL

### Brief Query + Drift Detection (RAG Phase 2)

- `BriefQueryService`: loads persisted brief.json, filters by kind/text/sourceRef/maxItems
- `checkDrift()`: compares brief watermark vs git HEAD, counts commits behind
- CLI: `virgil brief --kind risk --search text --check-drift`
- Query mode auto-activates when any filter flag present
- Drift included in every query result

### App-Level Test Suite

- 10 test files, 85 scenarios
- Zero mocks -- full NestJS application bootstrap
- Covers: registry ops, context flow, handoff lifecycle, audit checks, reactive events, proactive insights, GitHub Issues, brief generation, GitHub Wiki, brief query + drift
- Filterable by test name via Vitest

## Next Steps (Priority Order)

1. **Brief-handoff integration** (in progress) -- wire BriefQueryService
   into HandoffService.create() so CONTEXT.md uses classified brief items
   instead of raw dogma excerpts. Auto-generate brief if missing.

2. **Additional providers** -- extend the provider plugin pattern to more
   backends:
   - Confluence (dogma kind)
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
