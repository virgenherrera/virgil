<!-- Virgil Principia
section_id: "2"
title: "How it is (structure)"
source: "principia/constitution.md"
source_lines: [194, 234]
layer: structure
constitutional: true
actors: []
glossary_terms: [Principia, Dogma, Runtime, Provider, Handoff, Ledger]
depends_on: ["vocabulary", "1"]
referenced_by: ["5", "6"]
keywords:
  - structure
  - three concentric layers
  - Principia
  - Dogma
  - Runtime
  - architecture
editorial_additions: [context_paragraph]
-->

> **Context:** This section describes Virgil's three-concentric-layer architecture — Principia, Dogma and Runtime — where each inner layer governs the outer ones.

## 2. How it is (structure)

[↑ Back to index](../README.md)

Three concentric layers. Each inner layer governs the outer ones.

```mermaid
flowchart TD
    subgraph PRINCIPIA["Principia (immutable)"]
        direction LR
        GOB["Governance\n6 principles"]
        ACT["Actors and Modes\n3 actors, 2 modes"]
        DEL["Delegation + PDC\nContracts, checkpoints"]
        EXEC["Execution + Quality\nEcho, R/G/R, Fitness"]
    end

    subgraph DOGMA["Dogma (docs/ — normative, versioned)"]
        direction LR
        ARCH["Architecture\n9 invariants"]
        PROTO["Protocol\nContracts, boundaries"]
        QUAL["Quality\nValidation, gates"]
        SLICES["Slices\nIncremental delivery"]
    end

    subgraph RUNTIME["Runtime (TypeScript CLI)"]
        direction LR
        SERVICES["Core Services\nHandoff, Audit, Ledger,\nRefResolver"]
        PROVIDERS["Providers\nDogma, Ticket, Org,\nSourceCode, Chat"]
        COMMANDS["CLI Commands\nstatus, context, handoff,\naudit, watch, insights"]
    end

    PRINCIPIA -->|"governs"| DOGMA
    DOGMA -->|"defines contracts for"| RUNTIME

    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
    style DOGMA fill:#47a,stroke:#333,color:#fff
    style RUNTIME fill:#a74,stroke:#333,color:#fff
```

With this immutable structure as foundation, Virgil manifests through predictable lifecycles: a state machine that governs projects and an invocation flow that guarantees traceability at every transition.
