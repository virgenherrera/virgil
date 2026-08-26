# Artifact Store

Donde se persisten los deliverables de planning de un proyecto.
El ArtifactStoreAdapter traduce entre el Kernel y el sistema de
almacenamiento externo.

Fuente: `principia/constitution.md`, Secciones 8a y 8b.

## Persistencia por defecto: repo-docs

El adapter predeterminado es **repo-docs**: los deliverables se
persisten como archivos Markdown en `{target}/docs/virgil/` dentro del
repositorio del proyecto consumidor.

Ventajas de repo-docs:

- Local, sin dependencias externas
- RAG-friendly (archivos indexables directamente)
- Versionable con git
- Sin costo de infraestructura

## Adapters externos

El ArtifactStoreAdapter define un contrato que cualquier sistema
externo puede implementar. Los adapters externos son TBD:

| Adapter | Estado |
|---------|--------|
| repo-docs | Default, implementado |
| Jira | TBD -- via contrato |
| Confluence | TBD -- via contrato |
| Azure DevOps | TBD -- via contrato |
| Asana | TBD -- via contrato |
| GitHub Projects/Issues | TBD -- via contrato |
| Otros | TBD -- via contrato de adapter |

El contrato del adapter define las operaciones de persistencia y
retrieval. Lo que se conecte, se conecte, mientras cumpla con el
contrato.

## Separacion de namespaces

Existen dos namespaces que comparten el nombre `docs` pero NO comparten
identidad, ownership ni write policy:

### Virgil/docs/ (dogma)

- **Contenido:** dogma de Virgil (documentacion normativa, protocolos,
  contratos)
- **Ownership:** equipo de desarrollo de Virgil
- **Write policy:** read-only para consumidores
- **Naturaleza:** normativo y versionado

### {target}/docs/virgil/ (proyecto)

- **Contenido:** deliverables del proyecto consumidor (idea, spec,
  design, tasks, handoff)
- **Ownership:** Virgil escribe aqui (managed namespace)
- **Write policy:** Virgil tiene permisos de escritura; el scope esta
  delimitado a este subdirectorio

### {target}/docs/** (corpus del proyecto)

- **Contenido:** documentacion propia del proyecto (READMEs, guias,
  ADRs, etc.)
- **Ownership:** del proyecto consumidor
- **Write policy:** read-only para Virgil (opt-in para indexacion RAG)

## Nomenclatura

El codigo de Virgil usa "Artifact" en entidades como ArtifactStore,
ArtifactRepository y ArtifactStoreAdapter. Estas entidades gestionan
**deliverables** (documentos de planning), no build artifacts (outputs
del pipeline). La nomenclatura de codigo es historica; el Principia
define la terminologia canonica.

## Documentos relacionados

- [Sistema RAG](./sistema-rag.md) -- como se consultan los deliverables
  persistidos
- [Componentes](../architecture/componentes.md) -- ArtifactRepository
  y ArtifactStoreAdapter en el catalogo
