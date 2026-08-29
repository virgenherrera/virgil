# Virgil — Development Override

Extends [AGENTS.md](./AGENTS.md). Use this file when developing
Virgil itself (fix, enhance, refactor).

## Context Override

| Kind | Source |
|------|--------|
| Dogma | `docs/` (architecture, roadmap, principia reference) |
| Tickets | GitHub Issues on this repository |
| Source code | This repository |
| Org | N/A |
| Chat | N/A |

## Principia

`docs/reference/principia/` is the sealed normative reference.
If code contradicts the principia, the code is wrong.

## Testing

- App-level tests only, zero mocks, filterable by test name
- Unit tests are prohibited (value = 0 per principia testing matrix)
- Run `pnpm test` before proposing changes
- Filter: `pnpm vitest run --test-name-pattern "<pattern>"`

## Commits

Changes to this repository are committed directly. Use conventional
commits. Artifacts generated under `.virgil/` are gitignored and
never committed.

## Additional Boundaries

### NEVER

- Modify principia sections without explicit instruction
- Push to main or production branches without authorization

### ASK

- Architectural changes to provider contracts or ports
- Changes to the state machine or audit checks
- New dependencies
