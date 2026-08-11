---
id: planning/index
title: "Planning"
mode: planning
type: index
tags: [planificación, idea, handoff, artefactos, fases]
---

# Planning

← [Índice principal](../README.md)

> Desde la idea hasta el handoff. Define QUÉ construir antes de construirlo.

Planning produce un `handoff.md` que se valida de forma mecánica con
`virgil handoff lint` — un gate determinista, no una revisión subjetiva.
El handoff resultante habilita **ejecución paralela por lanes**: no es
un pipeline serial que un solo ejecutor recorre de punta a punta, sino
un contrato con tareas agrupadas en lanes independientes que múltiples
ejecutores pueden reclamar y avanzar en simultáneo.

---

## Documentos

| Documento | Qué define |
|-----------|-----------|
| [Modelo operativo](operational-model.md) | Modos del framework, ownership, límites, adapter |
| [Artifacts](artifacts/README.md) | 6 artefactos universales, TPM, state machine, adapters |
| [SM Behavior](behavior/README.md) | SM como facade, fases 1-8, fastForward, tiers, PDC |
| [Roles](roles/README.md) | 5 roles default, contratos por fase, roles ad-hoc |
