# Virgil

Knowledge and control plane for agent-assisted development. Virgil guards ownership, minimal context, and traceability from idea to code.

## Install

```bash
go install github.com/virgenherrera/virgil/cmd/virgil@latest
```

## Setup

In your project directory:

```bash
virgil install
```

This detects your AI agent (Claude Code, Codex) and configures the MCP server. Restart your agent after installation.

## Use

Open your AI agent in the project. Virgil exposes 5 tools via MCP:

| Tool | What it does |
|------|-------------|
| `virgil_init` | Initialize Virgil (creates `virgil.json` + `AGENTS.md`) |
| `virgil_new` | Start a new planning change |
| `virgil_propose` | Propose content for the current artifact stage |
| `virgil_approve` | Approve the current artifact, advance the pipeline |
| `virgil_status` | Show current project state |

### Example

```
You:   Initialize this project with Virgil
Agent: [calls virgil_init] Project initialized.

You:   I want to add JWT authentication
Agent: [calls virgil_new] Change created. Ready to propose the idea.
       [calls virgil_propose] Idea proposed. Awaiting your approval.

You:   Looks good, approve it
Agent: [calls virgil_approve] Idea approved. Next step: spec.
```

The agent drives the full pipeline. You review and approve each stage.

## Artifact pipeline

Each change goes through 5 stages:

```
idea -> spec -> design -> tasks -> handoff -> complete
```

Artifacts are markdown files in `docs/{change_id}/`:

```
docs/add-jwt-auth/
  00-idea.md
  01-spec.md
  02-design.md
  03-tasks.md
  04-handoff.md
```

## Architecture

Virgil is a stateless Go binary. Each invocation receives a complete JSON envelope and returns a result. The MCP server (`virgil serve`) wraps this protocol so agents interact with simple tool calls instead of raw JSON.

- `docs/` in this repo is the operational dogma (read-only for consumers).
- `docs/` in consumer repos is the managed artifact store.
- `virgil.json` at the consumer root is the project config (auto-generated).

## CLI

```
virgil              Show help
virgil install      Install MCP integration for detected agents
virgil serve        Start MCP server (stdio, used by agents)
virgil pipe         Raw stdin/stdout JSON mode (scripting, CI)
virgil version      Print version
```

## Validation

Virgil is certified with app-level black-box scenarios (`TestApp_*`) that enter through the public surface and observe requests, guards, effects, diffs, and recovery. Unit tests are not certification evidence.

```bash
go test ./test/app -run '^TestApp_' -count=1
```
