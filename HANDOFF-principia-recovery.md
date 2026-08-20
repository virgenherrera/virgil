# Handoff: Principia → RAG-Friendly Knowledge Base

## Contexto

El Principia (`principia/overview.md`) esta **sellado** — commit `1d2dfa7`,
3 rondas adversariales, 0 issues MAJOR pendientes. Es el documento
constitucional inmutable que define todo lo que Virgil es, hace y por que.

Problema: 1772 lineas monoliticas no son consumibles por un RAG. El CLI
de Virgil (Go + MCP) necesita chunks autocontenidos con metadata
machine-readable para routing de queries, compilacion de ContextBriefs
y validacion de compliance.

## Mision actual

Descomponer `principia/overview.md` en **chunks RAG-friendly** que:

1. Sean autocontenidos (cada chunk se entiende sin leer el resto)
2. Tengan frontmatter machine-readable (para CLI discovery y routing)
3. Preserven trazabilidad al overview sellado (line ranges)
4. Incluyan diagramas mermaid relevantes
5. Soporten queries semanticas (keywords, layer, actors)
6. Sirvan como fuente de verdad tanto para Virgil-como-producto (Modo
   Desarrollo) como para proyectos-que-usan-Virgil (Modo Consumo)

## Arquitectura propuesta

```
principia/
  overview.md              # Sellado, inmutable. Fuente constitucional
  manifest.yaml            # Indice machine-readable para CLI discovery
  sections/                # Chunks RAG-friendly
    identity.md            # Seccion 1: Que es Virgil
    anti-drift.md          # Seccion 1a: Regla anti-drift
    structure.md           # Seccion 2: Tres capas
    ...39 chunks total
```

### Frontmatter schema (por chunk)

```yaml
---
section_id: "7a"
title: "Echo System"
source: "principia/overview.md"
source_lines: [554, 585]
layer: quality              # identity | structure | lifecycle | principles |
                            # components | interaction | quality | knowledge |
                            # context | recovery | execution | operation | authority
constitutional: true        # mecanismo no-overrideable?
actors: [SM, Virgil]
glossary_terms: [Echo System, EchoRun]
depends_on: []
referenced_by: [1a, 7b, 7h, 8c, 11a, 11f]
keywords:
  - Echo System
  - pipeline
  - determinista
  - Setup Build Static Dynamic E2E
---
```

### manifest.yaml (indice para CLI)

```yaml
version: 1
source: principia/overview.md
source_commit: 1d2dfa7
chunks:
  - id: identity
    file: sections/identity.md
    section_id: "1"
    layer: identity
    constitutional: true
  - id: echo-system
    file: sections/echo-system.md
    section_id: "7a"
    layer: quality
    constitutional: true
  # ...39 entries
cross_cutting:
  - name: certification-chain
    sections: [7b, 8c, 8f, 11f]
    description: watermark → sourceRevision → buildArtifactSet → EchoRun
  - name: mutation-domain
    sections: [7c, 8f, 11c]
    description: aislamiento, compositeAgent, worktrees
  # ...8 concerns
glossary_index:
  Echo System: echo-system
  watermark: rag-watermark
  compositeAgent: composite-agent
  # ...31 entries
```

## Inventario de chunks (39)

| # | Secciones | Titulo | Capa | Const? |
|---|-----------|--------|------|--------|
| 1 | indice | Navegacion del documento | navigation | no |
| 2 | vocab | Vocabulario de actores | identity | si |
| 3 | 1 | Que es Virgil (identidad) | identity | si |
| 4 | 1a | Regla anti-drift interpretativa | identity | si |
| 5 | 2 | Estructura de tres capas | structure | si |
| 6 | 3a | Ciclo de vida de un proyecto | lifecycle | no |
| 7 | 3b | Flujo de una invocacion | lifecycle | si |
| 8 | 4a+4b+4c | Gobierno + Arquitectura | principles | si |
| 9 | 5 | Catalogo de componentes | components | si |
| 10 | 6a+6b+6c | Modelo de interaccion | interaction | si |
| 11 | 7a | Echo System | quality | si |
| 12 | 7b | Deliverables vs Build Artifacts | quality | si |
| 13 | 7c (R/G/R) | Macro Red/Green/Refactor | quality | si |
| 14 | 7c (composite) | compositeAgent y mutation domains | quality | si |
| 15 | 7d (tiers) | Testing Matrix | quality | si |
| 16 | 7d (binding) | Trazabilidad + Binding Layer | quality | si |
| 17 | 7e | QA / Acceptance Gates | quality | si |
| 18 | 7f | droppableCode | quality | si |
| 19 | 7g | complianceByDesign | quality | no |
| 20 | 7h (pinning) | versionPinning + securityAudit | quality | si |
| 21 | 7h (bump) | bumpDependencies | quality | si |
| 22 | 8 intro+8a+8b | Conocimiento, ArtifactStore, namespaces | knowledge | si |
| 23 | 8c (DBMS) | RAG como DBMS | knowledge | si |
| 24 | 8c (watermark) | Watermark, drift, re-sync | knowledge | si |
| 25 | 8c (dual) | devRag vs consumerRag | knowledge | no |
| 26 | 8d+8e | Visibilidad + Memoizacion | knowledge | si |
| 27 | 8f (concepto) | codebaseMemory concepto | knowledge | si |
| 28 | 8f (construccion) | codebaseMemory construccion | knowledge | si |
| 29 | 9a+9b+9c | Flujo de contexto | context | si |
| 30 | 10 | Recuperacion | recovery | si |
| 31 | 11a+11b | Pipeline de ejecucion + contratos | execution | si |
| 32 | 11c | Git strategy | execution | si |
| 33 | 11d | Verificacion mecanica | execution | si |
| 34 | 11e (accept) | Accept/Reject routing | execution | si |
| 35 | 11e (break-glass) | Break-glass | execution | no |
| 36 | 11f | Evidencia queryable | execution | si |
| 37 | 12a+12b+12c | Fase de operacion | operation | no |
| 38 | auto-ref+autoridad | Autoridad y auto-referencia | authority | si |
| 39 | glosario | Glosario completo | reference | si |

## Cross-cutting concerns (8)

| Concern | Secciones | Por que importa |
|---------|-----------|-----------------|
| PDC vs Echo disambiguation | 3b, 7a, 9c | Confusion frecuente: PDC es safeguard, Echo es pipeline |
| Certification chain | 7b, 8c, 8f, 11f | watermark → sourceRevision → buildArtifactSet |
| Mutation domain | 7c, 8f, 11c | Aislamiento, compositeAgent, worktrees |
| Determinista vs juicio | 3b, 7e, 9a, 11d | Que es mecanico y que requiere evaluacion |
| MIM authority | vocab, 7f, 7g, 11e | Donde MIM tiene veto explicitio |
| PlanningGapDetected | 3a, 11c, 11e | Senal de escalacion transversal |
| Modos operativos | 6a, 8c, auto-ref | Desarrollo vs Consumo dualidad |
| Binding Layer progression | 7d, 11f | declared → inferred → verified |

## Datos del analisis

- 44 diagramas mermaid mapeados a sus secciones
- 31 entradas de glosario mapeadas a secciones primarias
- Estimacion: ~19,000 tokens totales de contenido en chunks

## Ejecucion

### Fase 1 — Estructura (actual)
- [x] Sellar overview.md
- [x] Mover HANDOFF a root
- [x] Eliminar satelites legacy (6 archivos)
- [x] Analisis estructural completo (39 chunks, metadata)
- [x] Aprobacion MIM de la arquitectura propuesta
- [x] Crear `principia/sections/` y `principia/manifest.yaml`

### Fase 2 — Extraccion
- [x] Generar los 39 chunks con frontmatter
- [x] Generar manifest.yaml
- [x] Validacion adversarial (cross-refs, completeness, self-containment)

### Fase 3 — Cierre
- [ ] PR a main
- [ ] Engram: archivar estado final

## Restricciones

- `overview.md` es INMUTABLE — los chunks se derivan, no lo reemplazan
- Cada chunk debe ser autocontenido (comprensible sin leer otros chunks)
- Cross-cutting concerns se resuelven con notas de disambiguation en
  CADA chunk afectado, no con un documento central
- El manifest.yaml es la fuente de verdad para routing del CLI
- Ningun chunk puede contradecir al overview — son proyecciones, no
  interpretaciones

## Roadmap macro (actualizado)

```mermaid
flowchart LR
    P0["0. Sellar overview\nCOMPLETADO"] --> P1["1. Consolidar Principia\nRAG-friendly chunks\nEN PROGRESO"]
    P1 --> P2["2. Takeover\n(Virgil a Virgil)\nFUERA DE SCOPE"]

    style P0 fill:#4a4,stroke:#333,color:#fff
    style P1 fill:#f96,stroke:#333
    style P2 fill:#ddd,stroke:#999
```

## Estado actual

- Branch: `fix/meta-dogma-actors-modes`
- Commit sellado: `1d2dfa7`
- Stash: `stash@{0}` — `.ctx/` (CI/CD context, label: ctx-rc11-cicd-on-hold)
- Tests: 51/51 green (no se toca codigo en este paso)
- Paso activo: **1, Fase 3** — PR a main y cierre
