<!-- Virgil Principia
section_id: "4"
title: "Por que actua asi — Gobierno y Arquitectura"
source: "principia/constitution.md"
source_lines: [332, 416]
layer: principles
constitutional: true
actors: []
glossary_terms: [Gobierno, Arquitectura, Principia, Modo Desarrollo, Modo Consumo, ARCH]
depends_on: ["3b"]
referenced_by: ["5", "7e", "11d"]
keywords:
  - gobierno
  - arquitectura
  - principios de gobierno
  - invariantes arquitectonicas
  - constraint sobre confianza
  - handoff paralelo
  - gates mecanicas deterministas
  - identidad antes que inferencia
  - trazabilidad end-to-end
  - Modo Desarrollo
  - Modo Consumo
-->

**En este chunk:**
- [4a. Gobierno — COMO se gobierna](#4a-gobierno--como-se-gobierna)
- [4b. Arquitectura — COMO se construye](#4b-arquitectura--como-se-construye)
- [4c. Como se relacionan las dos capas](#4c-como-se-relacionan-las-dos-capas)

## 4. Por que actua asi

[↑ Volver al indice](../README.md)

Dos capas de principios complementarias. No se mezclan.

### 4a. Gobierno — COMO se gobierna

```mermaid
flowchart TD
    GP1["GP-1. Metodologia e2e"]
    GP2["GP-2. Trazabilidad + fortaleza"]
    GP3["GP-3. Gestion nivel superior"]
    GP4["GP-4. Constraint > confianza"]
    GP5["GP-5. Handoff paralelo"]
    GP6["GP-6. Gates mecanicas\ndeterministas"]

    GP1 --- GP2 --- GP3
    GP4 --- GP5 --- GP6

    style GP1 fill:#47a,stroke:#333,color:#fff
    style GP2 fill:#47a,stroke:#333,color:#fff
    style GP3 fill:#47a,stroke:#333,color:#fff
    style GP4 fill:#47a,stroke:#333,color:#fff
    style GP5 fill:#47a,stroke:#333,color:#fff
    style GP6 fill:#47a,stroke:#333,color:#fff
```

| # | Principio | En una frase |
|---|-----------|-------------|
| 1 | Metodologia e2e | Idea → codigo certificado → operacion. Sin saltos. |
| 2 | Trazabilidad + fortaleza | No basta que el enlace exista; debe ser fuerte. |
| 3 | Gestion nivel superior | Dashboard de salud, no revision linea a linea. |
| 4 | Constraint > confianza | Constraints enforceables y gates, no promesas del agente. |
| 5 | Handoff paralelo | Claiming sobre un handoff, no handoffs separados. |
| 6 | Gates mecanicas deterministas | Binario en ejecucion: pasa o no pasa. Planning y escalacion involucran juicio; la verificacion estructurada (ARCH) queda acotada y trazable (ver 7e). |

### 4b. Arquitectura — COMO se construye

```mermaid
flowchart TD
    A1["1. Identidad antes\nque inferencia"]
    A2["2. Autoridad separada\nde retrieval"]
    A3["3. Contexto compilado\npor contrato"]
    A4["4. Trazabilidad e2e"]
    A5["5. Planning !=\nexecution"]
    A6["6. Host y Store son\nadapters distintos"]
    A7["7. Entrega\nincremental"]
    A8["8. Control plane separado\nde ceremonia"]
    A9["9. Dogma separado\nde RAG operativo"]

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

### 4c. Como se relacionan las dos capas

```mermaid
flowchart TD
    GOB["Gobierno\n6 principios\ndefine las REGLAS DEL JUEGO"]
    ARQ["Arquitectura\n9 invariantes\ndefine las REGLAS DE CONSTRUCCION"]

    GOB --> PRINCIPIA["Principia"]
    ARQ --> PRINCIPIA
    PRINCIPIA --> MD["Modo Desarrollo"]
    PRINCIPIA --> MC["Modo Consumo"]

    style GOB fill:#47a,stroke:#333,color:#fff
    style ARQ fill:#a74,stroke:#333,color:#fff
    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
```

Ambas capas de principios confluyen en el Principia. Lo que falta es conocer sus componentes: qué piezas implementan estas reglas.
