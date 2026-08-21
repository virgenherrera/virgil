<!-- Virgil Principia
section_id: "glossary"
title: "Glosario"
source: "principia/constitution.md"
source_lines: [1763, 1814]
layer: reference
constitutional: true
actors: []
glossary_terms: [AGENTS.md, ARCH, ArtifactRepository, ArtifactStoreAdapter, Binding Layer, Break-glass, buildArtifactSet, bumpDependencies, circuitBreaker, codebaseMemory, compositeAgent, complianceByDesign, consumerRag, ContextBrief, ContextCompiler, CRAP score, delegationContract, devRag, DogmaRef, droppableCode, Echo System, EchoRun, EvidenceIngestion, FastForward, HostAdapter, Kernel, Ledger, MIM, mutation domain, Method Pack, PDC, PlanningGapDetected, ProjectRef, RAG, re-sync, RetrievalProjection, RunContext, securityAudit, SM, sourceRevision, safeToAutoDelete, Supply Chain Integrity, TPM, TraceabilityGraph, versionPinning, watermark]
depends_on: []
referenced_by: []
keywords:
  - AGENTS.md
  - ARCH
  - ArtifactRepository
  - ArtifactStoreAdapter
  - Binding Layer
  - Break-glass
  - buildArtifactSet
  - bumpDependencies
  - circuitBreaker
  - codebaseMemory
  - compositeAgent
  - complianceByDesign
  - consumerRag
  - ContextBrief
  - ContextCompiler
  - CRAP score
  - delegationContract
  - devRag
  - DogmaRef
  - droppableCode
  - Echo System
  - EchoRun
  - EvidenceIngestion
  - FastForward
  - HostAdapter
  - Kernel
  - Ledger
  - MIM
  - mutation domain
  - Method Pack
  - PDC
  - PlanningGapDetected
  - ProjectRef
  - RAG
  - re-sync
  - RetrievalProjection
  - RunContext
  - securityAudit
  - SM
  - sourceRevision
  - safeToAutoDelete
  - Supply Chain Integrity
  - TPM
  - TraceabilityGraph
  - versionPinning
  - watermark
editorial_additions: [context_paragraph]
-->

> **Context:** Este glosario recopila las definiciones canonicas de los terminos utilizados a lo largo de todo el Principia. Cada entrada referencia la seccion donde el termino se define en profundidad.

## Glosario

| Termino | Definicion |
|---------|-----------|
| AGENTS.md | Archivo de discoverability publicado por Virgil en el proyecto consumidor siguiendo el Open Agentic Standard. Contiene reglas operativas inyectadas para el agente (seccion 1) |
| ARCH | Gate de alineacion arquitectonica dentro del pipeline de certificacion. Valida conformidad con los principios de arquitectura (seccion 7e, 11d) |
| ArtifactRepository | Componente del Kernel que gestiona deliverables, revisiones y procedencia. No confundir con ArtifactStoreAdapter (adapter externo) ni con el termino informal "ArtifactStore" (seccion 5) |
| ArtifactStoreAdapter | Adapter que traduce persistencia y retrieval entre el Kernel y el sistema externo de almacenamiento (repo-docs, Jira, etc.). No confundir con ArtifactRepository (componente interno del Kernel) (seccion 5, 3b) |
| Binding Layer | Tres niveles de confianza para contratos: declared (definido), inferred (derivado de evidencia), verified (confirmado por ejecucion) (seccion 7d) |
| Break-glass | Lane de emergencia para incidentes P1 que comprime ceremonia con autoridad MIM y certificacion post-hoc obligatoria (seccion 11e) |
| buildArtifactSet | Conjunto de build artifacts producidos por un EchoRun, ligados inequivocamente a una sourceRevision (seccion 7b) |
| bumpDependencies | Ciclo de mantenimiento de tres pasos (security fix → update check → security fix) para actualizar dependencias exactas sin introducir vulnerabilidades (seccion 7h) |
| circuitBreaker | Mecanismo que detiene delegaciones tras 3 fallos consecutivos y escala al MIM (seccion 9c) |
| codebaseMemory | Grafo estructural del codigo derivado de AST. Complementa al RAG con consultas de relaciones entre entidades de codigo (seccion 8f) |
| compositeAgent | Secuencia de invocaciones independientes (testEngineer → Implementor → fitnessFunction) orquestadas bajo una etiqueta comun dentro de un mutation domain aislado; worktree es una implementacion posible (seccion 7c) |
| complianceByDesign | Aserciones de forma de datos integradas en el desarrollo. Cubre exclusivamente controles tecnicos de datos (seccion 7g) |
| consumerRag | Proyeccion RAG del proyecto consumidor en Modo Consumo. Complementa devRag. Ver RAG dual (seccion 8c) |
| ContextBrief | Paquete de contexto compilado por el ContextCompiler para alimentar una delegacion. Incluye deliverables seleccionados con trazabilidad de origen (seccion 9a) |
| ContextCompiler | Componente del Kernel que selecciona y compila deliverables relevantes en un ContextBrief. Paso de juicio con superficie de alucinacion documentada (seccion 9a) |
| CRAP score | Change Risk Anti-Patterns — metrica que combina complejidad y cobertura para evaluar riesgo de cambio |
| delegationContract | Contrato de 6 campos obligatorios que acompana cada delegacion del SM: identidad (rol, tier, constraints), scope, objetivo verificable, input resuelto, output schema, reglas inyectadas como texto (seccion 9c) |
| devRag | Proyeccion RAG de Virgil en Modo Desarrollo. Complementa consumerRag. Ver RAG dual (seccion 8c) |
| DogmaRef | Referencia de identidad al dogma operativo (docs/). Resuelta por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del alcance de este Principia (seccion 3b) |
| droppableCode | Codigo con 0% de cobertura en appTests. Debe eliminarse o justificar su existencia con excepcion documentada. Ver safeToAutoDelete para eliminacion mecanica segura (seccion 7f) |
| Echo System | Pipeline de 5 pasos para la ejecucion de cada fase: Setup → Build → Static → Dynamic → E2E (seccion 7a) |
| EchoRun | Instancia concreta de ejecucion del Echo System que produce un buildArtifactSet ligado a una sourceRevision (seccion 7b) |
| EvidenceIngestion | Componente del Kernel que ingiere evidencia producida por ejecuciones y la registra en el Ledger con trazabilidad de origen (seccion 5) |
| FastForward | Gradiente de certeza (FF-1 a FF-4) que permite comprimir ceremonia de planning cuando la evidencia observable lo soporta (seccion 3a) |
| HostAdapter | Adapter que traduce discovery, invocacion y envelopes entre el host (Claude, GPT, etc.) y el Virgil Kernel. Declara capabilities y degradaciones (seccion 3b, 5) |
| Kernel | Nucleo ceremonia-agnostico de Virgil. Contiene Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RAG (seccion 5) |
| Ledger | Registro inmutable de eventos, transiciones e historial del proyecto |
| MIM | Mind in the Machine: humano con autoridad final sobre el proyecto. Aprueba, rechaza, desempata. Su veto es no negociable (vocabulario) |
| Method Pack | Capa de ceremonia que se monta sobre el Kernel. Define roles, flujos y gates adicionales. Pack Scrum es el unico implementado (seccion 5) |
| mutation domain | Dominio de aislamiento donde un lane de ejecucion opera sin interferir con otros lanes concurrentes. Debe proveer filesystem aislado, deteccion de conflictos al integrar, e identidad de revision por lane. Worktrees son la implementacion de referencia (seccion 7c, 11c) |
| PDC | Post-Delegation Checkpoint: safeguard de coherencia de orquestacion (ECHO → VERIFY → MARK → DECIDE). No es gate de certificacion (seccion 3b) |
| PlanningGapDetected | Senal de escalacion cuando la ejecucion detecta un defecto de planning. Dispara re-planificacion |
| ProjectRef | Referencia de identidad al proyecto objetivo (target). Resuelta por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del alcance de este Principia (seccion 3b) |
| RAG | Proyeccion de lectura optimizada sobre deliverables y documentacion. No es fuente de verdad — es reconstruible (seccion 8e) |
| re-sync | Proceso que actualiza una proyeccion (RAG o codebaseMemory) al HEAD actual y avanza su watermark. Puede dispararse de forma explicita, via PR con deltas, o via hook post-merge (seccion 8c) |
| RetrievalProjection | Nombre formal del componente del Kernel que implementa las proyecciones de lectura. Sinonimo tecnico de RAG en el contexto del catalogo de componentes (seccion 5) |
| RunContext | Contexto de ejecucion del run/change activo. Resuelto por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del alcance de este Principia (seccion 3b) |
| securityAudit | Gate blocking del Echo paso 1 (Setup): escaneo de vulnerabilidades sobre el arbol de dependencias. El Kernel impone la ejecucion; el Method Pack define el umbral de severidad (seccion 7h) |
| SM | Session Manager: agente orquestador que coordina la sesion. Compila contexto, delega trabajo, ejecuta PDC. No es Scrum Master (vocabulario) |
| safeToAutoDelete | Subconjunto de droppableCode que cumple criterios mecanicos de eliminacion segura: sin dependientes vivos, sin ejecucion observada en N ciclos, sin cobertura transitiva. Habilita eliminacion mecanica automatica (seccion 7f) |
| sourceRevision | Commit SHA que identifica la revision del codigo que produjo un buildArtifactSet. Debe ser alcanzable desde el watermark para que la certificacion sea valida (seccion 7b, 8c) |
| Supply Chain Integrity | Tres invariantes sobre dependencias: version pinning exacto, security audit como gate, y bumpDependencies como ciclo de actualizacion controlada (seccion 7h) |
| TPM | Task Progress Monitor: agente ligero que escanea estados y reporta al SM sin mutar deliverables (vocabulario) |
| TraceabilityGraph | Proyeccion derivada que conecta intencion → decision → trabajo → evidencia. Reconstruible desde el Ledger (seccion 5, 8e) |
| versionPinning | Invariante que requiere versiones exactas (sin rangos) para todas las dependencias y el gestor de dependencias. Garantiza reproducibilidad absoluta (seccion 7h) |
| watermark | Revision (commit SHA) contra la cual una proyeccion (RAG o codebaseMemory) fue construida o sincronizada por ultima vez. Propiedad exclusiva del Kernel. Gate de certificacion: sourceRevision debe ser alcanzable desde watermark en el grafo de commits (seccion 8c) |
