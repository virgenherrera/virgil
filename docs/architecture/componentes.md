# Componentes de Virgil

[← docs/](../README.md) · [← architecture/](./README.md)

Catalogo de componentes organizados por capa. Cada componente tiene una
responsabilidad clara y un boundary definido.

Fuente: `principia/constitution.md`, Seccion 5.

## Tres capas

| Capa | Responsabilidad | Intercambiable |
|------|-----------------|----------------|
| Kernel | Calidad universal, ceremony-agnostic | No |
| Adapters | Traduccion entre Kernel y entorno externo | Si |
| Method Packs | Ceremonia, roles, gates adicionales | Si (enchufable) |

## Kernel (ceremony-agnostic, calidad universal)

El Kernel impone invariantes de calidad universales independientemente
de la metodologia. Sus componentes no se sustituyen ni se omiten.

### Ledger

Registro inmutable de eventos, transiciones e historial del proyecto.
Toda accion relevante se registra en el Ledger. Implementa
idempotencia: registrar una transicion ya registrada es un no-op. Es
la fuente de verdad para reconstruir estado tras un crash.

### TraceabilityGraph

Proyeccion derivada que conecta intencion a decision a trabajo a
evidencia. Es reconstruible desde el Ledger y los deliverables. No es
fuente de verdad por si mismo; si se desincroniza, se reconstruye.

### ArtifactRepository

Gestiona deliverables, revisiones y procedencia. Un deliverable es un
documento de planning (idea, spec, design, tasks, handoff), no un
build artifact. No confundir con ArtifactStoreAdapter (adapter externo
de persistencia).

### EvidenceIngestion

Ingiere evidencia producida por ejecuciones: resultados de tests,
coverage, metricas, commits, builds y decisiones humanas. La registra
en el Ledger con trazabilidad de origen. La evidencia de certificacion
de codigo solo es elegible cuando esta ligada a un EchoRun y su
buildArtifactSet.

### ContextCompiler

Selecciona deliverables, hechos y limites para producir un
ContextBrief acotado al objetivo del actor. La compilacion es un paso
de juicio con superficie de alucinacion inherente (puede omitir o
distorsionar informacion). La trazabilidad (que se incluyo, de donde
salio, que se excluyo) permite auditoria post-hoc.

### RetrievalProjection

Busqueda lexico/vectorial sobre deliverables y documentacion. Es una
proyeccion de lectura optimizada, no autoridad. Sinonimo tecnico de
RAG en el contexto del catalogo de componentes. Reconstruible desde
las fuentes autoritativas.

## Adapters (intercambiables)

Los adapters traducen entre el Kernel y el entorno externo. Se
reemplazan sin modificar el Kernel.

### HostAdapter

Traduce discovery, invocacion y envelopes entre el host (Claude, GPT,
etc.) y el Virgil Kernel. Resuelve tres identidades al inicio de cada
invocacion: DogmaRef, ProjectRef y RunContext. Declara capabilities y
degradaciones del host.

### ArtifactStoreAdapter

Traduce persistencia y retrieval entre el Kernel y el sistema de
almacenamiento externo. El default es repo-docs
(`{target}/docs/virgil/`). Adapters externos (Jira, Confluence, Azure
DevOps, etc.) se conectan via contrato.

## Method Packs (enchufables)

El Method Pack define la ceremonia: cuantos roles participan, que
gates ceremoniales se comprimen, como se itera.

### Distincion clave: calidad vs ceremonia

- **Calidad** pertenece al Kernel. Los invariantes de calidad (Echo
  System, R/G/R, mutation testing, fitness functions) aplican sin
  excepcion, independientemente del Pack.
- **Ceremonia** pertenece al Pack. Sprints, kanban boards, ciclos de
  Shape Up -- el Pack elige.

Un Pack puede definir mecanismos de calidad ADICIONALES pero nunca
puede reducir el minimo del Kernel. "Ceremony-agnostic" significa que
el Kernel no sabe ni le importa si se usan sprints o kanban;
"calidad universal" significa que el pipeline R/G/R + fitness
functions se ejecuta integro siempre.

### Packs disponibles

| Pack | Estado |
|------|--------|
| Scrum | Implementado (predeterminado) |
| Waterfall | TBD -- no implementado |
| Kanban | TBD -- no implementado |
| Shape Up | TBD -- no implementado |
| Custom | TBD -- el consumidor podria definir su propia metodologia |

### Herencia de gates

Los Method Packs heredan las gates de calidad del Kernel como
invariantes universales no negociables:

- Red/Green/Refactor (TDD por lotes)
- Mutation testing
- Fitness functions
- Echo System (5 pasos)
- Supply Chain Integrity

Estas gates se ejecutan integras en TODOS los niveles de FastForward,
desde FF-1 (ceremonia completa) hasta FF-4 (ejecucion directa).

---

← Anterior: [Invariantes arquitectonicos](./invariantes-arquitectonicos.md) · [↑ architecture](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Modelo de interaccion](./modelo-de-interaccion.md) →
