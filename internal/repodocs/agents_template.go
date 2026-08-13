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
// protocol, available operations, and artifact pipeline so an AI agent
// arriving at a Virgil-managed repository knows how to interact with it.
const agentsTemplate = `# Virgil — Knowledge Guardian

This project is managed by [Virgil](https://github.com/virgenherrera/virgil), a knowledge and control plane for agent-assisted development.

## What Virgil Does

Virgil is the DBMS of the project's documentation. It:

- Guards the ` + backtick + `docs/` + backtick + ` directory as the single source of truth
- Enforces a structured pipeline: idea → spec → design → tasks → handoff
- Validates all artifacts against schemas before writing
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
| ` + backtick + `virgil.new` + backtick + ` | Start a new change (creates the change slot) | Project initialized, no active change |
| ` + backtick + `virgil.continue` + backtick + ` | Propose/approve artifacts for active change | Active change exists |

### Artifact Pipeline

Each change goes through 5 sequential stages:

1. **idea** (` + backtick + `docs/{change_id}/00-idea.md` + backtick + `) — What and why
2. **spec** (` + backtick + `docs/{change_id}/01-spec.md` + backtick + `) — Detailed requirements
3. **design** (` + backtick + `docs/{change_id}/02-design.md` + backtick + `) — Architecture and approach
4. **tasks** (` + backtick + `docs/{change_id}/03-tasks.md` + backtick + `) — Implementation breakdown
5. **handoff** (` + backtick + `docs/{change_id}/04-handoff.md` + backtick + `) — Delivery checklist

Each artifact is proposed via ` + backtick + `content_proposal` + backtick + `, then approved via ` + backtick + `approval` + backtick + `.

### Layout

` + tripleBacktick + `
virgil.json              # Project config (auto-generated)
AGENTS.md                # This file (auto-generated)
docs/
  {change_id}/
    00-idea.md           # JSON frontmatter + markdown content
    01-spec.md
    02-design.md
    03-tasks.md
    04-handoff.md
` + tripleBacktick + `

### Artifact Format

Each ` + backtick + `.md` + backtick + ` file has JSON frontmatter:

` + tripleBacktick + `
---json
{
  "schema": "virgil.dev/artifact/v1alpha1",
  "artifact_kind": "idea",
  "change_id": "my-feature",
  "status": "approved",
  "revision": "rev-000001"
}
---

# Content here
` + tripleBacktick + `

### Rules

- **DO NOT** modify files in ` + backtick + `docs/` + backtick + ` directly — always go through Virgil
- **DO NOT** delete or rename artifact files
- **DO** read ` + backtick + `docs/` + backtick + ` files for context (RAG-friendly)
- **DO** propose changes through ` + backtick + `virgil.continue` + backtick + ` with ` + backtick + `content_proposal` + backtick + `
`
