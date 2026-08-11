# Documentación canónica de Virgil

## Estado normativo

Este directorio contiene la documentación **canónica y normativa** de
Virgil. Por ahora se mantiene únicamente en español para evitar que una
traducción se convierta en una segunda fuente de verdad.

El corpus anterior se conserva, sin modificaciones, en
[`docs-legacy/v0/`](../docs-legacy/v0/README.md). Ese material sirve como
referencia histórica: no define el comportamiento vigente y no debe usarse
para resolver contradicciones de esta versión.

En estos documentos:

- **DEBE** expresa una invariante obligatoria.
- **NO DEBE** expresa una prohibición obligatoria.
- **PUEDE** expresa una capacidad opcional.
- El [roadmap](roadmap/vertical-slices.md) describe intención de entrega, no
  capacidades ya implementadas.

## Alcance

Virgil **es la Secretaría Ejecutiva**: el project knowledge/control plane
agnóstico de agente y metodología. Posee identidad, ledger, trazabilidad,
context briefs y la aplicación y registro de transiciones. Busca acompañar un
cambio desde una idea hasta su entrega y, cuando aplique, su operación.

La ceremonia, los roles, el routing y los gates pertenecen a un **Method
Pack**. Scrum Master no es infraestructura core de Virgil: es un rol opcional
que puede definir el pack Scrum. Otros packs pueden definir roles diferentes o
ninguno.

Los Method Packs objetivo son:

- Scrum, como pack predeterminado inicial.
- Waterfall.
- Kanban.
- Shape Up.

El kernel NO DEBE hardcodear sprints, roles Scrum, WIP limits, bets ni otra
ceremonia particular.

## Invariantes centrales

1. La fuente de Virgil, el proyecto objetivo y cada run/change tienen
   identidades explícitas y separadas.
2. `global ownership != global context injection`: conocer y custodiar el
   mapa completo no autoriza a copiar todo el contexto a cada agente.
3. El RAG es una proyección de lectura reconstruible. No es la autoridad del
   proceso.
4. La ejecución NO redefine planificación aprobada. Si encuentra un vacío o
   contradicción, emite `PlanningGapDetected`.
5. Toda afirmación de progreso debe poder vincularse a artefactos o evidencia
   con procedencia.
6. Un runtime adapter declara sus capacidades; el kernel no presupone
   subagentes, paralelismo, Git, shell ni acceso directo al store.
7. Virgil no asume ni finge un rol ceremonial definido por un Method Pack.

## Navegación

- [Visión y fundamentos](foundations/vision.md)
- [Límites del sistema](architecture/system-boundaries.md)
- [Secretaría Ejecutiva](architecture/executive-secretary.md)
- [Contratos conceptuales mínimos](protocol/core-contracts.md)
- [Roadmap por vertical slices](roadmap/vertical-slices.md)
- [Slice 1 — Planning: idea → handoff](slices/01-planning/README.md)

## Lo que todavía no es normativo

No son contratos vigentes los schemas exhaustivos, formatos no definidos por
un slice, prompts de roles, thresholds de calidad ni estrategias de
paralelismo. Se definirán dentro del slice que los necesite y con evidencia de
implementación.
