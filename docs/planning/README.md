# Planning

[← docs/](../README.md)

Esta seccion consolida los entregables de planificacion derivados de `specification/` e
`implementation/`: los epics formales por vertical slice, las historias de usuario y tareas
del Slice 1, y el plan de releases que rige el avance entre slices.

Donde `implementation/releases.md` define el roadmap tecnico y `implementation/conformance.md`
define los scenarios de aceptacion, esta seccion traduce ambos en artefactos de planificacion
consumibles por el equipo: epics, historias, tareas y criterios de avance.

## Orden de lectura

1. [Epics](epics.md) -- los 7 vertical slices formalizados como epics, con criterios de
   aceptacion y dependencias
2. [Historias Slice 1](slice-1-historias.md) -- historias de usuario del Slice 1 (Planning)
3. [Tareas Slice 1](slice-1-tareas.md) -- subtareas con grafo de dependencias del Slice 1
4. [Handoff Slice 1](slice-1-handoff.md) -- puente entre planning e implementacion, punto de
   entrada para el agente implementador
5. [Plan de releases](release-plan.md) -- milestones de version, criterios de avance y
   validacion pre-release

## Relacion con otras secciones

| Seccion | Relacion |
|---|---|
| `implementation/releases.md` | Fuente del roadmap por slices y la estrategia de versionado |
| `implementation/conformance.md` | Fuente de los scenarios C1-C18 citados como criterios de aceptacion del Epic 1 |
| `specification/` | Fuente de los contratos wire-level que las historias del Slice 1 deben satisfacer |

Fuente: `principia/constitution.md`, Secciones 4b (principio 7), 7d, 7h.

---

← Anterior: [Implementacion](../implementation/README.md) · [↑↑ docs](../README.md)
