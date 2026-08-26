# Roadmap por vertical slices

El roadmap prioriza flujos completos sobre capas abstractas aisladas. Cada
slice debe demostrar recovery, trazabilidad y aislamiento entre Virgil y el
target, además de respetar la policy del ArtifactStoreAdapter, antes de
considerarse terminado.

## Slice 1 — Planning: idea → handoff

**Baseline:** Scrum, ArtifactStoreAdapter `repo-docs` y un solo agente.

El diseño normativo, sus límites y escenarios de conformidad viven en
[Slice 1 — Planning](../slices/01-planning/README.md). Este roadmap solo fija
su posición: establecer identidad, persistencia, lifecycle, context briefs y el
flujo idea → handoff antes de tocar código, producto o configuración del target.

El [contrato del runtime Go T0](../architecture/go-runtime.md) fija el diseño de
implementación seleccionado para las primeras fixtures de este slice. Define
boundaries y gates futuros; no declara capacidad implementada ni avance del
slice.

## Slice 2 — Execution: handoff → code/tests

Entrega mínima:

- consumo del handoff sin reinterpretar planning aprobado;
- producción de tests y código en el target explícito;
- vínculos `handoff -> test -> code -> commit` cuando haya VCS disponible;
- ingestión de evidencia de ejecución;
- emisión de `PlanningGapDetected` y pausa del scope afectado.

El flujo inicial es secuencial. No necesita worktrees ni claiming distribuido.

## Slice 3 — Verify

Entrega mínima:

- verificación contra ACs y decisiones trazables;
- evidencia reproducible de tests y checks soportados por el target;
- distinción entre gate mecánico, juicio y excepción autorizada;
- resultado de verificación versionado y recuperable.

El slice define únicamente métricas necesarias para demostrar este flujo; no
un catálogo universal de calidad.

## Slice 4 — Ship y operation

Entrega mínima:

- construcción de build identificable;
- registro de intento y resultado de deploy;
- certificación vinculada al build y al deploy observados;
- estrategia mínima de rollback y evidencia post-deploy;
- documentación operativa proporcional al tipo de target;
- bugs y feedback operativos que reingresan como cambios trazables.

Operation es opcional para targets sin superficie operativa, pero ship mantiene
evidencia explícita de qué fue entregado.

## Slice 5 — Segundo host y adapters

Objetivo: demostrar agnosticismo con un segundo host real, no solo con una
segunda configuración del primero.

Entrega mínima:

- HostAdapters con declaración de capacidades y fallbacks;
- al menos un segundo ArtifactStoreAdapter externo —por ejemplo Jira,
  Confluence, Basecamp o GitHub Projects/Issues—;
- pruebas de conformidad sobre los contratos usados por los slices 1–4;
- mismo `RunContext` semántico, independientemente del host.

## Slice 6 — Method Packs

Entrega mínima:

- Scrum como pack predeterminado estable;
- packs Waterfall, Kanban y Shape Up;
- outcomes e invariantes del kernel compartidos;
- ceremonia, roles y gates propios de cada pack;
- cambio de pack explícito, versionado y sin reinterpretación silenciosa de
  artefactos aprobados.

El éxito de este slice exige que el kernel no contenga branches con nombres de
ceremonias particulares.

## Slice 7 — GraphRAG y paralelismo

Entrega mínima:

- proyecciones GraphRAG reconstruibles desde fuentes autoritativas;
- provenance visible en cada resultado de retrieval;
- leases o claiming atómico para trabajo paralelo;
- aislamiento de lanes y convergencia respaldada por evidencia;
- recovery de ejecuciones concurrentes sin depender del contexto de un agente.

GraphRAG optimiza la compilación de contexto; no reemplaza el ledger, el
ArtifactRepository ni el TraceabilityGraph autoritativo.

## Regla de avance

Un slice avanza cuando su flujo vertical funciona con identidades explícitas,
estado recuperable y evidencia trazable. Una promesa documental sin adapter ni
flujo demostrable permanece como objetivo del slice siguiente.
