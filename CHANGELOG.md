# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-08-31

### Added

#### CLI Commands (17 total)

- `virgil status` — System health and provider connectivity
- `virgil context [refs...]` — Resolve semantic refs across providers
- `virgil handoff create` — Generate structured handoff from provider context
- `virgil handoff list` — List existing handoffs
- `virgil handoff show <id>` — Display handoff details
- `virgil handoff transition <id> <state>` — Lifecycle state transition
- `virgil handoff phase <id> [target]` — Advance execution sub-phase
- `virgil audit <id>` — Run mechanical audit checks against guardrails
- `virgil brief` — Generate or query the brief (RAG pipeline)
- `virgil watch` — Start reactive polling loop
- `virgil insights` — Run proactive analyzers
- `virgil ledger [--handoff <id>]` — Query append-only event log
- `virgil write` — Create or update planning documents
- `virgil transition` — Transition task lifecycle status
- `virgil init` — Generate `.virgilrc.yaml` config template
- `virgil doctor` — System health check
- `virgil version` — Print CLI version

#### Providers (11 backends, 5 kinds)

- **Dogma**: Local filesystem, GitHub Wiki, Confluence
- **Ticket**: Jira, GitHub Issues, Azure DevOps
- **Org**: Local directory, GitHub Organization
- **Source Code**: Local git repository
- **Chat**: Slack, Microsoft Teams

#### Core Systems

- Handoff lifecycle state machine (draft → handoff → execution → verify → delivered)
- Execution sub-phases (pre-phase → red → green → refactor → verify)
- Planning service with JSON frontmatter and SHA-256 content digests
- Task lifecycle state machine (backlog → refined → active → done → released)
- Append-only ledger (JSONL event log)
- Brief generation pipeline (RAG: extract → classify → summarize → persist)
- Brief query service with drift detection
- Audit service with 6 mandatory checks + 6 optional verification gates
- Break-glass mechanism with 72-hour post-hoc certification
- Semantic ref resolution (`{kind}://{backend}/{id}`)
- Reactive polling loop (watch command)
- Proactive analyzers (stale tickets, uncommitted changes)
- Provider health checks and capability registry

#### Architecture

- Hexagonal architecture with `ContextProviderPort` adapter contract
- NestJS standalone application with nest-commander
- Three-layer governance: Principia → Dogma → Runtime
- Constitutional principia (sealed, amended 2026-08-31 for CLI alignment)
- Zero-mock app-level testing (215 tests, Vitest)

### Non-Goals for V1

- Method Pack system (Scrum/Kanban/Shape Up abstraction)
- MCP server mode (CLI-only by design)
- GUI / web interface
- codebaseMemory (structural code graph)
- Mutation testing / CRAP scoring in audit gates
- HostAdapter abstraction (multi-host pluggability)
