# Course Correction — V1 Readiness

Directional document. Captures architectural corrections required before
Virgil can be declared v1. Written 2026-08-31 after dogfooding session
exposed gaps in packaging, tooling, and interface boundaries.

- [Decision](#decision)
- [Before vs After](#before-vs-after)
- [Interaction Model](#interaction-model)
- [Correction Items](#correction-items)
- [Sequence](#sequence)

## Decision

Virgil is an **independent project that manages other projects**. It does not
couple into them. It does not inject itself as a server, plugin, or MCP
endpoint. An agent clones Virgil, installs it, and invokes it via CLI against
a target project's resources.

Two prior decisions converge here:

1. **Runtime MCP dropped** (decided during the Go → TypeScript pivot). The
   roadmap already lists "MCP server mode" as a Non-Goal for V1.
2. **Planning MCP dropped** (decided 2026-08-31). The MCP server that
   provided `virgil_init`, `virgil_write`, `virgil_transition`, and
   `virgil_status` is removed. These operations become CLI commands in the
   same binary.

Rationale for dropping planning MCP:

- Hardcoded absolute paths in `virgil.json` (doxes OS + username, breaks on
  any other machine)
- Overwrites hand-crafted `AGENTS.md` with a generic template
- Only covers 4 of 20+ operations — maintaining two interfaces for partial
  overlap
- Virgil's value is in the CLI tool, not in being an MCP server

[↑ Back to top](#course-correction--v1-readiness)

## Before vs After

### Before — Two Interfaces

```mermaid
flowchart LR
    subgraph MCP["MCP Server (Go binary)"]
        INIT["virgil_init"]
        WRITE["virgil_write"]
        TRANS["virgil_transition"]
        STAT_MCP["virgil_status"]
    end

    subgraph CLI["CLI (TypeScript)"]
        STATUS["status"]
        CONTEXT["context"]
        HANDOFF["handoff *"]
        AUDIT["audit"]
        BRIEF["brief"]
        WATCH["watch"]
        INSIGHTS["insights"]
        LEDGER["ledger"]
    end

    AGENT["AI Agent"] -->|"MCP protocol"| MCP
    AGENT -->|"shell invocation"| CLI

    style MCP fill:#c44,stroke:#333,color:#fff
    style CLI fill:#47a,stroke:#333,color:#fff
```

Two interfaces, two languages, partial overlap. The agent must know which
interface to use for which operation.

### After — Single CLI

```mermaid
flowchart LR
    subgraph CLI["Virgil CLI (TypeScript, single binary)"]
        direction TB
        subgraph PLAN["Planning Commands"]
            P_WRITE["write"]
            P_TRANSITION["transition"]
        end
        subgraph OPS["Operational Commands"]
            STATUS["status"]
            CONTEXT["context"]
            HANDOFF["handoff *"]
            AUDIT["audit"]
            BRIEF["brief"]
            WATCH["watch"]
            INSIGHTS["insights"]
            LEDGER["ledger"]
            INIT["init"]
            DOCTOR["doctor"]
        end
    end

    AGENT["AI Agent"] -->|"shell invocation"| CLI

    style CLI fill:#47a,stroke:#333,color:#fff
    style PLAN fill:#2b5,stroke:#333,color:#fff
    style OPS fill:#a74,stroke:#333,color:#fff
```

One interface, one language, one invocation pattern. Planning and operational
commands live in the same binary.

[↑ Back to top](#course-correction--v1-readiness)

## Interaction Model

How an agent uses Virgil on a target project:

```mermaid
sequenceDiagram
    participant H as Human
    participant A as AI Agent
    participant V as Virgil CLI
    participant P as Providers (external)

    H->>A: "This project uses Virgil.<br/>Dogma: ~/docs + Confluence X<br/>Tickets: GitHub Issues<br/>Chat: Slack #dev"

    A->>V: virgil status
    V->>P: health checks (GitHub, Confluence, Slack)
    V-->>A: providers: 4 available, 0 degraded

    A->>V: virgil context ticket://github/42
    V->>P: resolve ref across providers
    V-->>A: ticket details + related brief items

    A->>V: virgil handoff create --ticket PROJ-42
    V->>P: snapshot all providers
    V-->>A: .virgil/handoffs/h-abc123/ (TASK.md, CONTEXT.md, ...)

    A->>A: delegates handoff to executor agent

    Note over A,V: Executor works, writes AGENT_OUTPUT.md

    A->>V: virgil handoff transition h-abc123 verify
    A->>V: virgil audit h-abc123
    V-->>A: PASS / FAIL + gap analysis
```

Key properties:

- Virgil is invoked via shell — `virgil <command> [args]`
- Resources are configured via `.virgilrc.yaml` or env vars
- The agent tells Virgil WHERE things are; Virgil knows HOW to read them
- Handoffs are the output — structured context packages for other agents
- Virgil never executes code or modifies the target project

[↑ Back to top](#course-correction--v1-readiness)

## Correction Items

### Phase 1 — Packaging (do first, no architectural risk)

```mermaid
flowchart TD
    BIN["1. Add bin field<br/>package.json → npx virgil works"] --> TSC["2. Fix vitest tsconfig<br/>0 TS errors in test files"]
    TSC --> COV["3. Remove src/coverage/<br/>build artifacts out of git"]
    COV --> VERIFY["4. Verify E2E<br/>tsc → node dist/main.js --help"]

    style BIN fill:#2b5,stroke:#333,color:#fff
    style TSC fill:#2b5,stroke:#333,color:#fff
    style COV fill:#2b5,stroke:#333,color:#fff
    style VERIFY fill:#47a,stroke:#333,color:#fff
```

| # | Item | What | Risk |
|---|------|------|------|
| 1 | `bin` field | Add `"bin": {"virgil": "./dist/main.js"}` + shebang | Low |
| 2 | vitest tsconfig | Configure vitest globals → 0 TS errors | Low |
| 3 | coverage cleanup | `git rm -r --cached src/coverage/` + .gitignore | Trivial |
| 4 | build verify | `tsc && node dist/main.js --help` + 188 tests | Verification |

### Phase 1b — AGENTS.md Restoration (completed 2026-08-31)

AGENTS.md lost all orchestration, token economy, and sub-agent management
sections during the Go → TypeScript pivot. Restored from git history
(commit `9e1df9f`) and adapted:

- **Model Assignment Policy** — generic tier names (search/implement/architect)
  instead of vendor model names
- **Orchestrator-Minion Pattern** — briefing contract, result contract,
  anti-patterns, references (POSA, MapReduce, Sagas, Temporal)
- **Orchestration Protocol** — pure orchestrator, circuit breaker, PDC
- **FORMO-CODE** — adapted Go → TypeScript/NestJS
- **FORMO-TEST** — adapted Go → TypeScript/Vitest (zero-mock, app-level)
- **FORMO-ANTI-DRIFT** — language-agnostic, restored verbatim
- **Echo System** — adapted Go → TypeScript/npm pipeline
- **Anti-Rationalization Protocol** — restored verbatim
- **Architecture Map** — Principia > Dogma > Runtime precedence
- **Commit Conventions** — conventional commits, no AI attribution

### Phase 2 — MCP Removal + CLI Planning Commands (architectural)

```mermaid
flowchart TD
    REMOVE["5. Remove MCP dependency<br/>skills invoke CLI, not MCP tools"] --> WRITE_CMD["6. Add virgil write command<br/>CLI equivalent of virgil_write"]
    WRITE_CMD --> TRANS_CMD["7. Add virgil transition command<br/>CLI equivalent of virgil_transition"]
    TRANS_CMD --> AGENTS["8. Update AGENTS.md<br/>reflect current 18-command surface"]

    style REMOVE fill:#c94,stroke:#333,color:#fff
    style WRITE_CMD fill:#c94,stroke:#333,color:#fff
    style TRANS_CMD fill:#c94,stroke:#333,color:#fff
    style AGENTS fill:#c94,stroke:#333,color:#fff
```

| # | Item | What | Risk |
|---|------|------|------|
| 5 | MCP removal | Update virgil skills to invoke CLI instead of MCP tools | Medium |
| 6 | `write` command | Create/update docs (idea, requirement, design, task) via CLI | Medium |
| 7 | `transition` command | Task lifecycle transitions via CLI | Low |
| 8 | AGENTS.md update | Reflect full command surface including new planning commands | Low |

### Phase 3 — Principia Audit + V1 (deferred)

| # | Item | What | Risk |
|---|------|------|------|
| 9 | Principia adversarial audit | Verify all 12 sections against current implementation | High |
| 10 | V1 declaration | Version bump, npm publish readiness, changelog | Medium |

[↑ Back to top](#course-correction--v1-readiness)

## Sequence

```mermaid
gantt
    title V1 Readiness Correction Sequence
    dateFormat YYYY-MM-DD

    section Phase 1 — Packaging
        bin field + shebang       :p1a, 2026-08-31, 1d
        vitest tsconfig fix       :p1b, 2026-08-31, 1d
        coverage cleanup          :p1c, 2026-08-31, 1d
        build E2E verification    :p1d, after p1a, 1d

    section Phase 2 — MCP→CLI
        Remove MCP dependency     :p2a, after p1d, 1d
        write command             :p2b, after p2a, 2d
        transition command        :p2c, after p2a, 1d
        AGENTS.md update          :p2d, after p2b, 1d

    section Phase 3 — Audit + V1
        Principia audit           :p3a, after p2d, 2d
        V1 declaration            :p3b, after p3a, 1d
```

Phase 1 items are independent and parallelizable. Phase 2 depends on Phase 1
completion (need working CLI first). Phase 3 depends on Phase 2 (need
complete command surface before auditing compliance).

[↑ Back to top](#course-correction--v1-readiness)
