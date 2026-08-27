# Epics

[← docs/](../README.md) · [← planning/](./README.md)

Los 7 vertical slices del roadmap (ver [releases.md](../implementation/releases.md)) formalizados
como epics. Cada epic entrega un flujo vertical completo: identidad explicita, estado recuperable,
evidencia trazable. Una promesa documental sin adapter ni flujo demostrable permanece como objetivo
del epic siguiente.

Fuente: `principia/constitution.md`, Secciones 4b (principio 7), 7d.

## Epic 1: Planning

**Scope**: idea, spec, design, tasks, handoff, recovery, conformance. Cubre el ciclo completo de
planificacion: desde la captura de una idea hasta el handoff hacia Execution, incluyendo recovery
en sesion fresca y auditabilidad de cada efecto.

**Acceptance criteria**: los 18 conformance scenarios definidos en
[conformance.md](../implementation/conformance.md), agrupados por area:

- Aislamiento (C1-C6): dogma/target distintos, proyectos aislados, diff limitado a
  `managed_root`, adapter externo sin efectos en target, documentacion preexistente intacta,
  escritura fuera de `managed_root` bloqueada
- Recovery (C7-C9): recovery en sesion fresca, retry idempotente, reuso incompatible de
  idempotency key
- Derivacion de estado (C10-C12): siguiente fase deterministica, revision aprobada inmutable,
  ContextBrief minimo y auditable
- Adapter compliance (C13-C15): capability no soportada no se simula, adapter/policy/efectos
  auditados, referencias cruzadas inconsistentes rechazadas
- Evidencia (C16-C18): resultado estructurado no exito narrado, fixture invalido falla antes de
  efectos, evidencia parcial no certifica

**Dependencies**: ninguna. Epic fundacional; los 6 epics restantes dependen de que su flujo
vertical este validado.

**Status**: En curso.

## Epic 2: Execution

**Scope**: handoff desde Planning hacia code/tests, ciclo Red/Green/Refactor, deteccion de
`PlanningGapDetected` cuando el handoff resulta insuficiente para ejecutar.

**Acceptance criteria**: flujo e2e handoff -> R/G/R con evidencia trazable; `PlanningGapDetected`
se emite cuando falta informacion accionable en el handoff, sin que Execution complete el gap por
prosa o suposicion.

**Dependencies**: Epic 1 (Planning) completo y validado.

**Status**: Siguiente.

## Epic 3: Verify

**Scope**: verificacion del resultado de Execution contra los acceptance criteria de la historia,
con evidencia reproducible y gates que bloquean avance si la evidencia es incompleta.

**Acceptance criteria**: cada AC de una historia queda verificado contra evidencia reproducible;
un gate fallido bloquea el avance del cambio sin excepcion.

**Dependencies**: Epic 2 (Execution) completo y validado.

**Status**: Pendiente.

## Epic 4: Ship/Operation

**Scope**: build identificable, deploy, rollback y runbook operativo para cambios que superaron
Verify.

**Acceptance criteria**: todo build es identificable (version, digest); rollback es reproducible;
el runbook cubre los escenarios de fallo conocidos.

**Dependencies**: Epic 3 (Verify) completo y validado.

**Status**: Pendiente.

## Epic 5: Segundo host

**Scope**: HostAdapter adicional y ArtifactStoreAdapter externo, validados contra los mismos
conformance scenarios que el adapter `repo-docs` de referencia.

**Acceptance criteria**: el segundo host pasa los conformance scenarios aplicables (C1-C18) sin
adaptacion del Kernel; capabilities no soportadas responden `unsupported` en vez de simularse.

**Dependencies**: Epic 1 (Planning) completo. No depende de Epics 2-4 porque valida la superficie
de adapters, no el pipeline de ejecucion.

**Status**: Pendiente.

## Epic 6: Method Packs

**Scope**: Waterfall, Kanban y Shape Up implementados como Method Packs sobre el Kernel estable,
sin modificar el Kernel para acomodar cada metodologia.

**Acceptance criteria**: cada Method Pack opera sobre el mismo Kernel sin bifurcaciones; cambiar
de Method Pack no requiere cambios en Planning, Execution ni Verify.

**Dependencies**: Epics 1-3 completos (el Kernel debe estar estable en Planning, Execution y
Verify antes de soportar metodologias alternativas).

**Status**: Pendiente.

## Epic 7: GraphRAG + paralelismo

**Scope**: proyecciones reconstruibles sobre el grafo de conocimiento, leases para coordinar
lanes paralelos sin colisiones de estado.

**Acceptance criteria**: proyecciones son reconstruibles desde el ArtifactStore sin estado
oculto; leases previenen escritura concurrente conflictiva sobre el mismo recurso.

**Dependencies**: Epic 1 (Planning) completo, dado que las proyecciones consumen el mismo modelo
de estado y ContextBrief validados alli.

**Status**: Pendiente.

## Documentos relacionados

- [Releases](../implementation/releases.md) -- roadmap por vertical slices y estrategia de
  versionado
- [Conformance](../implementation/conformance.md) -- detalle Given/When/Then de C1-C18
- [Historias Slice 1](slice-1-historias.md) -- desglose del Epic 1 en historias de usuario

---

← Anterior: [Planning](./README.md) · [↑ planning](./README.md) · [↑↑ docs](../README.md) ·
Siguiente: [Historias Slice 1](./slice-1-historias.md) →
