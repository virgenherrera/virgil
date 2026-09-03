# Virgil

## Using Local Minions

Virgil supports running local LLM models as minions alongside cloud orchestrators. The probe system detects your hardware, scores model fitness, and computes a ceiling configuration that determines which models can run on your machine.

### Prerequisites

- Docker Desktop with Model Runner enabled (listens on `localhost:12434`)
- Node.js 24+ with pnpm

### Quick Start

1. **Detect hardware:**

   ```bash
   npx tsx scripts/virgil-model-probe.ts detect
   ```

   Outputs a `HardwareProfile` JSON with CPU, GPU/Metal/CUDA, RAM, disk, and Docker status.

2. **Score model fitness:**

   ```bash
   npx tsx scripts/virgil-model-probe.ts fitness
   ```

   Evaluates each model in the catalog against your hardware using the formula `RAM = B x 0.55 + 1.5 GB`.

3. **Configure ceiling:**

   ```bash
   npx tsx scripts/virgil-model-probe.ts ceiling --max-minions 1 --tiers worker --save
   ```

   Computes the effective ceiling (minimum of hardware CAN and owner WANT) and persists it to `virgil.json`.

### Commands

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
| `--save` | Persist the effective ceiling to `virgil.json` |

Without `--max-minions` and `--tiers`, the command prints the CAN ceiling and prompts interactively for WANT values.

### Architecture

The probe system enforces a dual-ceiling model:

- **CAN ceiling** -- what the hardware can support (RAM budget, qualified models per tier)
- **WANT ceiling** -- what the owner declares (max minions, allowed tiers, selected models)
- **Effective ceiling** -- `min(CAN, WANT)` per dimension, persisted to `virgil.json`

For detailed architecture diagrams, see the [Local Minions Probe](AGENTS.md#local-minions-probe) section in AGENTS.md.
