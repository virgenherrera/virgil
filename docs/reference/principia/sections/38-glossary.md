<!-- Virgil Principia
section_id: "glossary"
title: "Glossary"
source: "principia/constitution.md"
source_lines: [1763, 1814]
layer: reference
constitutional: true
actors: []
glossary_terms: [AGENTS.md, AuditService, Binding Layer, Break-glass, ContextProviderPort, Core, FastForward, GapType, HandoffStateMachine, InsightEngine, Ledger, LedgerService, MIM, Method Pack, PlanningService, Provider, ProviderRegistry, CapabilityRegistry, SemanticRef, TransitionCommand, WriteCommand]
depends_on: []
referenced_by: []
keywords:
  - glossary
  - terms
  - definitions
  - implemented
  - architectural provision
editorial_additions: [context_paragraph]
-->

> **Context:** This glossary collects the canonical definitions of the terms used throughout the Principia. Terms marked **[Implemented]** exist in the runtime. Terms marked **[V2+ aspirational]** are defined in the Principia but not required for V1. The constitution's glossary (amended 2026-08-31) now properly describes all terms with their current status and V2+ annotations; the "Superseded" section below is retained for historical reference.

## Glossary

### Implemented terms

| Term | Definition |
|---------|-----------|
| AGENTS.md | Discoverability file published by Virgil in the consuming project following the Open Agentic Standard. Contains operational rules for any compatible agent (section 1) |
| AuditService | Service that runs 6 mechanical checks (scope, forbidden, file-count, line-count, conflict-markers, agent-output) against handoff guardrails in META.json. Produces AUDIT_REPORT.json and FEEDBACK.md (section 11d) |
| Break-glass | Emergency override that bypasses transition preconditions with MIM authority and mandatory post-hoc certification within 72 hours. Recorded in the Ledger (section 11e) |
| CapabilityRegistry | Service that tracks provider status (configured-unverified → available / degraded). Used by `virgil status` to report connectivity (section 5) |
| FastForward | Certainty gradient (FF-1 to FF-4) that allows compressing planning ceremony when observable evidence supports it (section 3a) |
| GapType | Classification of audit failures: `IMPLEMENTATION` (scope/guardrail violations), `TESTING` (test coverage gaps), `CONTRACT` (conflict markers), `COMPLIANCE` (missing agent output). Routes rejection recommendations (section 11e) |
| HandoffStateMachine | Service enforcing the 5-state lifecycle (draft → handoff → execution → verify → delivered) with preconditions per transition. Supports break-glass override (section 3a, 11e) |
| InsightEngine | Service that runs pluggable analyzers (StaleTicketAnalyzer, UncommittedChangesAnalyzer) to surface proactive insights sorted by severity (section 12) |
| Ledger | Append-only JSONL record at `.virgil/ledger.jsonl`. Records 4 event types: created, transition, audit, break-glass. Filterable by handoff ID |
| LedgerService | Service implementing the Ledger. Append-only writes, no mutations, no deletions (section 11f) |
| MIM | Mind in the Machine: human with final authority over the project. Approves, rejects, breaks ties. Its veto is non-negotiable (vocabulary) |
| PlanningGapDetected | Escalation signal when execution detects a planning defect. Triggers re-planning |
| Provider | Plugin that implements `ContextProviderPort` to supply context from an external source. Self-registers on module initialization. Uses `registerIfConfigured()` for graceful degradation (section 5) |
| ProviderRegistry | Service providing runtime lookup of providers by kind or capability ID. Used by HandoffService, RefResolverService, and PollingLoopService (section 5) |
| SemanticRef | URI scheme `{kind}://{backend}/{id}` for cross-provider reference resolution. 5 kinds: dogma, ticket, org, sourcecode, chat. Parsed by `parseRef()`, constructed by `buildRef()`, resolved by `RefResolverService` |
| sourceRevision | Commit SHA stored in `META.json` (`repos[].commitSha`) that identifies the baseline for audit diff comparison (section 7b, 11c) |
| ContextProviderPort | Adapter contract (port interface) for context retrieval from external sources. 11 backends implemented (Confluence, GitHub Org, Azure DevOps, Teams, etc.). Providers self-register on module initialization (section 5) |
| PlanningService | Core service managing the Idea → Requirement → Design → Task ceremony through `virgil write` and `virgil transition` commands (section 3a, 5) |
| WriteCommand | CLI command (`virgil write`) that creates or updates planning documents (idea, requirement, design, task) with provider context injection (section 3a) |
| TransitionCommand | CLI command (`virgil transition`) that changes a handoff's lifecycle status with precondition validation and Ledger recording (section 3a) |
| Core | Virgil's ceremony-agnostic core services (NestJS modules). Contains LedgerService, HandoffService, PlanningService, AuditService, BriefService, ProviderRegistry, RefResolver. Replaces the term "Kernel" (section 5) |

### V2+ aspirational (not required for V1)

| Term | Definition |
|---------|-----------|
| Binding Layer | Three trust levels for test-code links: declared (defined), inferred (derived from evidence), verified (confirmed by mutation testing) (section 7d) |
| bumpDependencies | Three-step maintenance cycle (security fix → update check → security fix) to update exact dependencies without introducing vulnerabilities (section 7h) |
| codebaseMemory | Structural code graph derived from AST. Complements RAG with queries about relationships between code entities. Non-goal for V1 — use CodeGraph as external tool (section 8f) |
| complianceByDesign | Data-shape assertions integrated into development. Covers exclusively technical data controls (section 7g) |
| CRAP score | Change Risk Anti-Patterns — metric combining complexity and coverage to assess change risk. Planned as a future audit gate |
| droppableCode | Code with 0% coverage in appTests. Must be removed or justify its existence with a documented exception (section 7f) |
| Echo System | 5-step deterministic pipeline (Setup → Build → Static → Dynamic → E2E) for execution verification. Planned for CI integration (section 7a) |
| Method Pack | Ceremony layer defining roles, flows and additional gates. Scrum Pack is the reference design; the current runtime is ceremony-agnostic (section 5) |
| mutation domain | Isolation domain where an execution lane operates without interfering with other concurrent lanes. Worktrees are the reference implementation (section 7c, 11c) |
| RAG | Read-optimized projection over deliverables and documentation. Not a source of truth — it is reconstructible. Planned as the next major feature (section 8e) |
| safeToAutoDelete | Subset of droppableCode that meets mechanical safe-removal criteria: no live dependents, no observed execution in N cycles (section 7f) |
| securityAudit | Blocking gate: vulnerability scan over the dependency tree. Planned as a future audit gate (section 7h) |
| Supply Chain Integrity | Three dependency invariants: exact version pinning, security audit as a gate, and bumpDependencies as a controlled update cycle (section 7h) |
| versionPinning | Invariant requiring exact versions (no ranges) for all dependencies. `pnpm-lock.yaml` provides this in the current runtime (section 7h) |
| virgil.json | Project manifest with `$schema` declaring mode (development/consumption), project metadata, and provider configuration per kind. Worktree-aware: each worktree carries its own manifest. Replaces scattered environment variables with a single committable config file |
| watermark | Revision (commit SHA) against which a projection (RAG or codebaseMemory) was last built or synchronized. Certification gate: sourceRevision must be reachable from watermark (section 8c) |

### Historical mapping (pre-CLI vocabulary)

These terms belonged to the original architecture (pre-CLI pivot). The constitution's glossary (amended 2026-08-31) now describes each with its current status and V2+ annotations. This table is retained for traceability.

| Old term | Replaced by | Notes |
|----------|-------------|-------|
| ArtifactRepository | HandoffService + filesystem | Handoff directories under `.virgil/handoffs/` |
| ArtifactStoreAdapter | Provider plugin pattern | Providers implement `ContextProviderPort`; no adapter abstraction needed |
| circuitBreaker | — | Not implemented; delegation failure handling is manual |
| compositeAgent | — | Lane-based multi-agent execution is an architectural provision |
| consumerRag / devRag | — | RAG is an architectural provision; dual projection not yet relevant |
| ContextBrief | Handoff files | TASK.md + CONTEXT.md + ACCEPTANCE_CHECKLIST.md serve the same role |
| ContextCompiler | HandoffService | Compiles provider snapshots into handoff files |
| delegationContract | META.json guardrails | allowedPaths, forbiddenPaths, maxFilesChanged, maxLinesChanged, ffLevel |
| DogmaRef / ProjectRef / RunContext | SemanticRef | Unified `{kind}://{backend}/{id}` URI scheme replaces separate ref types |
| EvidenceIngestion | LedgerService | Append-only JSONL replaces structured ingestion component |
| HostAdapter | CLI commands | Direct CLI invocation replaces host abstraction |
| Kernel | Core services | LedgerService, HandoffService, AuditService, ProviderRegistry |
| PDC | — | Post-delegation coherence check is an architectural provision |
| RetrievalProjection | RefResolverService | Cross-provider ref resolution replaces formal RAG component |
| SM | CLI orchestrator (any agent) | The CLI is the orchestrator; any AI agent can invoke it |
| TPM | AuditService + `virgil handoff list` | Status scanning absorbed by audit and CLI commands |
| TraceabilityGraph | Ledger queries | `virgil ledger --handoff <id>` provides event trail |
