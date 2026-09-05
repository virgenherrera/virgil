# Virgil -- Project Identity

## Menú

- [What Virgil Is](#what-virgil-is)
- [How Virgil Works](#how-virgil-works)
- [What Virgil Is Not](#what-virgil-is-not)
- [Core Principles](#core-principles)
- [Current Command Surface](#current-command-surface)
- [Implementation Status](#implementation-status)
- [Project On-Disk Layout](#project-on-disk-layout)
- [Terminology](#terminology)
- [Identity Scenarios](#identity-scenarios)
- [Exploratory Ideas (Not Committed Scope)](#exploratory-ideas-not-committed-scope)
- [Open Questions](#open-questions)

---

## What Virgil Is

Virgil is a deterministic, cached, memoized RAG knowledge service with a CLI/TUI interface. Virgil handles the R and A of RAG (retrieval and augmentation of agent context); the G (generation) belongs entirely to the consuming agent -- Virgil serves indexed knowledge, it does not generate. AI agents query Virgil for project context instead of reading files, crawling repositories, or navigating collaboration tools directly. The TUI provides the setup and management surface for humans; the query CLI provides the runtime interface for agents. Same query produces the same response until the underlying knowledge changes. Built with NestJS and nest-commander. Local-first, provider-agnostic.

[↑ Menú](#menú)

---

## How Virgil Works

Virgil exposes two interfaces for two audiences:

1. **Setup (TUI/CLI for humans)**: initialise a workspace, register knowledge sources (local filesystem paths, code repositories, RPA-accessed tools such as Confluence, Jira, Slack, and Teams), and configure governance (budget tracking and audit).
2. **Query (CLI for agents)**: `virgil knowledge search <query>` returns structured results in TOON syntax (see [Terminology](#terminology)) with JSON as fallback. Deterministic, cached, memoized. See [Core Principles: Deterministic](#core-principles).

```
Orchestrator Agent
  +-- Sub-agent needs project context
        +-- virgil knowledge search "auth module"
              +-- Virgil returns TOON-formatted knowledge (deterministic)
                    +-- Sub-agent works with real knowledge, not hallucination
```

TOON response example:

```toon
module:
  name: auth
  path: packages/auth
  stack: TypeScript, NestJS

dependencies[3]{package,version,scope}:
  @nestjs/passport,10.0.3,runtime
  passport-jwt,4.0.1,runtime
  bcrypt,5.1.1,runtime

owners[2]{role,name}:
  tech-lead,Jane Doe
  maintainer,John Smith
```

[↑ Menú](#menú)

---

## What Virgil Is Not

- **Not an AI agent.** Virgil does not reason, decide, or orchestrate. It is infrastructure, not intelligence.
- **Not a copilot.** Virgil does not generate code or suggestions. It serves indexed knowledge.
- **Not an orchestrator.** Virgil does not delegate work or manage agents. Agents consume Virgil; Virgil does not consume agents.
- **Not an LLM or model.** Providers may be used during knowledge ingestion only (see [Core Principles](#core-principles)).
- **Not a hosted/cloud service or SaaS.** Everything persists locally. Provider calls during knowledge ingestion are the only network traffic, and are opt-in (see [Core Principles: Local-first](#core-principles)).
- **Not an IDE plugin (yet).** Virgil operates as a standalone CLI/TUI. IDE integration is not current scope.
- **Not the Local Minions probe system.** The probe system (`pnpm probe`) is internal development tooling for this repository's AI-assisted workflow. It is unrelated to end-user features.
- **Not defined by `ideas-de-uso-tui.md`.** That file is informal brainstorming, not committed scope. See [Exploratory Ideas](#exploratory-ideas-not-committed-scope).
- **Not the AGENTS.md development process contract.** `AGENTS.md` governs how agents work **on** Virgil, not what Virgil does for its consumers.

[↑ Menú](#menú)

---

## Core Principles

- **Deterministic.** Same query produces the same result until the underlying knowledge changes. No randomness, no LLM inference in the response path.
- **Local-first.** All data lives on the developer's machine. No telemetry, no cloud sync unless the user explicitly configures a provider for ingestion.
- **Provider-agnostic.** Any agent framework can call `virgil` as a CLI tool. Virgil treats AI providers as pluggable adapters used only during ingestion.
- **Cached and memoized.** No redundant computation. Repeated queries hit the cache.
- **Auditable and governed.** Budget tracking and audit trails are first-class features, not afterthoughts.
- **Agent-consumable.** Responses default to TOON syntax (see [Terminology](#terminology)). The query interface is designed for programmatic consumption, not human browsing.

[↑ Menú](#menú)

---

## Current Command Surface

| Command | Domain | Description | Status |
| --- | --- | --- | --- |
| `init` | Setup | Initialise a Virgil workspace in the current directory. | Scaffold |
| `workspace` | Workspace | Manage Virgil workspaces (create, list, select, show, delete). | Scaffold |
| `repo` | Repository | Manage workspace repositories (add, list, show, remove). | Scaffold |
| `provider` | Provider | Manage workspace providers (add, list, test, remove). | Scaffold |
| `knowledge` | Knowledge | Search, inspect, and maintain the knowledge base. | Scaffold |
| `governance` | Governance | Governance commands (budget, audit). | Scaffold |
| `version` | Meta | Print the Virgil TUI version and exit. | Implemented |

**Status key:**

- **Implemented** -- The command delegates to a real service that performs its documented behavior.
- **Scaffold** -- The command surface, validation schemas, and DI wiring are in place, but the service layer returns fixture data via hardcoded responses or the TBD stub utility (`printTbdStub`).

[↑ Menú](#menú)

---

## Implementation Status

Virgil is currently in scaffold phase. Most command handlers return fixture data -- either hardcoded responses from service methods or explicit TBD stubs via the `printTbdStub` utility. The command surface, Zod validation schemas, NestJS module wiring, and dependency injection graph are production-grade and fully tested. The service layer behind them -- persistent storage, knowledge source registration, knowledge indexing, and deterministic query resolution -- is being built incrementally. The `version` command is the sole fully implemented command, reading the actual package version at runtime.

[↑ Menú](#menú)

---

## Project On-Disk Layout

When a workspace is initialised, Virgil creates a `.virgil/` directory at the workspace root:

    .virgil/
      db/              -- SQLite and vector store for indexed knowledge
      cache/           -- Query result cache (memoization layer)
      plugins/         -- Custom extensions (empty by default, reserved for future use)
      providers/       -- Custom knowledge source adapters
    virgil.json        -- Workspace configuration (sources, governance rules, project metadata)

This layout is unrelated to the `virgil.json` file used by the Local Minions probe system, which persists hardware ceiling data for the development workflow. The probe's `virgil.json` lives at the repository root; the workspace's `virgil.json` lives inside the project being managed by Virgil.

[↑ Menú](#menú)

---

## Terminology

- **Workspace** -- A named, self-contained environment that groups repositories, knowledge sources, providers, and governance rules under a single slug. A developer may have multiple workspaces for different projects or clients.
- **Knowledge Source** -- An origin from which Virgil extracts and indexes knowledge. Types: local filesystem path (e.g. synced OneDrive/Google Drive folder), code repository, RPA-accessed tool (Confluence, Jira, Slack, Teams). Each source has an access mode (local, API, RPA, or platform app integration such as Slack App).
- **Knowledge Base** -- The local indexed store that Virgil queries deterministically. Fed by knowledge sources. Supports search, stats, compaction, and CRUD operations.
- **Provider** -- An external AI service endpoint (LLM API). Used during knowledge ingestion and indexing, NOT during query response. Providers are typed and testable but vendor-neutral by design.
- **TOON Syntax** -- Token-Optimized Object Notation. A compact structured format designed to minimize token consumption when serving context to AI agents. Uses YAML-like `key: value` for objects and CSV with typed headers (`name[count]{col1,col2}:`) for arrays. Default response format for all Virgil queries. JSON is available as fallback via `--json` flag.
- **Governance** -- Budget tracking and audit logging for AI provider usage during knowledge ingestion within a workspace. Enables developers and teams to monitor token consumption and enforce spending limits (see [Core Principles: Deterministic](#core-principles)).
- **Handoff** -- A bounded, auditable work assignment used in the repository's development process. Handoffs are a development methodology concept (see `AGENTS.md`), not a Virgil product feature.

[↑ Menú](#menú)

---

## Identity Scenarios

### Project Discovery -- Self-Contained Monorepo

```gherkin
Feature: Project Discovery -- Self-Contained Monorepo

  Scenario: Initialize and index a monorepo with no prior tooling
    Given a monorepo with source code and no existing AI tooling configuration
      And the development environment uses Codex as the AI agent with gentle-ai tools installed
    When the developer runs "virgil init" in the repository root
    Then Virgil creates a workspace anchored to that directory
      And Virgil persists the workspace in its local database

    When the developer runs "virgil repo add ."
    Then Virgil registers the repository in the active workspace
      And Virgil runs project discovery via deterministic pattern-matching (manifest files, file extensions, directory conventions)
      And Virgil indexes the discovered project structure in the local knowledge base
      And the repository metadata is queryable through "virgil knowledge search"
```

### Enterprise Project Onboarding -- Multi-Source Knowledge

```gherkin
Feature: Enterprise Project Onboarding -- Multi-Source Knowledge

  Scenario: Developer joins a project and registers all knowledge sources
    Given a developer assigned to an enterprise project
      And the development environment uses Claude as the AI agent with gentle-ai tools installed
    When the developer runs "virgil init" in their working directory
    Then Virgil creates a workspace for the project

    When the developer registers a knowledge source from a local OneDrive sync folder
      And the developer registers a knowledge source from a local Google Drive sync folder
    Then both sources are indexed in the workspace knowledge base

    When the developer registers Confluence as a knowledge source with RPA access mode
      And the developer registers Jira as a knowledge source with RPA access mode
      And the developer registers two Slack channels as knowledge sources with RPA access mode
      And the developer registers Teams as a knowledge source with RPA access mode
    Then all sources are registered with their access mode (RPA)
      And Virgil can extract knowledge from each on demand

    When the developer adds 5 local repository paths
    Then all repositories are registered in the workspace
      And Virgil detects that gh CLI is available for GitHub metadata enrichment
```

### Enterprise Onboarding -- Polyglot Monorepo with Access Mode Migration

```gherkin
Feature: Enterprise Onboarding -- Polyglot Monorepo with Access Mode Migration

  Scenario: Developer onboards to a large polyglot project with mixed access modes
    Given a developer assigned to an enterprise project with a giant monorepo
      And the development environment uses Kiro IDE as the AI agent with gentle-ai tools installed
    When the developer runs "virgil init" in their working directory
    Then Virgil creates a workspace for the project

    # Knowledge source -- cloud document storage
    When the developer registers a knowledge source from a local Google Drive sync folder
    Then the source is indexed in the workspace knowledge base

    # Project management -- API mode
    When the developer registers Monday.com as a knowledge source with API access mode
    Then Virgil connects via API keys and indexes project board data

    # Communication -- access mode migration
    When the developer registers a Slack channel as a knowledge source with RPA access mode
    Then the source is registered with RPA access
    When the developer later migrates the Slack source to Slack App access mode
    Then Virgil updates the access mode without losing previously indexed knowledge
      And subsequent extractions use the Slack App integration instead of RPA

    # Giant polyglot monorepo
    When the developer adds a monorepo containing Clojure, AWS IaC, PHP, AngularJS, and Svelte applications
    Then Virgil registers the repository in the workspace
      And Virgil detects multiple tech stacks within the monorepo via deterministic pattern-matching (manifest files, file extensions, directory conventions)
      And Virgil indexes each application boundary independently
      And Virgil detects that gh CLI is available for GitHub metadata enrichment

    # Team structure
    When the developer registers the team org chart (roles, members, responsibilities)
    Then the org chart is queryable as workspace knowledge
      And agents can resolve "who owns module X" through Virgil queries
```

### Runtime Agent Workflow -- Context Resolution via Query

```gherkin
Feature: Runtime Agent Workflow -- Context Resolution via Query

  Scenario: Agent uses Virgil to scope work and produce a handoff
    Given a project with Virgil initialized and knowledge sources indexed
      And the development environment uses any AI agent with gentle-ai tools installed
      And Virgil CLI is globally installed and knows which database serves this project

    # Human initiates work
    When the developer tells their agent "we got assigned US-123, can we inject the handoff?"
    Then the agent queries Virgil for user story context
      And the agent runs "virgil knowledge search 'US-123 requirements'"
      And Virgil returns deterministic TOON-formatted context from the indexed sources

    # Agent scopes the work via Virgil queries (never reads files directly)
    When the agent needs to understand the affected architecture
    Then the agent runs "virgil knowledge search 'auth module architecture'"
      And Virgil returns the relevant project structure and ownership
      And the agent identifies which repository or repositories are affected

    # Agent produces the handoff
    When the agent has enough context from Virgil queries
    Then the agent writes a handoff scoped to the affected repositories
      And the handoff references Virgil queries for runtime context resolution
      And the agent does NOT embed raw file contents in the handoff

    # Human hands off to implementation
    When the developer opens a terminal in the target repository
      And tells their agent "read ./handoff and orchestrate it"
    Then the implementing agent reads the handoff
      And the implementing agent resolves context through Virgil queries, never reading files a priori
      And Virgil CLI resolves the correct project database automatically from the working directory
      And the agent implements based on deterministic knowledge from Virgil
```

[↑ Menú](#menú)

---

## Exploratory Ideas (Not Committed Scope)

The following ideas appear in `ideas-de-uso-tui.md` and represent informal brainstorming. They carry no scope authority and must not be built toward without explicit owner direction.

- **Meeting assistant mode** -- Quick question-and-answer interactions without entering a full workflow, similar to ad-hoc conversational queries.
- **Grooming/refinement mode** -- Structured sessions for refining user stories, producing dated Markdown artifacts with story sections and follow-up questions.
- **Org-chart/role tagging** -- Tagging team roles (TL, SM, PO, QA, Dev) within a workspace, either as a dedicated CRUD surface or as a knowledge entry type.
- **RPA browser automation implementation** -- RPA as a knowledge source access mode is a committed concept (see [Terminology](#terminology)). The specific browser-automation implementation for navigating authenticated sessions is not yet committed.
- **Distribution as Node SEA** -- Packaging the Virgil CLI as a single-executable application via Node SEA for zero-dependency distribution.

These ideas carry no scope authority. Do not build toward them without explicit owner direction.

[↑ Menú](#menú)

---

## Open Questions

These questions require explicit owner decision. Agents must not resolve them unilaterally.

- **Taxonomy evolution.** The current command surface uses `provider` for AI endpoints, but the enterprise onboarding scenarios reveal a need for a `source` or `connector` concept (knowledge origins with access modes). The relationship between `provider`, `knowledge source`, and `knowledge base` needs formalization.
- **Access mode migration.** Scenario 3 shows a source changing from RPA to Slack App without losing indexed knowledge. This implies the access mode is a mutable property of the source, not part of the knowledge identity.
- **Polyglot monorepo discovery.** Scenario 3 shows a single repo with Clojure, AWS IaC, PHP, AngularJS, and Svelte. Virgil must detect application boundaries within a monorepo, not assume one repo equals one tech stack.
- **Distribution model.** Node SEA binary is the target for end-user distribution (TBD).

[↑ Menú](#menú)
