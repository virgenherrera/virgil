# Virgil

A deterministic, cached, memoized RAG knowledge service for AI agents.

## Menú

- [What is Virgil](#what-is-virgil)
- [Command Surface](#command-surface)
- [Development Prerequisites](#development-prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow: Local Minions (Optional)](#development-workflow-local-minions-optional)
- [Contributing](#contributing)

---

## What is Virgil

Virgil is a deterministic, local-first knowledge retrieval service that AI agents query for project context instead of reading files or crawling systems directly. For the complete product identity, architecture, and scenarios, see [PROJECT.md](PROJECT.md).

[↑ Menú](#menú)

---

## Command Surface

Virgil exposes seven top-level commands: `init`, `workspace`, `repo`, `provider`, `knowledge`, `governance`, and `version`. For descriptions and implementation status, see [PROJECT.md -- Current Command Surface](PROJECT.md#current-command-surface).

[↑ Menú](#menú)

---

## Development Prerequisites

These prerequisites are for developing Virgil itself. End-user distribution is planned as a standalone binary (TBD).

- Node.js 24+
- pnpm 11+

[↑ Menú](#menú)

---

## Getting Started

1. **Install dependencies** -- `pnpm install`
2. **Build all packages** -- `pnpm build`
3. **Run static checks** -- `pnpm test:static` (audit, linting, formatting, type checking, dependency validation)
4. **Run dynamic tests** -- `pnpm test:dynamic` (unit and integration tests)

[↑ Menú](#menú)

---

## Development Workflow: Local Minions (Optional)

This section describes optional tooling for the AI-assisted development workflow. It lets the AI orchestrator probe local hardware capabilities and determine which local LLM models could serve as pre-tokenization filters -- compressing raw context before cloud-tier calls. This is development infrastructure, not a Virgil product feature -- it is never wired into Virgil's query/response path.

### Additional Prerequisite

- Docker Desktop with Model Runner enabled (listens on `localhost:12434`)

### Commands

All commands use `pnpm probe <subcommand>`:

| Command | Description | Network Required |
| --- | --- | --- |
| `detect` | Detect hardware capabilities (CPU, GPU, RAM, disk, Docker) | No |
| `fitness` | Score each catalog model against detected hardware | No |
| `ceiling [options]` | Compute CAN/WANT ceiling and optionally persist to `virgil.json` | No |
| `probe` | Probe Docker Model Runner for available models | Yes (localhost) |
| `benchmark <model>` | Run a benchmark against a specific model via DMR | Yes (localhost) |
| `select <model>` | Select a model for use as a local minion | Yes (localhost) |

### Ceiling Options

| Option | Description |
| --- | --- |
| `--max-minions <n>` | Desired maximum concurrent minions |
| `--tiers <t1,t2>` | Allowed tiers, comma-separated: `worker`, `reasoning`, `pro` |
| `--ram-reservation <gb>` | Reserve RAM for system use before computing fitness |
| `--save` | Persist the effective ceiling to `virgil.json` |

### Architecture

The probe system enforces a dual-ceiling model. The **CAN ceiling** represents what the hardware can support (RAM budget, qualified models per tier). The **WANT ceiling** represents what the owner declares (max minions, allowed tiers, selected models). The **effective ceiling** is `min(CAN, WANT)` per dimension, persisted to `virgil.json`.

For detailed architecture diagrams, see the [Local Minions Probe](AGENTS.md#local-minions-probe) section in AGENTS.md.

[↑ Menú](#menú)

---

## Contributing

See [AGENTS.md](AGENTS.md) for the repository agent contract and development conventions.

[↑ Menú](#menú)
