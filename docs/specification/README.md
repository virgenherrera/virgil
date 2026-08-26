# Especificacion

[← docs/](../README.md)

Este directorio contiene los contratos wire-level y protocolos normativos de Virgil.
Son especificaciones de conformidad: toda implementacion (Kernel, adapters, HostAdapters)
DEBE ajustarse a los contratos aqui definidos. Si una implementacion no puede representar
una garantia, responde `unsupported`; no la sustituye con prosa ni con exito aparente.

Estos documentos se derivan del Principia (`principia/constitution.md`) y estan sujetos
a el. Ante contradiccion, el Principia prevalece.

## Orden de lectura

1. [Protocolo de operaciones](operation-protocol.md) -- superficie publica, request/result,
   efectos, envelopes e idempotencia
2. [Modelo de estado](state-model.md) -- maquina de estados de revisiones, derivacion de fase
3. [Adapter repo-docs](repo-docs-adapter.md) -- ArtifactStoreAdapter predeterminado,
   layout de filesystem y politica de escritura
4. [Contratos de operaciones](skill-contracts.md) -- contratos host-neutral por operacion
   canonica (init, new, continue, status, transition), RunContext, ContextBrief,
   PlanningGapDetected
5. [Catalogo de schemas](schemas.md) -- 14 JSON Schemas normativos, reglas de oraculo del
   harness y validaciones semanticas

## Convenciones

- Los campos marcados como **requerido** DEBEN estar presentes en toda invocacion valida.
- Los campos marcados como **condicional** se requieren solo cuando la condicion indicada
  se cumple.
- `status` describe la invocacion, nunca el lifecycle del cambio ni de una revision.
- Las referencias a secciones del Principia usan el formato `S{numero}{letra}` (ejemplo:
  S3b, S8a).

## Version del contrato

La version inicial de estas especificaciones es `virgil.dev/planning-slice1/v1alpha1`.
Un cambio incompatible DEBE publicar un identificador nuevo; no puede alterar la semantica
de una version ya persistida.

---

← Anterior: [Referencia](../reference/README.md) · [↑↑ docs](../README.md) · Siguiente: [Implementacion](../implementation/README.md) →
