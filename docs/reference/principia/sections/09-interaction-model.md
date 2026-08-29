<!-- Virgil Principia
section_id: "6"
title: "How the parts interact"
source: "principia/constitution.md"
source_lines: [462, 534]
layer: interaction
constitutional: true
actors: [Developer, Implementer]
glossary_terms: [Development Mode, Consumption Mode, Principia, Provider, global ownership, global context injection]
depends_on: ["5", "vocabulary", "1", "2"]
referenced_by: ["authority"]
keywords:
  - actors and modes
  - Development Mode
  - Consumption Mode
  - separation of concerns
  - Provider
  - CLI
  - global ownership
  - global context injection
  - fundamental invariant
editorial_additions: [context_paragraph]
-->

> **Context:** Core services and providers are the components described in section 5 (parts catalog); here we show how those components and Virgil's two operational modes interact with each other without mixing responsibilities.

**In this chunk:**
- [6a. Actors and modes](#6a-actors-and-modes)
- [6b. Separation of concerns](#6b-separation-of-concerns)
- [6c. Fundamental invariant](#6c-fundamental-invariant)

## 6. How the parts interact

[↑ Back to index](../README.md)

### 6a. Actors and modes

```mermaid
flowchart TD
    subgraph DESARROLLO["Development Mode"]
        DEV["Developer\n(Human + Agent)"]
        DEV -->|"modifies code,\ntests, dogma"| V_OBJ["Virgil\n(OBJECT)"]
    end

    subgraph CONSUMO["Consumption Mode"]
        IMPL["Implementer\n(External agent)"]
        IMPL -->|"uses via CLI\ncommands"| V_TOOL["Virgil\n(TOOL)"]
    end

    V_OBJ -.-|"same CLI\nsame contracts\nsame gates"| V_TOOL

    PRINCIPIA["Principia\n(immutable)"]
    PRINCIPIA -->|"governs"| DESARROLLO
    PRINCIPIA -->|"governs"| CONSUMO

    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
    style DESARROLLO fill:#47a,stroke:#333,color:#fff
    style CONSUMO fill:#a74,stroke:#333,color:#fff
```

### 6b. Separation of concerns

Each piece has clear ownership. They are not mixed.

```mermaid
flowchart TD
    COMMANDS["CLI Commands\nstatus | context | handoff |\naudit | watch | insights"]
    COMMANDS -->|"invoke"| SERVICES

    SERVICES["Core Services\nIdentity | Traceability | Context | Transitions"]
    SERVICES -->|"query via"| PROVIDERS
    SERVICES -->|"persist to"| FS

    PROVIDERS["Providers (plugin pattern)\nDogma | Ticket | Org |\nSourceCode | Chat"]
    FS["Filesystem\n.virgil/handoffs/ | .virgil/ledger.jsonl"]

    PROVIDERS ~~~ FS
    NOTE["Providers and persistence are INDEPENDENT concerns\na provider reads external data\npersistence writes local state"]

    style COMMANDS fill:#7a4,stroke:#333,color:#fff
    style SERVICES fill:#47a,stroke:#333,color:#fff
    style PROVIDERS fill:#a74,stroke:#333,color:#fff
    style FS fill:#a74,stroke:#333,color:#fff
    style NOTE fill:none,stroke:none
```

### 6c. Fundamental invariant

```mermaid
flowchart TD
    OWNERSHIP["global ownership\n(Virgil knows the ENTIRE\ninventory)"]
    INJECTION["global context injection\n(Virgil delivers EVERYTHING\nto each actor)"]

    OWNERSHIP -->|"!="| INJECTION

    OWNERSHIP --> CORRECTO["CORRECT:\nknowing what exists,\nwho owns it,\nwhat state it is in"]
    INJECTION --> INCORRECTO["INCORRECT:\nloading all content\ninto every prompt"]

    style CORRECTO fill:#4a4,stroke:#333,color:#fff
    style INCORRECTO fill:#c44,stroke:#333,color:#fff
```

These fundamental invariants — what Virgil knows without inflating contexts — apply identically in both operational modes, producing a notable property: Virgil is both tool and object under the same rules.
