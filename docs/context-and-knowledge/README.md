# Contexto y conocimiento

Como Virgil gestiona conocimiento, persistencia y retrieval. Tres
concerns separados que no se mezclan: donde se persisten los
deliverables, como se consultan, y como se comprende la estructura
del codigo.

Fuente: `principia/constitution.md`, Secciones 8a-8f, 9a-9c.

## Orden de lectura

| # | Documento | Que cubre |
|---|-----------|-----------|
| 1 | [Artifact Store](./artifact-store.md) | Persistencia de deliverables: repo-docs, adapters externos, namespaces |
| 2 | [Sistema RAG](./sistema-rag.md) | RAG como DBMS de contexto: dual (dev/consumer), watermark, memoizacion |
| 3 | [Codebase Memory](./codebase-memory.md) | Grafo estructural AST del codigo: entidades, relaciones, indexacion |
| 4 | [Flujo de contexto](./flujo-de-contexto.md) | ContextBrief, PatternA/B, delegationContract, PDC |

## Principio rector

El camino canonico de contextualizacion es consultar la herramienta
apropiada con queries acotadas, no cargar archivos completos en el
prompt. Los agentes consultan en lugar de leer.

| Concern | Herramienta | Tipo de consulta |
|---------|-------------|------------------|
| Deliverables y documentacion | RAG (devRag / consumerRag) | Semantica |
| Estructura del codigo | codebaseMemory | Estructural (AST) |
| Persistencia | ArtifactStore | Escritura/lectura de deliverables |

## Proyecciones vs fuentes de verdad

El RAG y el TraceabilityGraph son proyecciones derivadas,
reconstruibles desde el Ledger y los deliverables. Ninguna proyeccion
es fuente de verdad; si se desincroniza, se reconstruye desde las
fuentes autoritativas.

## Documentos relacionados

- [Componentes](../architecture/componentes.md) -- catalogo de los
  componentes del Kernel (Ledger, ContextCompiler, etc.)
- [Invariantes arquitectonicos](../architecture/invariantes-arquitectonicos.md)
  -- A2 (autoridad separada de retrieval), A9 (dogma separado de RAG)
