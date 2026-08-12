# Skill Registry — virgil

Generated: 2026-08-12
Project: virgil (Go 1.25.0 standalone binary)

## User Skills

| Skill | Trigger | Path |
|-------|---------|------|
| go-testing | Go tests, teatest, test coverage | `~/.claude/skills/go-testing/SKILL.md` |
| markdownlint | Writing/editing any `.md` file | `~/.claude/skills/markdownlint/SKILL.md` |
| mermaid | Flow diagrams, ER models, sequence diagrams | `~/.claude/skills/mermaid/SKILL.md` |
| solution-architect | Technical design docs, architecture docs | `~/.claude/skills/solution-architect/SKILL.md` |
| branch-pr | Creating a pull request | `~/.claude/skills/branch-pr/SKILL.md` |
| issue-creation | Creating GitHub issues | `~/.claude/skills/issue-creation/SKILL.md` |
| handoff | Structured orchestration documents | `~/.claude/skills/handoff/SKILL.md` |
| planning | Sprint planning ceremony | `~/.claude/skills/planning/SKILL.md` |
| refinement | Scrum refinement ceremony | `~/.claude/skills/refinement/SKILL.md` |
| judgment-day | Adversarial dual review | `~/.claude/skills/judgment-day/SKILL.md` |
| skill-creator | Creating new AI skills | `~/.claude/skills/skill-creator/SKILL.md` |

## Project Skills

None detected.

## Project Conventions

| File | Path |
|------|------|
| docs/README.md | Canonical dogma index (read-only for consumers) |

No AGENTS.md, CLAUDE.md, .cursorrules, GEMINI.md, or copilot-instructions.md at project level.

## Compact Rules

### go-testing (trigger: `*_test.go`, `go test`)

- Table-driven tests with named subtests
- Use `t.Helper()` in helpers
- Use `t.Parallel()` where safe
- Golden file testing for complex output
- Test file in same package or `_test` package

### markdownlint (trigger: `*.md`)

- ATX headings only, increment by one (MD001, MD003)
- Blank line before/after headings (MD022)
- One H1 per file at top (MD025, MD041)
- Unordered lists use `-`, indent 2 spaces (MD004, MD007)
- File ends with single newline (MD047)
- No trailing punctuation in headings (MD026)

### mermaid (trigger: diagrams in `.md`)

- Use flowchart TD for process steps
- Use sequenceDiagram for actor interactions
- Use erDiagram for data models
- Use classDiagram for domain models

### solution-architect (trigger: architecture docs)

- Follow: PRD -> Problem -> Actors -> Bounded Contexts -> Entity Model -> Flows -> Architecture -> Tasks -> ADRs
- Every element traceable to requirements
- Use Mermaid for diagrams

### branch-pr (trigger: PR creation)

- Every PR must link an approved issue
- Every PR must have exactly one `type:*` label
- Automated checks must pass before merge

### judgment-day (trigger: adversarial review)

- Two independent blind judges in parallel
- Synthesize findings, apply fixes
- Re-judge until both pass or escalate after 2 iterations
