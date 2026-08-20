<!-- Virgil Principia
section_id: "glossary"
title: "Glosario"
source: "principia/overview.md"
source_lines: [1742, 1779]
layer: reference
constitutional: true
actors: []
glossary_terms: [Binding Layer, Break-glass, buildArtifactSet, bumpDependencies, circuitBreaker, codebaseMemory, compositeAgent, complianceByDesign, ContextBrief, ContextCompiler, CRAP score, delegationContract, droppableCode, Echo System, EchoRun, FastForward, Kernel, Ledger, mutation domain, Method Pack, PDC, PlanningGapDetected, RAG, re-sync, securityAudit, sourceRevision, safeToAutoDelete, Supply Chain Integrity, TraceabilityGraph, versionPinning, watermark]
depends_on: []
referenced_by: []
keywords:
  - Binding Layer
  - Break-glass
  - buildArtifactSet
  - bumpDependencies
  - circuitBreaker
  - codebaseMemory
  - compositeAgent
  - complianceByDesign
  - ContextBrief
  - ContextCompiler
  - CRAP score
  - delegationContract
  - droppableCode
  - Echo System
  - EchoRun
  - FastForward
  - Kernel
  - Ledger
  - mutation domain
  - Method Pack
  - PDC
  - PlanningGapDetected
  - RAG
  - re-sync
  - securityAudit
  - sourceRevision
  - safeToAutoDelete
  - Supply Chain Integrity
  - TraceabilityGraph
  - versionPinning
  - watermark
-->

> **Context:** Este glosario recopila las definiciones canonicas de los terminos utilizados a lo largo de todo el Principia. Cada entrada referencia la seccion donde el termino se define en profundidad.

## Glosario

| Termino | Definicion |
|---------|-----------|
| Binding Layer | Tres niveles de confianza para contratos: declared (definido), inferred (derivado de evidencia), verified (confirmado por ejecucion) (seccion 7d) |
| Break-glass | Lane de emergencia para incidentes P1 que comprime ceremonia con autoridad MIM y certificacion post-hoc obligatoria (seccion 11e) |
| buildArtifactSet | Conjunto de build artifacts producidos por un EchoRun, ligados inequivocamente a una sourceRevision (seccion 7b) |
| bumpDependencies | Ciclo de mantenimiento de tres pasos (security fix → update check → security fix) para actualizar dependencias exactas sin introducir vulnerabilidades (seccion 7h) |
| circuitBreaker | Mecanismo que detiene delegaciones tras 3 fallos consecutivos y escala al MIM (seccion 9c) |
| codebaseMemory | Grafo estructural del codigo derivado de AST. Complementa al RAG con consultas de relaciones entre entidades de codigo (seccion 8f) |
| compositeAgent | Secuencia de invocaciones independientes (testEngineer → Implementor → fitnessFunction) orquestadas bajo una etiqueta comun dentro de un mutation domain aislado; worktree es una implementacion posible (seccion 7c) |
| complianceByDesign | Aserciones de forma de datos integradas en el desarrollo. Cubre exclusivamente controles tecnicos de datos (seccion 7g) |
| ContextBrief | Paquete de contexto compilado por el ContextCompiler para alimentar una delegacion. Incluye deliverables seleccionados con trazabilidad de origen (seccion 9a) |
| ContextCompiler | Componente del Kernel que selecciona y compila deliverables relevantes en un ContextBrief. Paso de juicio con superficie de alucinacion documentada (seccion 9a) |
| CRAP score | Change Risk Anti-Patterns — metrica que combina complejidad y cobertura para evaluar riesgo de cambio |
| delegationContract | Contrato de 6 campos obligatorios que acompana cada delegacion del SM: identidad (rol, tier, constraints), scope, objetivo verificable, input resuelto, output schema, reglas inyectadas como texto (seccion 9c) |
| droppableCode | Codigo con 0% de cobertura en appTests. Debe eliminarse o justificar su existencia con excepcion documentada. Ver safeToAutoDelete para eliminacion mecanica segura (seccion 7f) |
| Echo System | Pipeline de 5 pasos para la ejecucion de cada fase: Setup → Build → Static → Dynamic → E2E (seccion 7a) |
| EchoRun | Instancia concreta de ejecucion del Echo System que produce un buildArtifactSet ligado a una sourceRevision (seccion 7b) |
| FastForward | Gradiente de certeza (FF-1 a FF-4) que permite comprimir ceremonia de planning cuando la evidencia observable lo soporta (seccion 3a) |
| Kernel | Nucleo ceremonia-agnostico de Virgil. Contiene Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RAG (seccion 5) |
| Ledger | Registro inmutable de eventos, transiciones e historial del proyecto |
| mutation domain | Dominio de aislamiento donde un lane de ejecucion opera sin interferir con otros lanes concurrentes. Debe proveer filesystem aislado, deteccion de conflictos al integrar, e identidad de revision por lane. Worktrees son la implementacion de referencia (seccion 7c, 11c) |
| Method Pack | Capa de ceremonia que se monta sobre el Kernel. Define roles, flujos y gates adicionales. Pack Scrum es el unico implementado (seccion 5) |
| PDC | Post-Delegation Checkpoint: safeguard de coherencia de orquestacion (ECHO → VERIFY → MARK → DECIDE). No es gate de certificacion (seccion 3b) |
| PlanningGapDetected | Senal de escalacion cuando la ejecucion detecta un defecto de planning. Dispara re-planificacion |
| RAG | Proyeccion de lectura optimizada sobre deliverables y documentacion. No es fuente de verdad — es reconstruible (seccion 8e) |
| re-sync | Proceso que actualiza una proyeccion (RAG o codebaseMemory) al HEAD actual y avanza su watermark. Puede dispararse de forma explicita, via PR con deltas, o via hook post-merge (seccion 8c) |
| securityAudit | Gate blocking del Echo paso 1 (Setup): escaneo de vulnerabilidades sobre el arbol de dependencias. El Kernel impone la ejecucion; el Method Pack define el umbral de severidad (seccion 7h) |
| sourceRevision | Commit SHA que identifica la revision del codigo que produjo un buildArtifactSet. Debe ser alcanzable desde el watermark para que la certificacion sea valida (seccion 7b, 8c) |
| safeToAutoDelete | Subconjunto de droppableCode que cumple criterios mecanicos de eliminacion segura: sin dependientes vivos, sin ejecucion observada en N ciclos, sin cobertura transitiva. Habilita eliminacion mecanica automatica (seccion 7f) |
| Supply Chain Integrity | Tres invariantes sobre dependencias: version pinning exacto, security audit como gate, y bumpDependencies como ciclo de actualizacion controlada (seccion 7h) |
| TraceabilityGraph | Proyeccion derivada que conecta intencion → decision → trabajo → evidencia. Reconstruible desde el Ledger (seccion 5, 8e) |
| versionPinning | Invariante que requiere versiones exactas (sin rangos) para todas las dependencias y el gestor de dependencias. Garantiza reproducibilidad absoluta (seccion 7h) |
| watermark | Revision (commit SHA) contra la cual una proyeccion (RAG o codebaseMemory) fue construida o sincronizada por ultima vez. Propiedad exclusiva del Kernel. Gate de certificacion: sourceRevision debe ser alcanzable desde watermark en el grafo de commits (seccion 8c) |
