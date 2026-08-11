# Slice 1 — Planning: idea → handoff

## Estado

Este directorio especifica el primer vertical slice. Define contratos
documentales y escenarios de conformidad; no afirma que ya exista una
implementación.

## Baseline

- Method Pack: Scrum, predeterminado para este slice.
- Persistencia: store local externo.
- Runtime: un solo agente y un solo writer.
- Idioma del corpus normativo: español.

Virgil actúa como Secretaría Ejecutiva. El pack Scrum posee ceremonia, roles,
routing y gates. Si el pack define Scrum Master, es un rol opcional del pack;
Virgil no asume esa identidad. En un runtime de un solo agente, distintos
contratos de rol pueden ejecutarse secuencialmente sin convertirlos en
infraestructura core.

## Objetivo

Transformar una intención inicial en un handoff aprobado, recuperable y
trazable, sin escribir en el proyecto objetivo. Una sesión fresca debe poder
determinar qué falta y continuar sin depender del historial conversacional.

## Scope

El slice incluye:

- selección explícita de proyecto, cambio, fuente del método y target;
- store local aislado por `project_id` y `change_id`;
- ledger append-only y revisiones inmutables de artefactos;
- lifecycle única para revisiones;
- compilación de `ContextBrief` mínimo por paso;
- aplicación de routing y gates provistos por el pack Scrum;
- recuperación y derivación determinística del siguiente artefacto requerido;
- handoff aprobado como salida de planning.

## Flujo

El pack Scrum de Slice 1 requiere esta secuencia de artefactos:

```text
idea -> spec -> design -> tasks -> handoff
```

| Artefacto | Outcome mínimo |
|---|---|
| `idea` | Problema, valor, límites y preguntas resueltas para avanzar. |
| `spec` | ACs y restricciones trazables a la idea. |
| `design` | Decisiones técnicas y trade-offs trazables a ACs. |
| `tasks` | Trabajo ordenado y trazable a decisiones y ACs. |
| `handoff` | Contrato autocontenido que referencia las revisiones aprobadas anteriores. |

Para cada paso, Virgil:

1. deriva el primer artefacto requerido sin una revisión aprobada efectiva;
2. solicita al Method Pack el contrato de rol, routing y gate aplicable;
3. compila un `ContextBrief` con las revisiones upstream necesarias;
4. ejecuta una acción acotada mediante el RuntimeAdapter;
5. persiste revisión, evidencia y eventos;
6. aplica y registra la transición permitida por el resultado del gate.

## Restricciones

1. Planning NO DEBE escribir, crear, borrar ni formatear archivos dentro del
   target.
2. El store DEBE vivir fuera del target y de la fuente del método.
3. `method_source` y `target` DEBEN resolverse explícitamente y ser distintos.
4. El slice asume un solo writer. Si detecta concurrencia, DEBE detenerse; no
   simula locking.
5. Una revisión aprobada es inmutable. Corregirla crea una revisión nueva.
6. El contexto se selecciona por contrato:
   `global ownership != global context injection`.
7. Una capacidad ausente se reporta como unsupported; no se finge.

## Salida

El slice termina cuando `handoff` tiene una revisión aprobada efectiva y todas
sus referencias upstream apuntan a revisiones aprobadas efectivas. El output
de la operación incluye sus referencias, el último evento persistido y la
siguiente acción disponible.

## Non-goals

Slice 1 no incluye:

- escritura de código o tests en el target;
- execution, verify, ship u operation;
- GraphRAG, búsqueda vectorial o DBMS;
- múltiples writers, leases, locking, lanes o paralelismo;
- otros Method Packs;
- una estrategia de Git o CI/CD;
- schemas exhaustivos de todos los artefactos;
- skills o prompts específicos de un host.

## Documentos del slice

- [Modelo de estado](state-model.md)
- [Store local](local-store.md)
- [Contratos de skills](skill-contracts.md)
- [Conformidad black-box](conformance.md)
