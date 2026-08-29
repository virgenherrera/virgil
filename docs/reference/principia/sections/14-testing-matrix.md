<!-- Virgil Principia
section_id: "7d-tiers"
title: "Testing Matrix — boundary model"
source: "principia/constitution.md"
source_lines: [712, 750]
layer: quality
constitutional: true
actors: []
glossary_terms: [Testing Matrix, File/Unit, Module/Integration, App/Service, Solution/E2E, Performance/Load, T0, T1, T2]
depends_on: [7c-rgr]
referenced_by: [7d-binding, 7e, 7f]
keywords:
  - testing matrix
  - mock boundary
  - testing pyramid
  - App/Service primary tier
  - Solution E2E
  - zero mocks
  - T0 protocol app replay
  - T1 agent-in-the-loop
  - T2 host-adapter conformance
editorial_additions: [context_paragraph]
-->

> **Context:** Belongs to chapter 7 ("How it guarantees quality"), immediately after the Red/Green/Refactor cycle (7c). It defines where the mock boundary must be placed for a test to have value, replacing the classic testing pyramid with a boundary model.

### 7d. Testing Matrix — boundary model

The value of a test depends on WHERE the mock boundary is placed,
not on the classic pyramid.

```mermaid
flowchart TD
    subgraph PROHIBIDO["PROHIBITED"]
        FILE["File / Unit\nInternal mocks\nvalue = 0"]
    end

    subgraph DERIVADO["DERIVED (not developed)"]
        MODULE["Module / Integration\nFiltered from appTests"]
        SMOKE["Regression / Smoke\nDerived by tags"]
    end

    subgraph EXPLICITO["EXPLICIT DEVELOPMENT"]
        APP["App / Service\nReal stack, no mocks\nPRIMARY tier\nHigh coverage mandatory"]
        E2E["Solution / E2E\nMulti-service, zero mocks\nDeploys, tags, merges"]
    end

    subgraph CONDICIONAL["CONDITIONAL"]
        PERF["Performance / Load\nOnly if design.md\ndeclares SLAs"]
    end

    FILE -.->|"replaced by"| APP
    MODULE -.->|"derived from"| APP
    SMOKE -.->|"derived from"| APP & E2E

    style PROHIBIDO fill:#c44,stroke:#333,color:#fff
    style DERIVADO fill:#777,stroke:#333,color:#fff
    style EXPLICITO fill:#4a4,stroke:#333,color:#fff
    style CONDICIONAL fill:#a74,stroke:#333,color:#fff
```

Virgil's current dogma also defines T0 (protocol/app replay),
T1 (agent-in-the-loop) and T2 (host-adapter conformance) as
specific levels for validating Virgil itself.
