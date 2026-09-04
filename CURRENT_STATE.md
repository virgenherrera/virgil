# Virgil — Current State

> **Snapshot date:** 2026-09-04
> **Branch:** development
> **Normative policy:** [`AGENTS.md`](./AGENTS.md)
> **Architectural seed:** [`VIRGIL_HANDOFF_SEED.md`](./VIRGIL_HANDOFF_SEED.md)

## Menú

- [Product Vision](#product-vision)
- [Architecture](#architecture)
- [Packages](#packages)
- [Handoff Status](#handoff-status)
- [Product Capabilities](#product-capabilities)
- [Development Infrastructure](#development-infrastructure)
- [Tool Surface](#tool-surface)
- [Gaps and Open Questions](#gaps-and-open-questions)

---

## Product Vision

Build a globally usable Node.js CLI that acts as a **local developer-agent control plane with incremental shared knowledge**.

Target UX:

```text
virgil work <issue-id>
```

Flow:

```text
Assigned Issue → Orchestrator → Progressive Discovery
  ├── Issue Provider
  ├── Knowledge Providers
  ├── Repo Providers
  └── Chat Providers
→ Shared Local Knowledge / RAG
→ Structured Handoff
→ Implementation Agent(s)
→ Verification Agent
→ Suggested issue/chat updates
```

[↑ Menú](#menú)

---

## Architecture

| Attribute | Value |
|-----------|-------|
| Runtime | Node.js 24.16.0 |
| Language | TypeScript strict |
| Framework | NestJS 12 + nest-commander |
| ORM | Drizzle ORM (validated by POC-00) |
| Database | SQLite via better-sqlite3 |
| Validation | Zod |
| Package manager | pnpm 11.24.0 |
| Distribution | Node SEA binary (validated by POC-00) |
| Monorepo | pnpm workspaces with catalog protocol |

[↑ Menú](#menú)

---

## Packages

| Package | Purpose | Status |
|---------|---------|--------|
| `packages/cli` | Main CLI product — nest-commander commands, core modules | Active development |
| `packages/tools` | Probe/Lethe — local model pre-tokenization, context reduction | Implemented, 99% coverage |
| `packages/pw-cdp` | Playwright CDP browser automation adapters | Implemented |
| `packages/local-indexers` | Code/file indexing providers | Implemented |

[↑ Menú](#menú)

---

## Handoff Status

### Wave 0 — Complete

| Handoff | Name | Status |
|---------|------|--------|
| H00 | Toolchain Bootstrap | Done |

### Wave 1 — Complete

| Handoff | Name | Status |
|---------|------|--------|
| H01 | Repository Bootstrap | Done |

### Wave 2 — Complete

| Handoff | Name | Status |
|---------|------|--------|
| H02 | CLI Runtime SEA | Done |
| H03 | Workspace Configuration | Done |
| H04 | Provider Contracts | Done |
| H06 | Knowledge Persistence | Done |
| H09 | Handoff Protocol | Done |
| H16 | PW CDP Adapters | Done |

### Wave 3a — Complete (Core Product)

| Handoff | Name | Status |
|---------|------|--------|
| H05 | Local Repo Provider (+ CodeGraph) | Done |
| H07 | RAG Core Retrieval | Done |
| H10 | Product Orchestration | Done |
| H17 | Local Indexers | Done |

### Wave 3b — Complete (Remote Providers)

| Handoff | Name | Status |
|---------|------|--------|
| H12 | Remote Issue Provider | Done |
| H14 | Chat Provider | Done |

### Wave 4 — Complete

| Handoff | Name | Status |
|---------|------|--------|
| H08 | Progressive Discovery | Done |
| H11 | Agent Governance | Done |
| H13 | Remote Knowledge Provider | Done |
| H15 | Knowledge Lifecycle | Done |

### Wave 5 — Pending

| Handoff | Name | Status |
|---------|------|--------|
| H18 | CI/CD Delivery | Not started |
| H19 | Lethe (Multi-Tier Orchestration) | Partial — packages/tools probe implemented, 99% coverage. Phase 2 LLM items and Phase 4 test matrix pending |

### Post-Seed

| Handoff | Name | Status |
|---------|------|--------|
| H20 | Eunoe (Dependency Bump Pipeline) | Complete — merged to development (8f3c495) |
| H21 | Matelda (TUI/CLI Command Surface) | Superseded by H22 |
| H22 | Virgil TUI (apps/virgil Command Surface) | Handoff complete — 60 BDD IDs, 5 GAP IDs, dual-mode CLI/TUI, Zod contractual validation, app-level integration tests. Implementation pending. |

[↑ Menú](#menú)

---

## Product Capabilities

Capabilities defined by completed handoffs. Each maps to NestJS services in `packages/cli`:

| Capability | Source | Description |
|-----------|--------|-------------|
| Workspaces | H03 | Create, select, list, configure provider registration, multi-workspace isolation |
| Provider Contracts | H04 | Stable interfaces for Issue, Knowledge, Repo, Chat providers |
| Local Repo | H05 | File discovery, Git-aware metadata, CodeGraph integration, 1..N repos |
| Knowledge Persistence | H06 | SQLite storage, normalized artifacts, content identity/hash, provenance, relationships |
| RAG Retrieval | H07 | Hybrid retrieval (lexical + semantic), chunking, embeddings, query contract |
| Progressive Discovery | H08 | Issue-driven, evidence-preserving, no bulk crawling |
| Handoff Protocol | H09 | Zod-validated, machine-readable implementation handoffs |
| Product Orchestration | H10 | Multi-agent workflows, bounded task envelopes, vendor-neutral |
| Agent Governance | H11 | Tier routing (worker/reasoning/pro), budget governance, escalation |
| Remote Issue Provider | H12 | First remote issue adapter with authentication boundary |
| Remote Knowledge Provider | H13 | Remote document provider without broad ingestion |
| Chat Provider | H14 | Targeted chat discovery, not bulk archival |
| Knowledge Lifecycle | H15 | Hot/warm/cold state, compaction, rehydration, storage metrics |
| PW CDP Adapters | H16 | Browser automation for providers requiring interactive auth |
| Local Indexers | H17 | Code/file indexing for local filesystem sources |
| Lethe (partial) | H19 | Context reduction via pre-tokenization with local models (tree-sitter structural extraction, JSON schema inference, directory manifests) |
| Eunoe | H20 | Automated dependency bumping: security sandwich pattern, NCU doctor mode, CI weekly cron |

[↑ Menú](#menú)

---

## Development Infrastructure

| Component | Detail |
|-----------|--------|
| Testing | Strict TDD — app-level integration tests only, 97%+ coverage threshold |
| Static gates | ESLint, Prettier, TypeScript strict, exact dependency validation, security audit |
| Hooks | Husky pre-commit (lint, format, typecheck) |
| CI | GitHub Actions (authoritative) |
| Toolchain | gentle-ai 2.5.0 (receipt-driven development, agent config, skills) |
| Commits | Conventional Commits, lowercase, imperative, no AI attribution |
| Dependencies | Exact versions only (no ^, ~, >=), pnpm catalog protocol |
| Bump pipeline | Weekly cron (Mondays 9:00 UTC) + manual dispatch, auto-PR to development |

[↑ Menú](#menú)

---

## Tool Surface

### Current: CLI Commands (nest-commander)

The NestJS CLI exposes commands through nest-commander. The exact command surface depends on which handoff modules have been wired into the CLI entry point.

### Current: Go Binary MCP Server (being dropped)

| Tool | Description |
|------|-------------|
| `virgil_init` | Initialize a Virgil-managed project |
| `virgil_status` | Show project state |
| `virgil_write` | Create or update a planning document |
| `virgil_transition` | Transition a task through lifecycle |

The Go binary at `/opt/homebrew/bin/virgil` (v0.3.0-rc.10) provides 4 methodology-only MCP tools. It is being dropped in favor of the NestJS product on the development branch.

### Gap: NestJS MCP Server

The NestJS CLI has zero MCP tools. All product capabilities (H03–H15) exist as NestJS services but are not exposed through the MCP protocol. This is the primary tool-surface gap.

[↑ Menú](#menú)

---

## Gaps and Open Questions

1. **CLI command surface and TUI.** H22 (Virgil TUI) fully specifies the apps/virgil command surface with 60 BDD IDs. Implementation pending — commands exist as TBD stubs with GAP IDs until services are integrated.

2. **apps/virgil → packages/cli migration.** apps/virgil is a clean-break new package with zero packages/cli dependency in Phase 1. Future phases will integrate existing services and eventually replace packages/cli as the sole CLI entry point.

3. **PersistenceModule architecture (GAP-001).** The `:memory:` SQLite hack in AppModule needs proper test infrastructure — app-level integration tests with real temp databases, not in-memory workarounds.

5. **Team/org roles.** No handoff covers team structure (QA, Dev, TL, SM, PO). Could be a Knowledge type or a dedicated CRUD.

6. **Meeting assistant.** No handoff covers interactive Q&A sessions (equivalent to Claude's /btw).

7. **Grooming/refinement mode.** No handoff covers structured user story grooming with dated output paths.

8. **RPA flows.** H16 (PW CDP) provides browser automation infrastructure, but no specific provider flows for Atlassian OTP, SSO, or similar interactive auth scenarios are documented as ready.

9. **H19 completion.** Phase 2 (LLM delegate integration for rawInput/phaseOutput) and Phase 4 (test matrix) are pending.

10. **H18 CI/CD.** Not started. SEA artifact generation, platform matrix, and release automation are undefined.

[↑ Menú](#menú)
