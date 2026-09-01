# Shared Verification Reference

> **Project:** Virgil
> **Artifact type:** Shared reference
> **Parent:** [`VIRGIL_HANDOFF_SEED.md`](../VIRGIL_HANDOFF_SEED.md)
> **Normative agent behavior:** [`AGENTS.md`](../AGENTS.md)

## Menú

- [Purpose](#purpose)
- [Standard Progress Tracker Items](#standard-progress-tracker-items)
- [Standard Verification Requirements](#standard-verification-requirements)
- [Standard Evidence Requirements](#standard-evidence-requirements)
- [POC-00 Validated Stack Versions](#poc-00-validated-stack-versions)
- [Review Gate (Receipt-Driven Development)](#review-gate-receipt-driven-development)

---

## Purpose

This file defines the standard verification, evidence, and progress items shared across all Virgil child handoffs. Each handoff references this file and adds its own handoff-specific requirements on top.

This avoids repeating ~30 lines of identical verification boilerplate in each of the 18 handoff files while preserving independent understandability (one click resolves the reference).

[↑ Menú](#menú)

---

## Standard Progress Tracker Items

Every handoff includes these items at the tail of its Progress Tracker. The exact wording may be adapted to the handoff's package path (e.g. `packages/cli/` vs `packages/pw-cdp/`).

```md
- [ ] All Markdown follows menu/backlink rules
- [ ] All persistent artifacts use International English
- [ ] `pnpm build` passes
- [ ] `pnpm test:static` passes
- [ ] `pnpm test:dynamic` passes
- [ ] Coverage greater than 97%
- [ ] JSON test artifact produced
- [ ] HTML/SPA test artifact produced
- [ ] Evidence recorded
- [ ] Handoff completion report produced
- [ ] Review receipt obtained (when receipt-driven development is active)
```

[↑ Menú](#menú)

---

## Standard Verification Requirements

### Static

`pnpm test:static` must pass with zero violations before the handoff can be marked complete.

All static gates established by H01 must remain green after the handoff's changes:

- Dependency/security audit with strict failure behavior
- Linting (tool determined by CLI generator — e.g. ESLint, Biome, or equivalent)
- Formatting verification (tool determined by CLI generator — e.g. Prettier, Biome, or equivalent)
- TypeScript verification (`tsc --noEmit`)
- Exact dependency-spec validation

### Dynamic

`pnpm test:dynamic` must pass with:

- All tests green.
- Coverage greater than 97% for statements, lines, and functions.
- JSON artifact present at the package's configured output path.
- HTML/SPA artifact present at the package's configured output path.

### Build

`pnpm build` must complete without errors across the workspace.

[↑ Menú](#menú)

---

## Standard Evidence Requirements

Every completing agent must provide at minimum:

1. Terminal output or log proving `pnpm build` succeeds.
2. Terminal output or log proving `pnpm test:static` passes all gates.
3. Terminal output or log proving `pnpm test:dynamic` passes with coverage greater than 97%.
4. Coverage summary (statements, lines, functions, branches with percentages).
5. List of all direct dependencies added or modified with their exact versions.

Handoff-specific evidence items are listed in each handoff's own Evidence Requirements section.

[↑ Menú](#menú)

---

## POC-00 Validated Stack Versions

The following versions were validated by POC-00 (reference branch: `poc/ref`, local only):

| Component | Validated Version |
| --- | --- |
| Node.js | 24.16.0 |
| pnpm | 11.24.0 |
| NestJS | 12.0.1 |
| nest-commander | 3.21.0 |
| Drizzle ORM | 0.45.2 |
| better-sqlite3 | 13.0.3 |
| Zod | 4.5.4 |
| esbuild | 0.28.2 |
| gentle-ai | 2.5.0 (global machine dependency, not npm — not validated by POC-00) |

[↑ Menú](#menú)

---

## Review Gate (Receipt-Driven Development)

When receipt-driven development is active (`gentle-ai review mode status` reports `on`), implementation changes pass through the `gentle-ai review` pipeline before delivery.

### Activation

Receipt-driven development is activated per-clone by the developer:

```text
gentle-ai review mode enable --scope global
```

Check current status:

```text
gentle-ai review mode status
```

### Review Lifecycle

For each implementation change:

1. Complete implementation and ensure static and dynamic gates pass.
2. Run all source-mutating normalizers (lint fix, format).
3. Run `gentle-ai review start` to freeze the candidate.
4. The review lifecycle runs to completion or bounded correction.
5. Capture the review receipt as evidence.
6. Deliver the change per ordinary repository policy.

### Conditional Applicability

Review gates apply only when:

1. `gentle-ai review mode status` reports `on` for the current clone.
2. The handoff introduces implementation changes (not pure documentation).
3. The developer has not explicitly deferred the review for this candidate.

When review mode is off, review gate items are skipped without affecting handoff completion.

### Review Dimensions

`gentle-ai review start` evaluates changes across four dimensions:

| Dimension | Focus |
| --- | --- |
| Risk | Security, privilege boundaries, data exposure, dependency risks |
| Resilience | Fallbacks, retry/backoff, graceful degradation, observability |
| Readability | Naming, complexity, intention, maintainability |
| Reliability | Tests, coverage, edge cases, determinism, contracts |

[↑ Menú](#menú)
