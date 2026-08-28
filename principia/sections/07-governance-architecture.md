<!-- Virgil Principia
section_id: "4"
title: "Why it acts this way — Governance and Architecture"
source: "principia/constitution.md"
source_lines: [332, 416]
layer: principles
constitutional: true
actors: []
glossary_terms: [Governance, Architecture, Principia, Development Mode, Consumption Mode, ARCH]
depends_on: ["3b"]
referenced_by: ["5", "7e", "11d"]
keywords:
  - governance
  - architecture
  - governance principles
  - architectural invariants
  - constraint over trust
  - parallel handoff
  - deterministic mechanical gates
  - identity before inference
  - end-to-end traceability
  - Development Mode
  - Consumption Mode
-->

**In this chunk:**
- [4a. Governance — HOW it is governed](#4a-governance--how-it-is-governed)
- [4b. Architecture — HOW it is built](#4b-architecture--how-it-is-built)
- [4c. How the two layers relate](#4c-how-the-two-layers-relate)

## 4. Why it acts this way

[↑ Back to index](../README.md)

Two complementary layers of principles. They are not mixed.

### 4a. Governance — HOW it is governed

```mermaid
flowchart TD
    GP1["GP-1. e2e Methodology"]
    GP2["GP-2. Traceability + strength"]
    GP3["GP-3. Higher-level management"]
    GP4["GP-4. Constraint > trust"]
    GP5["GP-5. Parallel handoff"]
    GP6["GP-6. Deterministic\nmechanical gates"]

    GP1 --- GP2 --- GP3
    GP4 --- GP5 --- GP6

    style GP1 fill:#47a,stroke:#333,color:#fff
    style GP2 fill:#47a,stroke:#333,color:#fff
    style GP3 fill:#47a,stroke:#333,color:#fff
    style GP4 fill:#47a,stroke:#333,color:#fff
    style GP5 fill:#47a,stroke:#333,color:#fff
    style GP6 fill:#47a,stroke:#333,color:#fff
```

| # | Principle | In one sentence |
|---|-----------|-------------|
| 1 | e2e Methodology | Idea → certified code → operation. No jumps. |
| 2 | Traceability + strength | It is not enough for the link to exist; it must be strong. |
| 3 | Higher-level management | Health dashboard, not line-by-line review. |
| 4 | Constraint > trust | Enforceable constraints and gates, not agent promises. |
| 5 | Parallel handoff | Claiming over a handoff, not separate handoffs. |
| 6 | Deterministic mechanical gates | Binary at execution: passes or does not pass. Planning and escalation involve judgment; structured verification (ARCH) remains bounded and traceable (see 7e). |

### 4b. Architecture — HOW it is built

```mermaid
flowchart TD
    A1["1. Identity before\ninference"]
    A2["2. Authority separate\nfrom retrieval"]
    A3["3. Context compiled\nby contract"]
    A4["4. e2e traceability"]
    A5["5. Planning !=\nexecution"]
    A6["6. Host and Store are\ndistinct adapters"]
    A7["7. Incremental\ndelivery"]
    A8["8. Control plane separate\nfrom ceremony"]
    A9["9. Dogma separate\nfrom operational RAG"]

    A1 --- A2 --- A3
    A4 --- A5 --- A6
    A7 --- A8 --- A9

    style A1 fill:#a74,stroke:#333,color:#fff
    style A2 fill:#a74,stroke:#333,color:#fff
    style A3 fill:#a74,stroke:#333,color:#fff
    style A4 fill:#a74,stroke:#333,color:#fff
    style A5 fill:#a74,stroke:#333,color:#fff
    style A6 fill:#a74,stroke:#333,color:#fff
    style A7 fill:#a74,stroke:#333,color:#fff
    style A8 fill:#a74,stroke:#333,color:#fff
    style A9 fill:#a74,stroke:#333,color:#fff
```

### 4c. How the two layers relate

```mermaid
flowchart TD
    GOB["Governance\n6 principles\ndefines the RULES OF THE GAME"]
    ARQ["Architecture\n9 invariants\ndefines the RULES OF CONSTRUCTION"]

    GOB --> PRINCIPIA["Principia"]
    ARQ --> PRINCIPIA
    PRINCIPIA --> MD["Development Mode"]
    PRINCIPIA --> MC["Consumption Mode"]

    style GOB fill:#47a,stroke:#333,color:#fff
    style ARQ fill:#a74,stroke:#333,color:#fff
    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
```

Both layers of principles converge in the Principia. What remains is to
know their components: what pieces implement these rules.
