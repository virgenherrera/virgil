<!-- Virgil Principia
section_id: "11a-11b"
title: "How it executes — pipeline and contracts first"
source: "principia/constitution.md"
source_lines: [1418, 1475]
layer: execution
constitutional: true
actors: [Agent, Virgil]
glossary_terms: [PlanningGapDetected]
depends_on: ["7a", "7e", "3a", "7c-rgr", "10"]
referenced_by: ["11c", "11d", "11e-routing", "11f"]
keywords:
  - prePhase
  - Red
  - Green
  - Refactor
  - Verify
  - contracts first
  - parallelism
  - lanes
  - PlanningGapDetected
  - exit gate
  - execution sub-phases
editorial_additions: [context_paragraph]
-->

> **Context:** After planning produces an approved handoff, execution transforms that handoff into a candidate implementation and Verify certifies it against the guardrails defined in META.json. Virgil observes the execution but does not direct it.

## 11. How it executes

After planning produces an approved handoff, execution
transforms that handoff into a candidate implementation and **Verify**
certifies it against the guardrails defined in META.json (allowed paths,
forbidden paths, file/line count limits). Virgil
OBSERVES — it does not direct, it does not implement. It emits
PlanningGapDetected if it detects gaps.

### 11a. Execution pipeline

> **[Architectural provision — not yet implemented in full. The current runtime treats `execution` as a single opaque state. The sub-phase model below is the target architecture; the state machine will be extended to track these sub-phases within the `execution` state.]**

Five sequential phases. Each phase has its exit gate.

```mermaid
flowchart LR
    PRE["prePhase\nContracts:\nAPIs, schemas,\ninterfaces"]
    RED["Red\nEntire test\nsuite\n(all fail)"]
    GREEN["Green\nCode that\npasses tests\n(all pass)"]
    REFACTOR["Refactor\nMechanical\nverification\n(metrics OK)"]
    VERIFY["Verify\nCertification\n(audit gate)"]

    PRE --> RED --> GREEN --> REFACTOR --> VERIFY

    style PRE fill:#777,stroke:#333,color:#fff
    style RED fill:#c44,stroke:#333,color:#fff
    style GREEN fill:#4a4,stroke:#333,color:#fff
    style REFACTOR fill:#47a,stroke:#333,color:#fff
    style VERIFY fill:#2b5,stroke:#333,color:#fff
```

| Phase | What it produces | Exit gate |
|------|-------------|----------------|
| prePhase | Source contracts (OpenAPI source, schemas, interfaces) | All contracts defined |
| Red | Complete test suite | All fail (valid red) |
| Green | Implementation | All pass |
| Refactor | Metrics within threshold | Mutation, CRAP, complexity OK |
| Verify | Certification | Audit gates + structured verification (see 7e) |

**Current runtime**: the `execution` state in `HandoffStateMachine` is monolithic. The transition `execution → verify` requires `AGENT_OUTPUT.md` to exist. Sub-phase tracking within execution is a planned extension.

### 11b. Contracts first — parallelism enabler

prePhase defines contracts BEFORE implementing. This allows
multiple lanes to work in parallel against the same interface.

```mermaid
flowchart TD
    CONTRACTS["prePhase\nAPIs, schemas, interfaces\n(defined and approved)"]

    CONTRACTS --> LANE1["Lane A\n(frontend)"]
    CONTRACTS --> LANE2["Lane B\n(backend)"]
    CONTRACTS --> LANE3["Lane C\n(infra)"]

    LANE1 & LANE2 & LANE3 -->|"merge"| INTEGRATION["Integration\n(cross tests)"]

    style CONTRACTS fill:#47a,stroke:#333,color:#fff
    style INTEGRATION fill:#4a4,stroke:#333,color:#fff
```
