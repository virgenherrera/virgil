# Virgil

A local-first, provider-agnostic AI development companion.

## Prerequisites

- Node.js 24+
- pnpm 11+

## Getting Started

1. **Install dependencies** -- `pnpm install`
2. **Build all packages** -- `pnpm build`
3. **Run static checks** -- `pnpm test:static` (audit, linting, formatting, type checking, dependency validation)
4. **Run dynamic tests** -- `pnpm test:dynamic` (unit and integration tests)

## Development Workflow: Local Minions (Optional)

This section describes optional tooling for the AI-assisted development workflow. It lets the AI orchestrator delegate cheap mechanical tasks (reads, grep, formatting, validation) to local LLM models via Docker Model Runner, saving cloud tokens for reasoning work. This is development infrastructure, not a Virgil product feature.

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
