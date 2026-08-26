# Estrategia Git

[← docs/](../README.md) · [← execution/](./README.md)

Virgil no impone GitFlow, trunk-based ni nombres de branches concretos. Impone cuatro invariantes que cualquier estrategia Git debe satisfacer para garantizar aislamiento entre lanes concurrentes y trazabilidad de cada revision.

Fuente: `principia/constitution.md`, Seccion 11c.

## Los cuatro invariantes

Cualquier estrategia Git es valida siempre que cumpla con estos cuatro invariantes:

### 1. Mutation domains aislados

Lanes concurrentes deben tener mutation domains aislados mientras divergen. Un mutation domain valido debe proveer:

- **Filesystem aislado**: que no interfiera con otros lanes
- **Deteccion de conflictos**: al momento de integrar
- **Identidad de revision**: por lane (cada lane tiene sus propios commits)

### 2. buildArtifactSet ligado a sourceRevision

Cada conjunto de build artifacts producido por el Echo System debe estar ligado de forma inequivoca a la revision (commit SHA) que lo genero. QA nunca certifica "el ultimo reporte" de forma implicita: certifica un `buildArtifactSet` atribuible a una revision concreta.

### 3. Re-ejecucion de Echo en revision integrada

Despues de integrar lanes, el Echo requerido debe volver a ejecutarse sobre la revision integrada antes de que esa revision pueda certificarse. No basta que cada lane haya pasado Echo individualmente.

### 4. Identidad de lane sobrevive la integracion

La identidad y procedencia de cada lane debe sobrevivir la integracion y ser mecanicamente verificable en el historial.

- El enforcement canonico es `--no-ff` (no fast-forward merge)
- Una estrategia alternativa solo es admisible si preserva evidencia equivalente de identidad y procedencia de lane
- Este invariante permite reconstruir que codigo provino de que lane, facilitando auditoria y debugging

## Implementacion de referencia: worktrees + branches

El Dogma actual provee worktrees + branches como implementacion de referencia:

| Nivel | Branch | Proposito |
|-------|--------|-----------|
| Produccion | `main` | Estable, produccion |
| Integracion | `develop` | Punto de integracion |
| Iteracion | `exec/iter-N` | Agrupa lanes de una iteracion |
| Lane | `exec/iter-N/lane-{nombre}` | Mutation domain aislado |

### Flujo de integracion

1. Cada lane se ejecuta en su propio worktree aislado
2. Un [compositeAgent](agente-compuesto.md) opera dentro de ese mutation domain
3. Al completar, el lane se integra a la rama de iteracion con `--no-ff`
4. La iteracion se integra a develop con `--no-ff`
5. Develop se integra a main (merge o squash, el MIM decide)

**Nota**: esta es la implementacion de referencia, no un mandato. Otro proyecto puede usar otro mecanismo de aislamiento siempre que satisfaga los cuatro invariantes.

## PlanningGapDetected y su efecto en lanes

Si una lane detecta violacion de contrato mid-flight, el SM emite `PlanningGapDetected` con efectos diferenciados segun la dependencia:

| Tipo de lane | Efecto |
|-------------|--------|
| Lane afectada | Se detiene inmediatamente |
| Lanes dependientes del mismo contrato | Reciben notificacion de contrato invalidado, entran en pausa pendiente de reconciliacion |
| Lanes independientes | Continuan sin interrupcion |

El principio es que un gap de planning no debe detener trabajo que no depende del contrato violado. Solo se pausa lo estrictamente necesario.

## Convenciones de commits

Las convenciones son defaults configurables por proyecto, con una restriccion: Virgil debe poder reconstruir fase, revision y evidencia por **parseo determinista** (no por inferencia de un LLM).

| Fase | Prefijo default | Frecuencia default |
|------|-----------------|--------------------|
| prePhase | `contract:` | 1 por tipo |
| Red | `test:` | 1 por test o grupo |
| Green | `feat:` | 1 por test que pasa |
| Refactor | `refactor:` | 1 por refactor atomico |

Un proyecto puede definir sus propios prefijos o convenciones, pero debe garantizar que el mapping fase-commit sea determinista y parseable sin juicio del agente.

## Documentos relacionados

- El [agente compuesto](agente-compuesto.md) describe como opera un compositeAgent dentro de cada mutation domain
- El [pipeline de ejecucion](pipeline.md) describe las fases que se ejecutan dentro de cada lane
- [Aceptar y rechazar](aceptar-rechazar.md) cubre que pasa cuando la revision integrada falla en Verify

---

← Anterior: [Agente compuesto](./agente-compuesto.md) · [↑ execution](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Aceptar y rechazar](./aceptar-rechazar.md) →
