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
  README.md                            # Navigation index (auto-generated)
  idea.md                              # Single project-level idea
  requirements/
    README.md                          # Navigation index (auto-generated)
    {category}-{slug}.md               # Requirement documents
  design/
    README.md                          # Navigation index (auto-generated)
    {category}-{slug}.md               # Design documents
  tasks/
    README.md                          # Navigation index (auto-generated)
    {slug}.md                          # Task documents with lifecycle
` + tripleBacktick + `

Every ` + backtick + `README.md` + backtick + ` is regenerated in full after each ` + backtick + `virgil.write` + backtick + ` call. **DO NOT** edit ` + backtick + `README.md` + backtick + ` files manually — they carry no content of their own and any manual edit is overwritten on the next write.

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
<!-- virgil:meta
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
-->

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
- **DO** call ` + backtick + `virgil.status` + backtick + ` at every phase boundary (after init, after requirements, after tasks, before declaring done)
- **DO** transition tasks to ` + backtick + `refined` + backtick + ` after writing them with acceptance criteria

## Planning Workflow Checkpoints

Planning is not complete just because documents were written. An agent must
verify state and advance task status at defined checkpoints — these are not
optional.

### Status Check Points

Call ` + backtick + `virgil.status` + backtick + ` at each of these points:

- **Immediately after** ` + backtick + `virgil.init` + backtick + ` — confirm initialization succeeded.
- **After writing ALL requirements** — verify requirement counts match what was intended.
- **After writing ALL tasks** — verify the full backlog was recorded.
- **Before declaring planning complete** — verify all expected documents exist (idea, requirements, design, tasks) and inspect ` + backtick + `task_counts` + backtick + `.

### Transition Guidance

- After writing a task with acceptance criteria, transition it from ` + backtick + `backlog` + backtick + ` to ` + backtick + `refined` + backtick + ` using ` + backtick + `virgil.transition` + backtick + `.
- A task at ` + backtick + `refined` + backtick + ` means "fully specified and ready for implementation."
- Do NOT leave all tasks at ` + backtick + `backlog` + backtick + ` — a completed planning phase should have all tasks at ` + backtick + `refined` + backtick + `.
- Transitions to ` + backtick + `active` + backtick + `, ` + backtick + `done` + backtick + `, and ` + backtick + `released` + backtick + ` happen during implementation, not planning.

## Document Formatting Guidelines

This section documents how to format document content passed to ` + backtick + `virgil.write` + backtick + `. Applying these conventions consistently makes documents easier to navigate for both humans and other agents reading them through the knowledge base.

### Mermaid Diagrams

Use a diagram when it makes a structure easier to see than prose alone. Pick the diagram type by what it needs to show:

| Type | Use for |
|------|---------|
| ` + backtick + `flowchart TD` + backtick + ` / ` + backtick + `flowchart LR` + backtick + ` | Architecture, dependency graphs, document maps |
| ` + backtick + `erDiagram` + backtick + ` | Data models and entity relationships |
| ` + backtick + `sequenceDiagram` + backtick + ` | Request flows, async pipelines, interaction patterns |

**DO NOT** leave a diagram standalone — every diagram MUST be followed by a prose explanation of what it shows. Use ` + backtick + `%%` + backtick + ` comments as a title inside the mermaid block.

` + tripleBacktick + `mermaid
%% Request flow
flowchart LR
  Client --> API --> DB
` + tripleBacktick + `

The client calls the API, which reads from and writes to the database.

` + tripleBacktick + `mermaid
%% Core entities
erDiagram
  USER ||--o{ ORDER : places
` + tripleBacktick + `

A user places zero or more orders.

` + tripleBacktick + `mermaid
%% Login sequence
sequenceDiagram
  Client->>API: POST /login
  API-->>Client: 200 OK
` + tripleBacktick + `

The client submits credentials and the API responds with a session on success.

### Table of Contents

For documents with 3 or more major sections, place an anchor-linked table of contents immediately after the H1 heading:

` + tripleBacktick + `
- [Section Name](#section-slug)
- [Another Section](#another-section)
` + tripleBacktick + `

### Structure Templates per Document Kind

These are recommended section orders, not rigid mandates — adapt based on what the document actually needs.

| Kind | Recommended Structure |
|------|------------------------|
| Idea | Summary → Motivation → Scope → Out of Scope → Success Criteria |
| Requirement | Summary → Acceptance Criteria (Given/When/Then) → Validation Rules → Risks → Dependencies → Related Documents |
| Design | Summary → Architecture Diagram (mermaid flowchart) → Data Model (mermaid erDiagram) → API Contract → Technical Decisions → Related Requirements |
| Task | Description → Steps → Dependencies → Definition of Done → Related Docs |

### Cross-References

Use relative links between documents so links keep resolving regardless of where the repository is cloned:

- ` + backtick + `[User Auth Requirement](../requirements/functional-user-auth.md)` + backtick + `
- Link to a specific section with an anchor: ` + backtick + `[see Data Model](../design/arch-api-flow.md#data-model)` + backtick + `
- Collect related documents in a "Related Documents" section at the end of the document

### Back-to-Top Links

For longer documents, add a back-to-top link after each major section so readers can jump back without scrolling:

` + tripleBacktick + `
[↑ Back to top](#document-title-slug)
` + tripleBacktick + `
`
