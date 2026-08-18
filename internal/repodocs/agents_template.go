package repodocs

// backtick holds a single backtick character. Go raw string literals
// (delimited by `...`) cannot contain a literal backtick, so every markdown
// code span or fence inside agentsTemplate is spliced in through this
// constant rather than written directly inside a raw-string block. Because
// backtick is itself an untyped constant string, concatenating it with raw
// string literals below is still a compile-time constant expression, so
// agentsTemplate remains a genuine const.
const backtick = "`"

// tripleBacktick opens and closes markdown fenced code blocks.
const tripleBacktick = backtick + backtick + backtick

// agentsTemplate is the content Virgil publishes as AGENTS.md at the target
// root during virgil.init, alongside virgil.json. It documents the wire
// protocol, available operations, and knowledge base model so an AI agent
// arriving at a Virgil-managed repository knows how to interact with it.
const agentsTemplate = `# Virgil — Knowledge Guardian

This project is managed by [Virgil](https://github.com/virgenherrera/virgil), a knowledge and control plane for agent-assisted development.

## What Virgil Does

Virgil is the DBMS of the project's documentation. It:

- Guards the ` + backtick + `docs/` + backtick + ` directory as the single source of truth
- Manages a project-level knowledge base: idea, requirements, design, tasks
- Tracks task lifecycle through a frontmatter state machine
- Validates all documents against schemas before writing
- Provides atomic, traversal-resistant file operations

## How to Interact

Virgil is a standalone binary that reads JSON from stdin and writes JSON to stdout.

### Wire Protocol

Every invocation uses a runtime envelope:

` + tripleBacktick + `json
{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "<unique-id>",
  "request": { "...": "OperationRequest" },
  "bindings": {
    "target": { "uri": "<absolute-path>", "root": "<absolute-path>" },
    "resources": [{ "uri": "fixture://dogma/virgil/v1", "content": "...", "digest": "sha256:..." }]
  },
  "clock": { "now": "<RFC3339>" }
}
` + tripleBacktick + `

### Available Operations

| Operation | Purpose | Precondition |
|-----------|---------|--------------|
| ` + backtick + `virgil.init` + backtick + ` | Initialize project, creates ` + backtick + `virgil.json` + backtick + ` and ` + backtick + `AGENTS.md` + backtick + ` | No existing ` + backtick + `virgil.json` + backtick + ` |
| ` + backtick + `virgil.write` + backtick + ` | Create or update a document in the knowledge base | Project initialized |
| ` + backtick + `virgil.transition` + backtick + ` | Change a task's lifecycle status | Task exists |
| ` + backtick + `virgil.status` + backtick + ` | Check project state, doc counts, task counts | None (always safe) |

### Knowledge Base Model

Documents are organized by kind under ` + backtick + `docs/` + backtick + `:

` + tripleBacktick + `
virgil.json                            # Project config (auto-generated)
AGENTS.md                              # This file (auto-generated)
docs/
  idea.md                              # Single project-level idea
  requirements/
    {category}-{slug}.md               # Requirement documents
  design/
    {category}-{slug}.md               # Design documents
  tasks/
    {slug}.md                          # Task documents with lifecycle
` + tripleBacktick + `

### Document Kinds

| Kind | Location | Notes |
|------|----------|-------|
| ` + backtick + `idea` + backtick + ` | ` + backtick + `docs/idea.md` + backtick + ` | Single file, overwritten on each write. No slug. |
| ` + backtick + `requirement` + backtick + ` | ` + backtick + `docs/requirements/` + backtick + ` | Optional category prefix (e.g. ` + backtick + `functional` + backtick + `, ` + backtick + `non-functional` + backtick + `). |
| ` + backtick + `design` + backtick + ` | ` + backtick + `docs/design/` + backtick + ` | Optional category prefix (e.g. ` + backtick + `arch` + backtick + `, ` + backtick + `entity` + backtick + `, ` + backtick + `api-contract` + backtick + `). |
| ` + backtick + `task` + backtick + ` | ` + backtick + `docs/tasks/` + backtick + ` | Has lifecycle status and refs to other docs. |

### Task Lifecycle

Tasks carry a ` + backtick + `status` + backtick + ` field in their JSON frontmatter. Status transitions follow a state machine — files do NOT move between directories:

` + tripleBacktick + `
backlog → refined → active → done → released
` + tripleBacktick + `

Backward transitions are allowed (` + backtick + `refined → backlog` + backtick + `, ` + backtick + `active → refined` + backtick + `, ` + backtick + `done → active` + backtick + `). ` + backtick + `released` + backtick + ` is terminal.

### Transition Guidance — Planning Boundary

Virgil manages **planning only**. When every task in the project reaches status ` + backtick + `refined` + backtick + `, planning is complete: ` + backtick + `virgil_status` + backtick + `, ` + backtick + `virgil_write` + backtick + `, and ` + backtick + `virgil_transition` + backtick + ` will all report this via a ` + backtick + `PlanningComplete` + backtick + ` signal and an explicit notice.

That signal is not informational trivia — it is a stop condition:

- **DO NOT** transition a task to ` + backtick + `active` + backtick + ` or begin writing implementation code as a result of seeing all tasks at ` + backtick + `refined` + backtick + `. That transition requires an explicit, direct instruction from the human in the current conversation.
- **DO NOT** infer authorization to implement from the presence of refined tasks, a completed plan, or an absence of objection. Silence is not authorization.
- **DO** stop and report the planning-complete state to the human, then wait for them to explicitly direct the next step (e.g. "start implementing task X", "move task X to active").

### Document Format

Each ` + backtick + `.md` + backtick + ` file has JSON frontmatter:

` + tripleBacktick + `
---json
{
  "schema": "virgil.dev/doc/v1alpha1",
  "protocol_version": "virgil.dev/planning-slice2/v1alpha1",
  "doc_kind": "task",
  "project_id": "my-project",
  "slug": "implement-login",
  "status": "backlog",
  "refs": {
    "requirements": ["functional-user-auth.md"],
    "design": ["arch-auth-flow.md"]
  },
  "content_digest": "sha256:...",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
---

# Content here
` + tripleBacktick + `

### Rules

- **DO NOT** modify files in ` + backtick + `docs/` + backtick + ` directly — always go through Virgil
- **DO NOT** delete or rename document files
- **DO NOT** write implementation code once all tasks reach ` + backtick + `refined` + backtick + ` (planning complete) or ` + backtick + `done` + backtick + ` — implementation ALWAYS requires an explicit, direct instruction from the human, given in the current conversation. A completed plan is not that instruction.
- **DO NOT** treat ` + backtick + `virgil_status` + backtick + ` reporting ` + backtick + `PlanningComplete: true` + backtick + ` as permission to proceed — treat it as a signal to stop and report back to the human
- **DO** read ` + backtick + `docs/` + backtick + ` files for context (RAG-friendly)
- **DO** use ` + backtick + `virgil.write` + backtick + ` to create and update documents
- **DO** use ` + backtick + `virgil.transition` + backtick + ` to advance task status
- **DO** use ` + backtick + `virgil.status` + backtick + ` to check project state before acting
`
