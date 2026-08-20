<!-- Virgil Principia
section_id: "2"
title: "Como es (estructura)"
source: "principia/overview.md"
source_lines: [194, 234]
layer: structure
constitutional: true
actors: []
glossary_terms: [Principia, Dogma, Runtime, Kernel, Method Pack, Ledger, Tracer]
depends_on: []
referenced_by: []
keywords:
  - estructura
  - tres capas concentricas
  - Principia
  - Dogma
  - Runtime
  - arquitectura
editorial_additions: [context_paragraph]
-->

> **Context:** Esta seccion describe la arquitectura de tres capas concentricas de Virgil — Principia, Dogma y Runtime — donde cada capa interna gobierna a las externas.

## 2. Como es (estructura)

[↑ Volver al indice](../README.md)

Tres capas concentricas. Cada capa interna gobierna a las externas.

```mermaid
flowchart TD
    subgraph PRINCIPIA["Principia (inmutable)"]
        direction LR
        GOB["Gobierno\n6 principios"]
        ACT["Actores y Modos\n3 actores, 2 modos"]
        DEL["Delegacion + PDC\nContratos, checkpoints"]
        EXEC["Ejecucion + Calidad\nEcho, R/G/R, Fitness"]
    end

    subgraph DOGMA["Dogma (docs/ — normativo, versionado)"]
        direction LR
        ARCH["Arquitectura\n9 invariantes"]
        PROTO["Protocolo\nContratos, boundaries"]
        QUAL["Quality\nValidacion, gates"]
        SLICES["Slices\nEntrega incremental"]
    end

    subgraph RUNTIME["Runtime (binario Go)"]
        direction LR
        KERNEL["Kernel\nLedger, Tracer, Context"]
        ADAPTERS["Adapters\nHost, Store"]
        PACKS["Method Packs\nCeremonia, roles, gates"]
    end

    PRINCIPIA -->|"gobierna"| DOGMA
    DOGMA -->|"define contratos para"| RUNTIME

    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
    style DOGMA fill:#47a,stroke:#333,color:#fff
    style RUNTIME fill:#a74,stroke:#333,color:#fff
```

Con esta estructura inmutable como cimiento, Virgil se manifiesta a través de ciclos de vida predecibles: una máquina de estados que rige proyectos y un flujo de invocación que garantiza trazabilidad en cada transición.
