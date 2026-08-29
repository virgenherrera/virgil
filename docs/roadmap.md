# Roadmap

Working plan for Virgil development. Derives from `principia/` and the
current implementation. Not a normative document.

## Current State

Virgil is a functional TypeScript CLI with 11 provider integrations
(dogma-local, dogma-github-wiki, dogma-confluence, ticket-jira,
ticket-github, ticket-azdo, org-local, org-github, sourcecode-local,
chat-slack, chat-teams),
a brief generation pipeline (RAG phases 1+2), execution sub-phases,
a complete handoff lifecycle, mechanical verification gates (6 optional
checks), config file support, E2E test infrastructure, CLI polish
(doctor, version, --verbose, error formatter), and 188 app-level tests.
The implementation lives on `integration/virgil-cli`.

### Commit History (integration branch)

```
(pending) feat: Teams + AzDO providers, adv. gates, E2E tests, CLI polish
1d5c0dc feat: verification gates + config file + init command
5755a24 docs: update for Confluence, GitHub Org, execution sub-phases
f6167a3 feat: wire Confluence + GitHub Org providers + phase command
e713d24 feat: GitHub Org provider (members via REST API)
2aff924 feat: execution sub-phases (pre-phase → red → green → refactor → verify)
2b1dab8 feat: Confluence dogma provider (REST API, Basic auth)
e763d67 docs: update for context-brief, JSON output, and final test counts
c7e2186 feat: --json output flag for status and brief commands
79c9fea feat: context command uses classified brief items
5f57b7c feat: wire brief into handoff context assembly
4c2fd10 feat: brief query service + drift detection (RAG phase 2)
c33a404 feat: GitHub Wiki dogma provider (git clone strategy)
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

### Handoff-Brief Integration

- `HandoffService.create()` now uses `BriefQueryService` instead of raw dogma snapshots
- CONTEXT.md shows kind-grouped, privacy-safe brief items with source refs
- Drift warning when brief is stale
- Auto-generates brief if `.virgil/brief.json` missing

### Context Command Brief Integration

- `virgil context` shows classified brief items instead of raw file listings
- Same auto-generate and drift warning pattern as handoff

### JSON Output (CLI Polish)

- `virgil status --json` -- providers + capabilities as structured JSON
- `virgil brief --json` -- Brief object (generate mode) or BriefQueryResult (query mode)
- Enables scriptability by other tools and agents

### Confluence Dogma Provider

- `ConfluenceService`: SnapshotProviderPort<DogmaDocument[]> via Confluence REST API
- `ConfluenceHttpClientService`: native fetch, Basic auth (email:apiToken), rate-limit retry
- Config: VIRGIL_CONFLUENCE_SITE_URL, VIRGIL_CONFLUENCE_EMAIL, VIRGIL_CONFLUENCE_API_TOKEN, VIRGIL_CONFLUENCE_SPACE_KEY (optional)
- Semantic refs: `dogma://confluence/{page-id}` → resolves to Confluence web URL
- HTML-to-text content extraction from Confluence storage format
- Health check via `/rest/api/user/current`

### GitHub Org Provider

- `GithubOrgService`: SnapshotProviderPort<OrgSnapshot> via GitHub REST API
- `GithubOrgHttpClientService`: native fetch, Bearer auth, rate-limit + retry
- Config: VIRGIL_GITHUB_ORG_TOKEN (falls back to VIRGIL_GITHUB_TOKEN), VIRGIL_GITHUB_ORG_NAME, VIRGIL_GITHUB_ORG_API_URL (optional)
- Semantic refs: `org://github/{login}` → resolves to GitHub profile URL
- Maps org members to OrgMember (ref, name, role, team)

### Execution Sub-Phases

- `ExecutionTrackerService`: phase tracking within `execution` state
- Phases: `pre-phase` → `red` → `green` → `refactor` → `verify` (cycles back to `red`)
- Persisted in META.json as `executionPhase` field
- Ledger entries for each phase transition
- CLI: `virgil handoff phase <id> [target]`
- Does not change the top-level 5-state machine

### Mechanical Verification Gates

- 3 optional audit checks: `coverage` (statement coverage vs threshold), `npm-audit` (critical/high CVE count), `type-check` (`tsc --noEmit`)
- Gated by env vars: `VIRGIL_COVERAGE_THRESHOLD`, `VIRGIL_MAX_CRITICAL_CVES`, `VIRGIL_TYPE_CHECK`
- Graceful degradation: tool unavailable → check passes with "skipped" message
- Gap type mappings: coverage→TESTING, npm-audit→COMPLIANCE, type-check→CONTRACT
- `@Optional()` injection: backward-compatible, no module changes needed

### CLI Config File

- `.virgilrc.yaml` (or `.virgilrc.json`) loaded before NestJS bootstrap
- Flat key-value format using same env var names
- Security: only `VIRGIL_`-prefixed keys applied
- Env vars always take precedence over file values
- `virgil init` generates template with all known vars commented out
- Config files added to `.gitignore` (may contain secrets)

### Microsoft Teams Provider

- `TeamsReaderService`: SnapshotProviderPort<ChatSnapshot> via MS Graph API
- `TeamsHttpClientService`: native fetch, Bearer auth, rate-limit retry
- Config: VIRGIL_TEAMS_TOKEN, VIRGIL_TEAMS_TEAM_ID, VIRGIL_TEAMS_CHANNEL_IDS
- Semantic refs: `chat://teams/{channelId}/{messageId}`
- Reuses ChatSnapshot/ChatChannel/ChatMessage types from Slack

### Azure DevOps Provider

- `AzdoReaderService`: SnapshotProviderPort<AzdoWorkItemSnapshot> via Azure DevOps REST API
- `AzdoHttpClientService`: native fetch, Basic auth (PAT), api-version=7.1, rate-limit retry
- Config: VIRGIL_AZDO_ORG_URL, VIRGIL_AZDO_PROJECT, VIRGIL_AZDO_PAT
- WIQL POST query for work item discovery, batch GET for details
- Semantic refs: `ticket://azdo/{workItemId}`

### Advanced Verification Gates

- 3 additional optional audit checks: `complexity` (cyclomatic via eslint), `circular-deps` (via madge), `outdated-deps` (major-version via npm outdated)
- Gated by env vars: VIRGIL_MAX_COMPLEXITY, VIRGIL_CHECK_CIRCULAR_DEPS, VIRGIL_MAX_MAJOR_OUTDATED
- Total: 6 verification gates + 6 guardrail checks = 12 audit checks

### E2E Test Infrastructure

- Shared `stubFetch`/`stubFetchSequence` helpers (e2e-helpers.ts)
- Multi-provider integration tests (registration, isolation, ref dispatch)
- CLI command E2E tests (status, handoff create, audit, brief)
- Full handoff lifecycle tests (create → delivered, re-delegation, break-glass)

### CLI Polish

- `virgil doctor`: system health check (Node.js, config, providers, verification tools)
- `virgil version`: package version output
- `--verbose` flag on status, context, audit for diagnostic output
- `formatError()`: actionable error messages with hints for ConfigurationError and ProviderError

### App-Level Test Suite

- 23 test files, 188 scenarios
- Zero mocks -- full NestJS application bootstrap
- Covers: registry ops, context flow, handoff lifecycle, audit checks, reactive events, proactive insights, GitHub Issues, brief generation, GitHub Wiki, brief query + drift, JSON output, Confluence, execution sub-phases, GitHub Org, verification gates, config file, init command, Teams, AzDO, CLI polish, E2E multi-provider, E2E CLI commands, E2E handoff lifecycle
- Filterable by test name via Vitest

## Next Steps (Priority Order)

1. **Additional providers** -- extend the provider plugin pattern to more
   backends:
   - Linear (ticket kind)
   - Notion (dogma kind)

2. **Advanced verification gates** -- extend audit checks with:
   - Mutation score (Stryker)
   - CRAP index (complexity × coverage)

3. **Real-backend E2E tests** -- exercise real provider backends
   (Jira, Slack, Confluence, GitHub) with test credentials in a
   controlled environment (Docker Compose or test accounts).

4. **Shell completions** -- generate bash/zsh completions for all
   commands and options.

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
