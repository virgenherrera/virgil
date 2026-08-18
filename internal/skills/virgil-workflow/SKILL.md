---
name: virgil-workflow
description: "Trigger: working in a Virgil-managed project, or asked to run the Virgil planning workflow. Teaches the init → write → transition → status MCP tool workflow and knowledge base management."
metadata:
  author: virgenherrera
  version: "2.0"
---

# Virgil Workflow

Virgil exposes four MCP tools on the `virgil` server: `virgil_init`,
`virgil_write`, `virgil_transition`, `virgil_status`. Together they manage
a project-level knowledge base with structured documents and task tracking.
This skill teaches the tool workflow; it does not replace the individual
`/virgil-*` command skills, which document each tool's parameters in
isolation.

## Activation Contract

Load this skill whenever you are about to call any `virgil_*` MCP tool, or
whenever the user asks to plan, write, or manage documents in a
Virgil-managed project.

## Hard Rules

- Never invent tool parameters. Each tool's input schema is exact and
  `additionalProperties: false` — extra fields are rejected.
- Never call `virgil_write` for a task without a `slug`.
- Never call `virgil_transition` with an invalid transition (check
  `virgil_status` first to know the current status).
- `virgil_status` takes no parameters and is always safe to call — use it
  liberally to re-orient.
- After tasks reach `done` or `released`, STOP. The knowledge base is a
  PLANNING tool. Implementation requires separate, explicit instruction
  from the human.
- Never declare planning complete with tasks still at `backlog` — all
  tasks should be at `refined` minimum.

## The Knowledge Base Model

Virgil manages a project-level knowledge base (not per-change). Documents
are organized by kind:

```
docs/
  idea.md                              # Single project-level idea
  requirements/
    {category}-{slug}.md               # Requirement documents
  design/
    {category}-{slug}.md               # Design documents
  tasks/
    {slug}.md                          # Task documents with lifecycle
```

### Document Kinds

| Kind | Location | Notes |
|------|----------|-------|
| `idea` | `docs/idea.md` | Single file, overwritten on each write. No slug. |
| `requirement` | `docs/requirements/` | Optional `category` prefix. |
| `design` | `docs/design/` | Optional `category` prefix. |
| `task` | `docs/tasks/` | Has `status` lifecycle and `refs` linking to other docs. |

### Task Lifecycle

Tasks have a status that follows a state machine. Status lives in the
document's JSON frontmatter — files do NOT move between directories.

```
backlog → refined → active → done → released
```

Use `virgil_write` to create tasks and `virgil_transition` to change their
status. Backward transitions are allowed (except from `released`).

## Tool Summary

| Tool | Purpose | When |
|------|---------|------|
| `virgil_init` | Initialize project, creates `virgil.json` and `AGENTS.md` | Once per project, before anything else. |
| `virgil_write` | Create or update documents (idea, requirement, design, task) | Any time after init. |
| `virgil_transition` | Change a task's lifecycle status | When a task needs to advance or regress. |
| `virgil_status` | Check project state, doc counts, task counts by status | Any time — safe, no parameters. |

## Typical Workflow

1. `virgil_status` — check if project is initialized.
2. `virgil_init` — if not initialized, create the project.
   - Call `virgil_status` to confirm initialization succeeded.
3. `virgil_write` with `doc_kind: "idea"` — capture the project idea.
4. `virgil_write` with `doc_kind: "requirement"` — define requirements
   (repeat for each requirement, using `slug` and optionally `category`).
   - Call `virgil_status` to verify requirement counts match expectations.
5. `virgil_write` with `doc_kind: "design"` — write design documents
   (repeat for each design doc).
6. `virgil_write` with `doc_kind: "task"` — break work into tasks with
   `refs` linking to requirements and design docs.
   - Call `virgil_status` to verify task counts. Then call
     `virgil_transition` on each task to advance from `backlog` to
     `refined`.
7. `virgil_transition` — during planning: transition all tasks to
   `refined` after writing them. During implementation: advance through
   `active → done → released`.
8. `virgil_status` — check document counts and task status distribution
   at any point.

## Response Shape

`virgil_init`, `virgil_write`, and `virgil_transition` return an
OperationResult with:

- `status`: one of `success`, `needs_input`, `blocked`, `error`, `unsupported`.
- `operation`: the operation that ran (e.g. `virgil.init`, `virgil.write`).
- `message`: human-readable summary (when simplified by MCP layer).
- `artifacts`: file paths written by this call, if any.
- `next`: what to do next, if the runtime has a recommendation.
- `error`: diagnostic detail, present only on failure.

`virgil_status` returns a ProjectState object:

- `initialized`: boolean.
- `project_id`: string (if initialized).
- `requirement_count`: number of requirement documents.
- `design_count`: number of design documents.
- `task_counts`: object with `backlog`, `refined`, `active`, `done`, `released` counts.

## Output Contract

After calling any tool, report to the user: the `status` of the call, any
`artifacts` written, and the current state if relevant. If `status` was
`blocked` or `error`, surface the `error` field verbatim before proposing a
fix.

## References

- `../virgil-init/SKILL.md` — `virgil_init` in isolation.
- `../virgil-write/SKILL.md` — `virgil_write` in isolation.
- `../virgil-transition/SKILL.md` — `virgil_transition` in isolation.
- `../virgil-status/SKILL.md` — `virgil_status` in isolation.
