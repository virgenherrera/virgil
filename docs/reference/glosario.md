# Glosario canonico

[← docs/](../README.md) · [← reference/](./README.md)

Referencia terminologica autoritativa de Virgil. Todos los terminos derivan de
`principia/constitution.md` (Glosario, seccion final).

> **Uso**: si dos documentos usan un termino de forma inconsistente, la definicion
> de esta tabla prevalece. Si esta tabla contradice el Principia, el Principia gana.

## Notas de desambiguacion

Antes de consultar la tabla, ten en cuenta estos pares que se confunden con
frecuencia:

| Par confundible | Diferencia clave |
|-----------------|------------------|
| Echo System vs ECHO (paso del PDC) | Echo System es el pipeline de 5 pasos (Setup, Build, Static, Dynamic, E2E). ECHO es el primer paso del PDC (coherence check post-delegacion). Son conceptos independientes que comparten nombre. |
| PDC vs gates de certificacion | El PDC es un safeguard de coherencia de orquestacion. Las gates de certificacion (QA) son el pipeline mecanico que aprueba o rechaza codigo. El PDC puede detener una delegacion incoherente, pero no certifica codigo. |
| ArtifactRepository vs ArtifactStoreAdapter | ArtifactRepository es componente interno del Kernel (gestiona deliverables). ArtifactStoreAdapter es el adapter externo (traduce persistencia hacia Jira, repo-docs, etc.). |
| droppableCode vs safeToAutoDelete | droppableCode es todo codigo con 0% de cobertura en appTests. safeToAutoDelete es el subconjunto que cumple criterios mecanicos de eliminacion automatica segura. |
| Deliverables vs build artifacts | Deliverables son documentos de planning (idea.md, spec.md). Build artifacts son outputs del Echo pipeline (binarios, coverage, dist/). |
| devRag vs consumerRag | devRag opera en Modo Desarrollo (fuentes: Virgil mismo). consumerRag opera en Modo Consumo (fuentes: proyecto consumidor). |
| compositeAgent vs agente monolitico | compositeAgent es una secuencia de invocaciones independientes, no un agente unico con multiples capacidades. |
| fitness functions (categoria) vs fitnessFunction (rol) | La categoria designa gates de calidad universales. El rol es una invocacion especifica dentro del compositeAgent. |

## Tabla de terminos

| Termino | Definicion | Seccion autoritativa |
|---------|-----------|---------------------|
| AGENTS.md | Archivo de discoverability publicado por Virgil en el proyecto consumidor siguiendo el Open Agentic Standard. Contiene reglas operativas inyectadas para el agente. | S1 |
| ARCH | Gate de alineacion arquitectonica dentro del pipeline de certificacion. Valida conformidad con los principios de arquitectura. | S7e, S11d |
| ArtifactRepository | Componente del Kernel que gestiona deliverables, revisiones y procedencia. No confundir con ArtifactStoreAdapter (adapter externo) ni con el termino informal "ArtifactStore". | S5 |
| ArtifactStoreAdapter | Adapter que traduce persistencia y retrieval entre el Kernel y el sistema externo de almacenamiento (repo-docs, Jira, Confluence, etc.). No confundir con ArtifactRepository (componente interno del Kernel). | S5, S3b |
| Binding Layer | Tres niveles de confianza para contratos: declared (definido), inferred (derivado de evidencia), verified (confirmado por ejecucion). | S7d |
| Break-glass | Lane de emergencia para incidentes P1. Comprime ceremonia con autorizacion MIM, deploy inmediato y certificacion post-hoc obligatoria dentro de 72 horas (configurable: min 24h, max 168h). | S11e |
| buildArtifactSet | Conjunto de build artifacts producidos por un EchoRun, ligados inequivocamente a una sourceRevision. QA certifica un buildArtifactSet concreto, no "el ultimo reporte". | S7b |
| bumpDependencies | Ciclo de mantenimiento de tres pasos (security fix, update check, security fix) para actualizar dependencias exactas sin introducir vulnerabilidades. No es paso del Echo; precede al Echo. | S7h |
| circuitBreaker | Mecanismo que detiene delegaciones tras 3 fallos consecutivos al mismo rol y escala al MIM. | S9c |
| codebaseMemory | Grafo estructural del codigo construido por parser AST determinista. Indexa entidades (archivos, funciones, tipos) y relaciones (calls, imports, herencia). Complementa al RAG para consultas estructurales. | S8f |
| compositeAgent | Secuencia de invocaciones independientes (testEngineer, Implementor, fitnessFunction) orquestadas bajo una etiqueta comun dentro de un mutation domain aislado. No es un agente monolitico. Cada fase es stateless. | S7c |
| complianceByDesign | Aserciones de forma completa del DTO integradas en el desarrollo. Cubre exclusivamente controles tecnicos de datos (minimizacion, control de acceso por campo, validacion de forma). No cubre controles organizacionales, fisicos ni legales. | S7g |
| consumerRag | Proyeccion RAG del proyecto consumidor en Modo Consumo. Fuentes: Virgil dogma + RAG propio del proyecto. Override via adapter interfaces (Jira, Confluence, Azure DevOps, Asana). | S8c |
| ContextBrief | Paquete de contexto compilado por el ContextCompiler para alimentar una delegacion. Incluye deliverables seleccionados con trazabilidad de origen (que se incluyo, de donde salio, que se excluyo). | S9a |
| ContextCompiler | Componente del Kernel que selecciona y compila deliverables relevantes en un ContextBrief. Paso de juicio con superficie de alucinacion documentada. | S9a |
| CRAP score | Change Risk Anti-Patterns. Metrica que combina complejidad y cobertura para evaluar riesgo de cambio. Gate mecanica dentro del pipeline de verificacion. | S7e, S11d |
| delegationContract | Contrato de 6 campos obligatorios en cada delegacion del SM: identidad (rol, tier, constraints), scope, objetivo verificable, input resuelto, output schema, reglas inyectadas como texto literal. | S9c |
| devRag | Proyeccion RAG de Virgil en Modo Desarrollo. Fuentes: `./principia/` (inmutable) + `./docs/` (normativo). Storage: archivos del proyecto Virgil. | S8c |
| DogmaRef | Referencia de identidad al dogma operativo (docs/). Resuelta por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del Principia. | S3b |
| droppableCode | Codigo con 0% de cobertura en appTests. Debe eliminarse o justificar su existencia con excepcion explicita, documentada y revisable. Ver safeToAutoDelete para el subconjunto de eliminacion automatica. | S7f |
| Echo System | Pipeline determinista de 5 pasos: Setup, Build, Static, Dynamic, E2E. Se ejecuta en todo ambiente (dev, CI, CD). Los pasos son siempre los mismos y en el mismo orden; varia el scope. No confundir con el paso ECHO del PDC. | S7a |
| EchoRun | Instancia concreta de ejecucion del Echo System que produce un buildArtifactSet ligado a una sourceRevision. | S7b |
| EvidenceIngestion | Componente del Kernel que ingiere evidencia (test results, coverage, metricas, commits, pipeline logs) y la registra en el Ledger con trazabilidad de origen. | S5 |
| FastForward | Gradiente de certeza (FF-1 a FF-4) que permite comprimir ceremonia de planning cuando la evidencia observable lo soporta. Comprime ceremonia, no gates de calidad. La formula de scoring y los inputs se registran en el Ledger. | S3a |
| HostAdapter | Adapter que traduce discovery, invocacion y envelopes entre el host (Claude, GPT, etc.) y el Virgil Kernel. Declara capabilities del host y sus degradaciones. | S3b, S5 |
| Kernel | Nucleo ceremonia-agnostico de Virgil. Contiene: Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RetrievalProjection. Impone invariantes de calidad universales independientemente de la metodologia. | S5 |
| Ledger | Registro inmutable de eventos, transiciones e historial del proyecto. Implementa idempotencia: registrar una transicion ya registrada es un no-op. Fuente de verdad junto con ArtifactRepository. | S5 |
| Method Pack | Capa de ceremonia enchufable que se monta sobre el Kernel. Define roles, flujos ceremoniales y gates adicionales. Puede agregar mecanismos de calidad pero no puede reducir el minimo del Kernel. Pack Scrum es el unico implementado. | S5 |
| MIM | Mind in the Machine. Humano con autoridad final de decision sobre el proyecto. Aprueba, rechaza, desempata. Su veto es no negociable. Puede delegar ciertas aprobaciones mediante politica documentada. | Vocabulario |
| mutation domain | Dominio de aislamiento donde un lane de ejecucion opera sin interferir con otros lanes concurrentes. Propiedades requeridas: filesystem aislado, deteccion de conflictos al integrar, identidad de revision por lane. Worktrees son la implementacion de referencia. | S7c, S11c |
| PDC | Post-Delegation Checkpoint. Safeguard de coherencia de orquestacion con 4 pasos: ECHO (coherencia), VERIFY (completitud), MARK (persistir en TPM), DECIDE (avanzar o no). No es gate de certificacion. No confundir el paso ECHO con el Echo System. | S3b, S9c |
| PlanningGapDetected | Senal de escalacion emitida cuando la ejecucion descubre que un deliverable aprobado es ambiguo, contradictorio o insuficiente. Bloquea solo el scope afectado y devuelve control a planning. Execution nunca reescribe un deliverable aprobado. | S3a |
| ProjectRef | Referencia de identidad al proyecto objetivo (target). Resuelta por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del Principia. | S3b |
| RAG | Proyeccion de lectura optimizada sobre deliverables y documentacion. Actua como DBMS del contexto documental. No es fuente de verdad; es reconstruible desde las fuentes autoritativas (Ledger + ArtifactRepository). | S8c, S8e |
| re-sync | Proceso que actualiza una proyeccion (RAG o codebaseMemory) al HEAD actual y avanza su watermark. Triggers: explicito (MIM instruye), via PR (deltas + firma de sync), via hook post-merge (opt-in). | S8c |
| RetrievalProjection | Nombre formal del componente del Kernel que implementa las proyecciones de lectura. Sinonimo tecnico de RAG en el contexto del catalogo de componentes. | S5 |
| RunContext | Contexto de ejecucion del run/change activo. Resuelto por el HostAdapter al inicio de cada invocacion. Contrato de campos definido en el layer de protocolo, fuera del Principia. | S3b |
| safeToAutoDelete | Subconjunto de droppableCode que cumple criterios mecanicos de eliminacion segura: sin dependientes vivos, sin ejecucion observada durante N ciclos, sin cobertura transitiva. Habilita eliminacion mecanica automatica; el droppableCode restante requiere decision humana. | S7f |
| securityAudit | Gate blocking del Echo paso 1 (Setup). Escaneo de vulnerabilidades sobre el arbol de dependencias. El Kernel impone la ejecucion; el Method Pack define el umbral de severidad. Herramienta agnostica por ecosistema. | S7h |
| SM | Session Manager. Agente orquestador que coordina la sesion. Compila contexto, delega trabajo via delegationContract, ejecuta PDC. El Method Pack inyecta este rol: en Pack Scrum cumple funciones de Scrum Master; en otros Packs cumple el rol de orquestacion equivalente. Virgil no es el SM. | Vocabulario |
| sourceRevision | Commit SHA que identifica la revision del codigo que produjo un buildArtifactSet. Debe ser alcanzable desde el watermark de la proyeccion para que la certificacion sea valida. | S7b, S8c |
| Supply Chain Integrity | Tres invariantes sobre dependencias externas: versionPinning (versiones exactas), securityAudit (gate de vulnerabilidades), bumpDependencies (actualizacion controlada). Agnosticos de lenguaje y plataforma. | S7h |
| TPM | Task Progress Monitor. Agente ligero que escanea estados y reporta al SM sin mutar deliverables. | Vocabulario |
| TraceabilityGraph | Proyeccion derivada que conecta intencion, decision, trabajo y evidencia. Reconstruible desde el Ledger y los deliverables. No es fuente de verdad; si se desincroniza, se reconstruye. | S5, S8e |
| versionPinning | Invariante que requiere versiones exactas (sin rangos, sin `^`, sin `~`) para todas las dependencias y el gestor de dependencias. Garantiza reproducibilidad absoluta. Aplica independientemente del ecosistema. | S7h |
| watermark | Revision (commit SHA) contra la cual una proyeccion (RAG o codebaseMemory) fue construida o sincronizada por ultima vez. Propiedad exclusiva del Kernel; solo se actualiza via re-sync. Gate de certificacion: sourceRevision debe ser alcanzable desde watermark. | S8c |

---

[↑ reference](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Que es configurable](./que-es-configurable.md) →
