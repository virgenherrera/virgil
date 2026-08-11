---
id: index
title: "Documentation Index"
mode: framework
type: index
tags: [navigation, index, map]
---

# idea-to-mvp — Documentation Index

> Structured software development framework.
> From idea to operational code.

---

## General Map

- [Framework overview](overview.md) — high-level diagrams, recommended entry point
- [Glossary](glossary.md) — definitions of the framework's specialized terms
- [Agile adaptations](agile-adaptations.md) — how the framework adapts the 12 principles of the Agile Manifesto for AI agents
- [echo system](echo-system.md) — deterministic 5-step pipeline that guarantees homogeneity across environments
- [artifact system](artifact-system.md) — predictable-location convention for build outputs

---

## Planning (idea → handoff)

- [Mode index](planning/README.md)
- [Operational model](planning/operational-model.md) — modes, ownership, adapters
- [Artifacts](planning/artifacts/README.md) — 6 artifacts, TPM, state machine
- [SM Behavior](planning/behavior/README.md) — phases, delegation, PDC, recovery
- [Roles](planning/roles/README.md) — 5 default roles + ad-hoc

## Execution (handoff → code)

- [Mode index](execution/README.md)
- [Contracts](execution/contracts.md) — contract-first, parallel development
- [Red Phase](execution/red.md) — testing strategy
- [Green Phase](execution/green.md) — implementation
- [Refactor Phase](execution/refactor.md) — quality gate
- [Accept Phase](execution/accept.md) — QA certification
- [Git Strategy](execution/git-strategy.md) — Gitflow, worktrees, commits

## Operation (optional)

- [Mode index](operation/README.md) — the user consumes the product with agent assistance
