# Virgil — Ownership

## What Virgil IS

Virgil is a **local developer-agent control plane with incremental shared knowledge**.

It is TOOLING — a CLI/TUI product for human engineers and AI agents (Claude Code, Gemini, OpenCode). It does not create handoffs, does not run discovery autonomously, does not orchestrate agents. Agents create handoffs and run work. Virgil provides the tools they need to do it without reading the entire codebase every time.

## The Problem

Modern AI-assisted development has a knowledge fragmentation problem:

- Project docs live in Confluence, Notion, wikis, local markdown
- Code lives in Git repos — sometimes multiple
- Issues live in Jira, Linear, GitHub Issues
- Chat context lives in Slack, Teams
- Team structure lives nowhere consistently
- Access to many of these requires RPA because organizations disable API keys

Every time an AI agent starts work, it reads everything from scratch. It greps, it crawls, it guesses. There is no shared, persistent, queryable knowledge layer between sessions, between agents, or between tools.

## What Virgil Does

1. **Connects sources.** Repos, docs, issues, and chat channels are registered through typed providers (H04 contracts). Some require browser automation (H16 PW-CDP) because Atlassian OTP, SSO, and disabled API keys are the norm, not the exception.

2. **Builds incremental shared knowledge.** Progressive discovery (H08) — not bulk crawling. Knowledge is persisted in SQLite (H06), with lifecycle management (H15: hot/warm/cold) and RAG retrieval (H07: lexical + semantic hybrid).

3. **Pre-processes context.** Lethe (H19) strips noise via deterministic pre-tokenization — tree-sitter structural extraction, JSON schema inference, directory manifests. Saves 30-60% of tokens before anything reaches a cloud model.

4. **Provides high-value handoffs.** Structured, Zod-validated, machine-readable implementation handoffs (H09) that agents can consume directly — no interpretation, no ambiguity.

5. **Eliminates redundant reads.** Agents query Virgil's RAG instead of grepping 50 files. Results are optimized, memoized, and deterministic. One `virgil knowledge search "auth middleware"` returns pre-processed, relevant context.

## The Virgil Loop

```text
Agent receives task
  → virgil knowledge search "relevant context"     # RAG query, not file crawling
  → Agent gets pre-processed, relevant context      # deterministic, cached, memoized
  → Agent implements with full context              # no 50-file grep sessions
  → Agent produces structured handoff (H09)         # if the task warrants it
  → virgil knowledge add ./handoffs/H_XX.md         # knowledge grows incrementally
```

The key insight: Virgil's RAG replaces the "read everything" step that every agent currently does. It is the difference between an architect who knows the building and a contractor who has to survey the site every morning.

## What Ownership Means

Ownership is acting on what you already know without waiting for permission. It is the difference between:

- **No ownership**: "Should I fix this typo?" — waits — gets approval — fixes it
- **Ownership**: fixes the typo, mentions it was fixed, moves on

In the Virgil context, ownership means six things:

### 1. Identity Guard

If you see drift — someone treating Virgil as an agent, adding autonomous behavior, generating handoffs from within Virgil — you correct it. You do not ask if you should correct it. Virgil is tooling. Period.

### 2. Architecture Decisions

If the handoff says "Zod contractual validation" and you are implementing a command without input validation, you add it. You do not ask if validation is needed. The architecture is the architecture.

### 3. Gap Awareness

If you hit a gap — a service that does not exist, a method that is missing — you document it with a GAP ID, implement the TBD stub, and keep moving. You do not stop and ask what to do. The TBD stub pattern exists for exactly this reason.

### 4. Quality Bar

97% coverage threshold. App-level integration tests only — unit tests prohibited. Conventional commits, lowercase, imperative. Exact dependencies, no ranges. These are not suggestions. You hit them or you explain technically why you cannot.

### 5. MIM Respect

The human directs, the agent proposes. Ownership does NOT mean skipping review. It means making decisions within your authority so the review is about strategy, not typos. Commit without MIM review and you failed at ownership, not succeeded.

### 6. Context Efficiency

Before asking the user a question, check if Virgil's own knowledge — RAG, handoffs, AGENTS.md, CURRENT_STATE.md — already has the answer. Ownership means not wasting the human's attention on things you can figure out yourself.

## Quality Ecosystem

Quality is not a step — it is infrastructure. It runs always, by configuration, not by remembering to pass a flag.

### Coverage is config, not a command

Coverage is enabled in `vitest.config.ts` with `enabled: true`. There is no `test:cov` script. Running `pnpm test` always produces coverage and artifacts. If you have to remember to ask for quality, you will forget.

### Artifacts are always generated

Every test run produces machine-readable (JSON) and human-readable (HTML) coverage reports to `artifacts/coverage/`. These are not optional outputs — they are the evidence that the code works. CI consumes the JSON; humans read the HTML.

### Thresholds are enforced, not aspirational

97% coverage on statements, lines, and functions is a hard gate in vitest config. Tests fail if coverage drops below. The threshold is not a goal to aim for — it is a floor that breaks the build.

### One command, zero flags

`pnpm test` does everything: runs tests, collects coverage, generates artifacts, enforces thresholds. No `--coverage`, no `--ci`, no `--artifacts`. If it needs a flag, it belongs in the config file.

### Code review is the echo system

Every change echoes through the quality ecosystem: typecheck catches type errors, tests catch behavior regressions, coverage catches untested paths, thresholds catch coverage decay. Each layer exists because the others are not enough alone. Removing one breaks the echo — drift becomes invisible until it is a bug.

## Anti-Patterns

- Asking permission for mechanical changes (renaming, fixing obvious errors, formatting)
- Presenting four options when you know which one is correct
- Stopping work because a service does not exist yet (use TBD stub pattern)
- Committing without MIM review (ownership is not autonomy without accountability)
- Treating Virgil as an agent (adding discover/orchestrate/generate capabilities)
- Adding features beyond what the task requires ("while I'm here, let me also...")
- Reading files the RAG already indexed (use `virgil knowledge search` first)
- Asking the user what Virgil is when OWNERSHIP.md, AGENTS.md, and the seed already tell you
