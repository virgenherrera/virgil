---
id: index
title: "Índice de Documentación"
mode: framework
type: index
tags: [navegación, índice, mapa]
---

# idea-to-mvp — Índice de Documentación

> Framework de desarrollo de software estructurado.
> Desde la idea hasta el código operacional.

---

## Mapa General

- [Vista general del framework](overview.md) — diagramas de alto nivel, entrada recomendada
- [Glosario](glossary.md) — definiciones de términos especializados del framework
- [Adaptaciones ágiles](agile-adaptations.md) — cómo el framework adapta los 12 principios del Manifiesto Ágil para agentes IA
- [echo system](echo-system.md) — pipeline determinista de 5 pasos que garantiza homogeneidad entre ambientes
- [artifact system](artifact-system.md) — convención de ubicación predecible para outputs de build

---

## Planning (idea → handoff)

- [Índice del modo](planning/README.md)
- [Modelo operativo](planning/operational-model.md) — modos, ownership, adapters
- [Artifacts](planning/artifacts/README.md) — 6 artefactos, TPM, state machine
- [SM Behavior](planning/behavior/README.md) — fases, delegación, PDC, recovery
- [Roles](planning/roles/README.md) — 5 roles default + ad-hoc

## Execution (handoff → código)

- [Índice del modo](execution/README.md)
- [Contratos](execution/contracts.md) — contract-first, desarrollo paralelo
- [Fase Red](execution/red.md) — estrategia de testing
- [Fase Green](execution/green.md) — implementación
- [Fase Refactor](execution/refactor.md) — gate de calidad
- [Fase Accept](execution/accept.md) — certificación QA
- [Estrategia Git](execution/git-strategy.md) — Gitflow, worktrees, commits

## Operation (opcional)

- [Índice del modo](operation/README.md) — el usuario consume el producto con asistencia del agente
