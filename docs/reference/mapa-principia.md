# Mapa de trazabilidad Principia

[← docs/](../README.md) · [← reference/](./README.md)

Referencia bidireccional entre `docs/` y `principia/constitution.md`. Permite
verificar que cualquier afirmacion en la documentacion tiene respaldo
constitucional y que toda seccion del Principia tiene cobertura documental.

## Tabla directa: documento docs/ a secciones del Principia

Cada fila indica de que secciones del Principia se deriva un documento y a que
capa del manifest pertenece. La columna "Secciones" refleja la linea `Fuente:`
declarada en cada archivo.

| Documento docs/ | Secciones principia/ | Capa (manifest) |
|---|---|---|
| README.md | Todo el documento (meta) | navigation |
| getting-started/README.md | S1, S2, Vocabulario (indice) | navigation |
| getting-started/que-es-virgil.md | S1, S1a | identity |
| getting-started/modos-y-roles.md | Vocabulario, S6a | identity, interaction |
| getting-started/modelo-tres-capas.md | S2 | structure |
| lifecycle/README.md | S3a, S3b, S10 (indice) | navigation |
| lifecycle/maquina-de-estados.md | S3a | lifecycle |
| lifecycle/flujo-de-invocacion.md | S3b | lifecycle |
| lifecycle/fastforward.md | S3a | lifecycle |
| lifecycle/recuperacion.md | S10 | recovery |
| architecture/README.md | S4a, S4b, S4c, S5, S6b, S6c (indice) | navigation |
| architecture/principios-de-gobierno.md | S4a | principles |
| architecture/invariantes-arquitectonicos.md | S4b, S4c | principles |
| architecture/componentes.md | S5 | components |
| architecture/modelo-de-interaccion.md | S6b, S6c | interaction |
| context-and-knowledge/README.md | S8a-S8f, S9a-S9c (indice) | navigation |
| context-and-knowledge/artifact-store.md | S8a, S8b | knowledge |
| context-and-knowledge/sistema-rag.md | S8c, S8d, S8e | knowledge |
| context-and-knowledge/codebase-memory.md | S8f | knowledge |
| context-and-knowledge/flujo-de-contexto.md | S9a, S9b, S9c | context |
| quality/README.md | S7 (completa), S11d (indice) | navigation |
| quality/echo-system.md | S7a | quality |
| quality/red-green-refactor.md | S7c (macro R/G/R) | quality |
| quality/matriz-de-testing.md | S7d (primera parte: tiers) | quality |
| quality/binding-layer.md | S7d (segunda parte: binding) | quality |
| quality/qa-gates.md | S7e, S11d | quality, execution |
| quality/droppable-code.md | S7f | quality |
| quality/compliance.md | S7g | quality |
| quality/supply-chain.md | S7h | quality |
| execution/README.md | S7c, S11a-S11e (indice) | navigation |
| execution/pipeline.md | S11a, S11b | execution |
| execution/agente-compuesto.md | S7c (compositeAgent) | quality |
| execution/estrategia-git.md | S11c | execution |
| execution/aceptar-rechazar.md | S11e (accept/reject routing) | execution |
| execution/break-glass.md | S11e (break-glass) | execution |
| reference/README.md | Glosario, S1a (indice) | navigation |
| reference/glosario.md | Glosario | reference |
| reference/que-es-configurable.md | S1a | identity |
| reference/mapa-principia.md | Todo el documento (meta) | authority |
| specification/README.md | S3a, S3b, S5, S8a, S8b (indice) | navigation |
| specification/operation-protocol.md | S3b, S5 | lifecycle, components |
| specification/state-model.md | S3a, S8a | lifecycle, knowledge |
| specification/repo-docs-adapter.md | S8a, S8b | knowledge |
| specification/skill-contracts.md | S3b, S5, S9c | lifecycle, components, context |
| specification/schemas.md | S3b, S5, S7d | lifecycle, components, quality |
| implementation/README.md | S5, S7a, S7b, S7h (indice) | navigation |
| implementation/go-runtime.md | S5, S7h, S3b | components, quality, execution |
| implementation/echo-system-go.md | S7a, S7d, S7h | quality |
| implementation/artifacts.md | S7a, S7b, S11f | quality, execution |
| implementation/ci-cd.md | S7a, S7h, S11c | quality, execution |
| implementation/releases.md | S7h, S4b | quality, principles |
| implementation/conformance.md | S3b, S7d, S8a, S10 | lifecycle, quality, knowledge, recovery |
| implementation/testing-strategy.md | S7d, S7f | quality |
| implementation/production-safe-green.md | S7c, S7d | quality |

## Tabla inversa: seccion del Principia a documentos docs/

Cada seccion del Principia se lista con los documentos que la cubren. Las
secciones sin cobertura documental dedicada se marcan con "(sin documento
dedicado)". La estructura de secciones y capas proviene de
`principia/manifest.yaml`.

| Seccion principia/ | Titulo | Documento(s) docs/ | Capa (manifest) |
|---|---|---|---|
| Indice | Indice del documento | README.md, READMEs de seccion | navigation |
| Vocabulario | Vocabulario de actores | getting-started/modos-y-roles.md | identity |
| S1 | Que es Virgil | getting-started/que-es-virgil.md | identity |
| S1a | Regla anti-drift interpretativa | getting-started/que-es-virgil.md, reference/que-es-configurable.md | identity |
| S2 | Estructura de tres capas | getting-started/modelo-tres-capas.md | structure |
| S3a | Ciclo de vida de un proyecto | lifecycle/maquina-de-estados.md, lifecycle/fastforward.md, specification/state-model.md | lifecycle |
| S3b | Flujo de una invocacion | lifecycle/flujo-de-invocacion.md, implementation/go-runtime.md, specification/operation-protocol.md, specification/skill-contracts.md, specification/schemas.md, implementation/conformance.md | lifecycle |
| S4a | Gobierno | architecture/principios-de-gobierno.md | principles |
| S4b-S4c | Invariantes arquitectonicos | architecture/invariantes-arquitectonicos.md, implementation/releases.md | principles |
| S5 | Catalogo de componentes | architecture/componentes.md, implementation/go-runtime.md, specification/operation-protocol.md, specification/skill-contracts.md, specification/schemas.md | components |
| S6a | Actores y modos | getting-started/modos-y-roles.md | interaction |
| S6b-S6c | Separacion de concerns e invariante fundamental | architecture/modelo-de-interaccion.md | interaction |
| S7a | Echo System | quality/echo-system.md, implementation/README.md, implementation/echo-system-go.md, implementation/artifacts.md, implementation/ci-cd.md | quality |
| S7b | Deliverables vs Build Artifacts | quality/README.md, implementation/README.md, implementation/artifacts.md | quality |
| S7c (R/G/R) | Macro Red/Green/Refactor | quality/red-green-refactor.md, implementation/production-safe-green.md | quality |
| S7c (compositeAgent) | compositeAgent y mutation domains | execution/agente-compuesto.md | quality |
| S7d (tiers) | Testing Matrix | quality/matriz-de-testing.md, implementation/echo-system-go.md, implementation/conformance.md, implementation/testing-strategy.md, implementation/production-safe-green.md, specification/schemas.md | quality |
| S7d (binding) | Binding Layer y trazabilidad | quality/binding-layer.md | quality |
| S7e | QA / Acceptance Gates | quality/qa-gates.md | quality |
| S7f | droppableCode | quality/droppable-code.md, implementation/testing-strategy.md | quality |
| S7g | complianceByDesign | quality/compliance.md | quality |
| S7h | Supply Chain Integrity | quality/supply-chain.md, implementation/README.md, implementation/go-runtime.md, implementation/echo-system-go.md, implementation/ci-cd.md, implementation/releases.md | quality |
| S8a-S8b | ArtifactStore y namespaces | context-and-knowledge/artifact-store.md, specification/state-model.md, specification/repo-docs-adapter.md, implementation/conformance.md | knowledge |
| S8c | RAG dual, watermark, re-sync | context-and-knowledge/sistema-rag.md | knowledge |
| S8d-S8e | Visibilidad y memoizacion | context-and-knowledge/sistema-rag.md | knowledge |
| S8f | codebaseMemory | context-and-knowledge/codebase-memory.md | knowledge |
| S9 | Flujo de contexto | context-and-knowledge/flujo-de-contexto.md, specification/skill-contracts.md | context |
| S10 | Recuperacion | lifecycle/recuperacion.md, implementation/conformance.md | recovery |
| S11a-S11b | Pipeline de ejecucion | execution/pipeline.md | execution |
| S11c | Git strategy | execution/estrategia-git.md, implementation/ci-cd.md | execution |
| S11d | Verificacion mecanica | quality/qa-gates.md | execution |
| S11e (routing) | Accept/Reject routing | execution/aceptar-rechazar.md | execution |
| S11e (break-glass) | Break-glass | execution/break-glass.md | execution |
| S11f | Evidencia queryable | implementation/artifacts.md | execution |
| S12 | Fase de operacion | (sin documento dedicado) | operation |
| Autoridad | Autoridad, auto-referencia y nota de autoridad | (sin documento dedicado) | authority |
| Glosario | Glosario | reference/glosario.md | reference |

## Cobertura por capa (manifest taxonomy)

Resumen del estado de cobertura documental organizado por las 15 capas
definidas en `principia/manifest.yaml`.

| Capa | Secciones principia/ | Documentos docs/ | Estado |
|---|---|---|---|
| navigation | Indice | README.md, READMEs de seccion | Cubierta |
| identity | Vocabulario, S1, S1a | getting-started/que-es-virgil.md, getting-started/modos-y-roles.md, reference/que-es-configurable.md | Cubierta |
| structure | S2 | getting-started/modelo-tres-capas.md | Cubierta |
| lifecycle | S3a, S3b | lifecycle/maquina-de-estados.md, lifecycle/flujo-de-invocacion.md, lifecycle/fastforward.md, specification/operation-protocol.md, specification/state-model.md, specification/skill-contracts.md, specification/schemas.md | Cubierta |
| principles | S4a, S4b, S4c | architecture/principios-de-gobierno.md, architecture/invariantes-arquitectonicos.md | Cubierta |
| components | S5 | architecture/componentes.md, implementation/go-runtime.md, specification/operation-protocol.md, specification/skill-contracts.md, specification/schemas.md | Cubierta |
| interaction | S6a, S6b, S6c | getting-started/modos-y-roles.md, architecture/modelo-de-interaccion.md | Cubierta |
| quality | S7a-S7h | quality/echo-system.md, quality/red-green-refactor.md, quality/matriz-de-testing.md, quality/binding-layer.md, quality/qa-gates.md, quality/droppable-code.md, quality/compliance.md, quality/supply-chain.md, implementation/echo-system-go.md, implementation/artifacts.md, implementation/ci-cd.md, implementation/releases.md, implementation/testing-strategy.md, implementation/production-safe-green.md | Cubierta |
| knowledge | S8a-S8f | context-and-knowledge/artifact-store.md, context-and-knowledge/sistema-rag.md, context-and-knowledge/codebase-memory.md, specification/state-model.md, specification/repo-docs-adapter.md | Cubierta |
| context | S9 | context-and-knowledge/flujo-de-contexto.md, specification/skill-contracts.md | Cubierta |
| recovery | S10 | lifecycle/recuperacion.md | Cubierta |
| execution | S11a-S11f | execution/pipeline.md, execution/estrategia-git.md, quality/qa-gates.md, execution/aceptar-rechazar.md, execution/break-glass.md, implementation/artifacts.md, implementation/ci-cd.md | Cubierta |
| operation | S12 | (sin documentos dedicados) | Pendiente |
| authority | Autoridad, auto-referencia | (sin documentos dedicados) | Pendiente |
| reference | Glosario | reference/glosario.md, reference/que-es-configurable.md, reference/mapa-principia.md | Cubierta |

## Cross-cutting concerns (manifest)

El manifest define 9 concerns transversales que cruzan multiples secciones. Estos
concerns no pertenecen a una sola seccion del Principia sino que emergen de la
interaccion entre varias. Un documento de docs/ que cubra un concern debe ser
consistente con todas las secciones implicadas.

| Concern | Secciones involucradas | Descripcion |
|---|---|---|
| pdc-vs-echo-disambiguation | S3b, S7a, S9 | PDC es safeguard de orquestacion, Echo es pipeline de certificacion |
| certification-chain | S7b, S8c, S8f, S11f | watermark, sourceRevision, buildArtifactSet, EchoRun |
| mutation-domain | S7c, S8f, S11c | Aislamiento, compositeAgent, worktrees, reconciliacion de grafos |
| deterministic-vs-judgment | S3b, S7e, S9, S11d | Que es mecanico-determinista y que requiere evaluacion |
| mim-authority | Vocabulario, S7f, S7g, S11e | Donde el MIM tiene veto explicito o autoridad final |
| planning-gap-detected | S3a, S11c, S11e | Senal de escalacion transversal de ejecucion a planning |
| modes-duality | S6, S8c, Autoridad | Modo Desarrollo vs Modo Consumo, mismos principios |
| binding-layer-progression | S7d, S11f | Progresion declared, inferred, verified |
| testing-quality-pipeline | S7a, S7c, S7d, S7e, S7f, S11a-S11b, S11d | Pipeline completo de testing y quality |

---

← Anterior: [Que es configurable](./que-es-configurable.md) · [↑ reference](./README.md) · [↑↑ docs](../README.md)
