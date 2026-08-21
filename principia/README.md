# Virgil — Principio Fundador

Documento ancla. Todo lo que Virgil es, hace y por que lo hace.
Si algo contradice la [constitution](constitution.md), la constitution gana.

> Este README es un indice de navegacion sobre los chunks RAG-friendly
> bajo `sections/`. La fuente de verdad constitucional es
> [`constitution.md`](constitution.md) (sealed, immutable).

## Indice

### Vocabulario y actores
- [Vocabulario de actores](sections/01-vocabulary.md) — MIM, SM, TPM, PDC, compositeAgent

### 1. Que es Virgil
- [Que es Virgil](sections/02-identity.md) — knowledge/control plane, identidad
- [Regla anti-drift interpretativa](sections/03-anti-drift.md) — prevencion de desviacion semantica

### 2. Como es (estructura)
- [Estructura de tres capas](sections/04-structure.md) — Principia, Kernel, Method Pack

### 3. Como actua
- [Ciclo de vida de un proyecto](sections/05-lifecycle.md) — maquina de estados, FastForward, PlanningGapDetected
- [Flujo de una invocacion](sections/06-invocation-flow.md) — pipeline determinista, PDC

### 4. Por que actua asi
- [Gobierno y arquitectura](sections/07-governance-architecture.md) — GP-1..GP-6 + A1..A9

### 5. Que partes lo componen
- [Catalogo de componentes](sections/08-components.md) — Kernel, Method Pack, Ledger, RAG

### 6. Como interactuan las partes
- [Modelo de interaccion](sections/09-interaction-model.md) — actores, modos, separacion de concerns, invariante

### 7. Como garantiza calidad
- [Echo System](sections/10-echo-system.md) — pipeline de 5 pasos
- [Deliverables vs Build Artifacts](sections/11-deliverables-vs-artifacts.md) — EchoRun, buildArtifactSet, sourceRevision
- [Macro Red/Green/Refactor](sections/12-red-green-refactor.md) — TDD por lotes
- [compositeAgent y mutation domains](sections/13-composite-agent.md) — aislamiento de ejecucion
- [Testing Matrix](sections/14-testing-matrix.md) — modelo de boundaries por tier
- [Binding Layer y trazabilidad](sections/15-binding-layer.md) — declared, inferred, verified
- [QA / Acceptance Gates](sections/16-qa-gates.md) — certificacion, CRAP score
- [droppableCode](sections/17-droppable-code.md) — cobertura como herramienta
- [complianceByDesign](sections/18-compliance-by-design.md) — compliance como efecto secundario
- [versionPinning y securityAudit](sections/19-supply-chain-pinning.md) — Supply Chain Integrity
- [bumpDependencies](sections/20-supply-chain-bump.md) — ciclo de actualizacion controlada

### 8. Donde vive el conocimiento
- [Donde vive el conocimiento](sections/21-knowledge-storage.md) — ArtifactStore, namespaces
- [RAG como DBMS](sections/22-rag-dbms.md) — proyeccion queryable
- [Watermark y re-sync](sections/23-rag-watermark.md) — integridad de proyecciones
- [devRag vs consumerRag](sections/24-rag-dual.md) — RAG dual
- [Visibilidad y memoizacion](sections/25-visibility-memoization.md) — visibilidad escalonada
- [codebaseMemory concepto](sections/26-codebase-memory-concept.md) — grafo estructural AST
- [codebaseMemory construccion](sections/27-codebase-memory-construction.md) — build y mantenimiento

### 9. Como fluye el contexto
- [Flujo de contexto](sections/28-context-flow.md) — ContextBrief, delegationContract, PDC

### 10. Como se recupera
- [Recuperacion](sections/29-recovery.md) — estado persistido, reconstruccion

### 11. Como se ejecuta
- [Pipeline de ejecucion](sections/30-execution-pipeline.md) — contratos primero, paralelismo
- [Git strategy](sections/31-git-strategy.md) — aislamiento, trazabilidad
- [Verificacion mecanica](sections/32-mechanical-verification.md) — review humano condicional
- [Accept/Reject routing](sections/33-accept-reject.md) — certificacion por gates
- [Break-glass](sections/34-break-glass.md) — lane de emergencia
- [Evidencia queryable](sections/35-evidence-queryable.md) — evidencia como dato

### 12. Como opera (opcional)
- [Fase de operacion](sections/36-operation.md) — activacion, adapters, escalacion

### Autoridad
- [Autoridad y auto-referencia](sections/37-authority.md) — regla constitucional

### Glosario
- [Glosario](sections/38-glossary.md) — 46 terminos canonicos

## Validacion de integridad

```bash
./principia/validate-chunks.sh
```

Verifica watermark, existencia de archivos, integridad del grafo de
dependencias y consistencia del glosario.

## Taxonomia de layers

El [manifest](manifest.yaml) clasifica cada chunk en uno de 15 layers:
navigation, identity, structure, lifecycle, principles, components,
interaction, quality, knowledge, context, recovery, execution,
operation, authority, reference. Usar para filtrado y routing en CLI.

---

**Navegacion**: [Indice del overview original](sections/00-navigation.md) ·
[Manifest (CLI discovery)](manifest.yaml)
