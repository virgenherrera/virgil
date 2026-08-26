# Sistema RAG

[← docs/](../README.md) · [← context-and-knowledge/](./README.md)

El RAG opera como DBMS de contexto documental: los agentes consultan
en lugar de leer archivos completos. Virgil define dos instancias del
mismo patron, mecanismos de watermark para deteccion de drift y
visibilidad escalonada por rol.

Fuente: `principia/constitution.md`, Secciones 8c, 8d y 8e.

## RAG como DBMS

Principio arquitectonico: los agentes consultan en lugar de leer.

La arquitectura favorece queries al RAG (deliverables, documentacion)
y al codebaseMemory (estructura del codigo) sobre lectura directa de
archivos. Virgil inyecta esta guia via AGENTS.md. El beneficio es
doble: ahorro directo de tokens y scope acotado por query.

La lectura directa de archivos no esta prohibida pero tiene un costo:
consume tokens innecesariamente y opera fuera de la trazabilidad de
Virgil.

## Dos instancias: devRag y consumerRag

| Aspecto | devRag | consumerRag |
|---------|--------|-------------|
| Modo | Desarrollo | Consumo |
| Fuentes | `./principia/` + `./docs/` | Virgil dogma + RAG propio del proyecto |
| Storage | Archivos del proyecto Virgil | `{target}/docs/` (default) |
| Override | N/A (fuente fija) | Via adapter: Jira, Confluence, Azure DevOps, Asana, etc. |
| Rol | DBMS de contexto para desarrollar Virgil | DBMS de contexto para el proyecto consumidor |

Ambas instancias aplican el mismo patron RAG-como-DBMS con scope
diferente. El consumerRag define interfaces; el cliente las
implementa con el backend que necesite.

## Watermark y deteccion de drift

El RAG mantiene un **watermark**: la revision (commit SHA) contra la
cual la proyeccion fue construida o sincronizada por ultima vez. El
watermark es propiedad exclusiva del Kernel y solo se actualiza como
efecto de un re-sync.

### Tres mecanismos del watermark

**1. Deteccion de drift:** al recibir una query, la proyeccion compara
su watermark contra el HEAD actual. Si hay divergencia, reporta
cuantos commits de distancia hay y sugiere re-sync.

**2. Bloqueo de certificacion:** Virgil NO certifica codigo cuya
sourceRevision no sea alcanzable desde el watermark del RAG. El
invariante es mecanico: sourceRevision debe ser alcanzable desde
watermark en el grafo de commits. Un agente no puede modificar el
watermark sin ejecutar el proceso de sincronizacion.

**3. Re-sync explicito:** actualiza la proyeccion al HEAD actual. Se
puede disparar de tres formas:

- Explicito: el MIM instruye al agente ("sincroniza Virgil")
- Via PR: el PR incluye deltas del RAG y firma de sync; al merge, la
  proyeccion queda actualizada
- Via hook (opt-in): un post-merge hook dispara re-sync
  automaticamente

## Visibilidad escalonada

El agente principal (orquestador) tiene visibilidad completa del RAG.
Los sub-agentes reciben un scope reducido: solo lo necesario para su
tarea.

| Actor | Visibilidad |
|-------|-------------|
| Orquestador (SM) | 100% del inventario (si lo estima necesario) |
| Sub-agente | Solo deliverables de su tarea (scope via delegationContract) |

El scope del sub-agente se define en el delegationContract. El
orquestador decide que topic_keys o queries son visibles para cada
delegacion.

## Memoizacion

El RAG mantiene una capa de cache en memoria para acelerar queries
repetidas:

- **Hit:** resultado inmediato desde la cache
- **Miss:** fallback a almacenamiento persistente; se popula la cache

La cache se invalida al reiniciar sesion o cuando el watermark avanza.
La tecnologia de almacenamiento persistente del fallback esta TBD.

## Naturaleza del RAG

El RAG no es la autoridad del proceso. La fuente de verdad son el
Ledger, el ArtifactRepository y la evidencia. El RAG y el
TraceabilityGraph son proyecciones derivadas, reconstruibles. Si una
proyeccion se desincroniza, se reconstruye desde las fuentes
autoritativas.

## Consultas hibridas

Para consultas que cruzan documentacion y codigo (ejemplo: "que
funciones implementan la decision de diseno X descrita en
design.md"), el router ejecuta ambas queries en paralelo:

- Q_SEM al RAG para localizar la decision en documentacion
- Q_STR al codebaseMemory para las funciones en codigo

Los resultados se fusionan por el ContextCompiler con trazabilidad de
origen.

## Documentos relacionados

- [Codebase Memory](./codebase-memory.md) -- complemento estructural
  del RAG
- [Flujo de contexto](./flujo-de-contexto.md) -- como se compila y
  entrega el contexto
- [Artifact Store](./artifact-store.md) -- donde se persisten los
  deliverables que el RAG indexa

---

← Anterior: [Artifact Store](./artifact-store.md) · [↑ context-and-knowledge](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Codebase Memory](./codebase-memory.md) →
