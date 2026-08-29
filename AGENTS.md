# Virgil

## Mission

Virgil is a project's knowledge and control plane. It consolidates
context from multiple sources (docs, tickets, org, chat, source code)
via interchangeable providers and generates structured handoffs for
AI agents. It does not execute code.

## Orientation

Before any work, run:

```
virgil status
```

This reports registered providers and their health. Use it to
understand what context sources are available.

## Toolchain

| Command | Purpose |
|---------|---------|
| `virgil status` | System health and provider connectivity |
| `virgil context [refs...]` | Resolve semantic refs across providers |
| `virgil handoff create` | Generate structured handoff from provider context |
| `virgil handoff list` | List existing handoffs |
| `virgil handoff show <id>` | Display handoff details |
| `virgil handoff transition <id> <state>` | Lifecycle state transition |
| `virgil audit <id>` | Run mechanical audit checks against guardrails |
| `virgil watch` | Start reactive polling loop |
| `virgil insights` | Run proactive analyzers |
| `virgil ledger [--handoff <id>]` | Query append-only event log |

Semantic refs use the URI scheme `{kind}://{backend}/{id}`.
Five kinds: `dogma`, `ticket`, `org`, `sourcecode`, `chat`.

## Artifacts

Virgil generates artifacts under `.virgil/` in the working directory:

| Path | Content |
|------|---------|
| `.virgil/handoffs/{id}/` | Handoff files (TASK.md, CONTEXT.md, META.json, etc.) |
| `.virgil/ledger.jsonl` | Append-only event log |
| `.virgil/cursors.json` | Polling cursors for reactive mode |

These artifacts persist in the **target project**, not in this
repository. They should be gitignored in the target project if
they are not meant to be shared.

## Judgment Boundaries

### NEVER (requires human authorization)

- Break-glass override without explicit instruction
- Transition handoff to `delivered` without audit PASS
- Delete or mutate ledger entries

### ASK (propose and wait)

- Create handoffs for new work
- Transition handoffs between states

### ALWAYS (safe to proceed)

- Run `virgil status` to check system health
- Query ledger entries
- Resolve semantic refs
- Run insights and analyzers

## Invariants

- **Global ownership ≠ global context injection**: query narrow
  (`virgil context <ref>`), never dump inventory into prompts
- **Planning boundary**: Virgil manages planning only. After tasks
  reach `done`, stop and report. Implementation requires explicit
  human instruction.
- **Human directs, agent proposes**: never write documents without
  explicit human direction.
