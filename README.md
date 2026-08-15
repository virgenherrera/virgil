# Virgil

Virgil is a Go CLI — the knowledge and control plane for agent-assisted development. It guards ownership,
minimal context, and traceability from idea to delivery.

## Install

### Script (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/virgenherrera/virgil/main/install.sh | sh
```

Resolves latest release automatically, verifies SHA-256 checksum. Supports Linux and macOS (amd64, arm64). Windows
users: install from source with `go install` (below). Optional: `VIRGIL_VERSION` pins a specific release instead of
latest; `VIRGIL_INSTALL_DIR` overrides the install location (default `/usr/local/bin`, falls back to `~/.local/bin`).

### GitHub Releases

Binaries (linux/darwin, amd64/arm64) on the [Releases page](https://github.com/virgenherrera/virgil/releases).

### From source

Requires Go 1.26.5+.

```bash
go install github.com/virgenherrera/virgil/cmd/virgil@latest
```

## Setup

In your project directory:

```bash
virgil install
```

Detects agents (Claude Code, Codex), configures MCP, installs skills/commands/prompt, writes `~/.virgil/state.json`.

Re-apply Virgil skills, commands, and system prompt to installed agents without re-running detection or MCP config:

```bash
virgil sync
```

## Use

Open your AI agent in the project. Virgil exposes 5 tools via MCP:

| Tool | What it does |
|------|---------------|
| `virgil_init` | Initialize a Virgil-managed project. Creates `virgil.json` and `AGENTS.md` |
| `virgil_new` | Start a new planning change (project must not already have an active change) |
| `virgil_propose` | Submit a content proposal for the current artifact step |
| `virgil_approve` | Approve the current artifact revision, advancing to the next step |
| `virgil_status` | Show current project state: initialized, active change, derived step |

### Example

```text
You:   Initialize this project with Virgil
Agent: [calls virgil_init] Project initialized.

You:   I want to add JWT authentication
Agent: [calls virgil_new, virgil_propose] Change created, idea proposed. Awaiting your approval.

You:   Looks good, approve it
Agent: [calls virgil_approve] Idea approved. Next step: spec.
```

## Artifact pipeline

Each change moves through 5 artifact stages:

```text
idea -> spec -> design -> tasks -> handoff
```

"complete" is derived, not a stage — computed once all 5 are approved. Clears `active_change` from `virgil.json`.

Artifacts are markdown files under `docs/{change_id}/`:

```text
docs/add-jwt-auth/
  00-idea.md
  01-spec.md
  02-design.md
  03-tasks.md
  04-handoff.md
```

## Architecture

- Stateless Go binary: each `virgil pipe` invocation receives a complete JSON envelope and returns a result.
- `virgil serve` wraps the same logic as an MCP server over stdio for agent tool calls.
- 3 runtime operations: `virgil.init`, `virgil.new`, `virgil.continue`.
- `virgil.json` (target root) is the project config from `virgil_init`; `~/.virgil/state.json` is CLI install state.
- `docs/` in this repo is operational dogma (read-only); in consumer repos it is the managed artifact store.
- Adapter pattern (Open/Closed): new agents get an adapter, registered. Two ship today: Claude Code, Codex.

## CLI reference

| Command | What it does |
|---------|---------------|
| `virgil` | Show help |
| `virgil install` | Install Virgil MCP integration for detected AI agents |
| `virgil sync` | Re-apply Virgil skills, commands, and system prompt to installed agents |
| `virgil serve` | Start the Virgil MCP server on stdio |
| `virgil pipe` | Read a JSON envelope from stdin and write the result to stdout |
| `virgil version` | Print the virgil version |

## Validation

Certified with 22 `TestApp_*` black-box scenarios in `test/app/`, run as subprocesses of the public binary.
Unit tests are not certification evidence.

```bash
go test ./test/app -run '^TestApp_' -count=1
```
