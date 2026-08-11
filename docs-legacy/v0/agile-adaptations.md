---
id: agile-adaptations
title: "Adaptaciones Ágiles"
mode: framework
type: reference
tags: [agile, principios, manifiesto, session-manager]
---

# Adaptaciones al Manifiesto Ágil para Agentes IA

← [Índice](README.md)

> Este framework toma vocabulario de Scrum y Agile pero opera con un modelo
> de delegación prescriptivo. La razón: los agentes IA carecen de
> persistencia entre sesiones, capacidad de auto-organización y confianza
> interpersonal. Estas diferencias hacen que ciertos principios ágiles
> requieran adaptación consciente, no abandono.

---

## Contenido

- [Honestidad sobre el Trade-off](#honestidad-sobre-el-trade-off)
- [Tabla de Cumplimiento de los 12 Principios](#tabla-de-cumplimiento-de-los-12-principios)
- [Adaptaciones Clave y Justificación](#adaptaciones-clave-y-justificación)
- [Clarificación de Nomenclatura](#clarificación-de-nomenclatura)
- [Scope del Framework](#scope-del-framework)
- [Excepciones documentadas](#excepciones-documentadas)

---

## Honestidad sobre el Trade-off

Virgil no es Scrum. Descrito con precisión, es **Stage-Gate con
vocabulario de Scrum**: fases secuenciales con gates de aprobación
obligatorios, en vez de sprints time-boxed con entrega continua al
cliente. Esta es una decisión de diseño deliberada, no una desviación
accidental que haya que disculpar.

La razón es el principio 4 del Dogma Rector (**"El agente opera bajo
constraint, no bajo confianza"**, ver
[overview.md](overview.md#dogma-rector)): un agente IA sin memoria
persistente ni reputación acumulada no puede auto-organizarse como un
equipo humano de confianza — necesita gates mecánicos que verifiquen
cada transición antes de avanzar. Scrum asume equipos que negocian su
propio proceso sobre una base de confianza mutua; Virgil asume
agentes que ejecutan contratos porque, entre instancias sin
persistencia, no hay nada más con qué confiar. La gobernanza mecánica
reemplaza la confianza — no porque sea preferible en abstracto, sino
porque es la única opción disponible.

El costo de esa elección es velocidad. El pipeline de planning (idea →
spec → design → tasks → handoff) es secuencial por diseño y solo
entrega código ejecutable al cerrar la Fase 5. `fastForward` (ver
[overview.md](overview.md#fastforward)) mitiga el costo comprimiendo
fases cuando la certeza es alta (score F1-F4 ≥ 6/8), pero no lo
elimina: incluso en el mejor caso sigue existiendo un pipeline mínimo
entre "idea" y "primera línea de código". Llamar a esto Scrum sería
impreciso y generaría expectativas de cadencia que el framework no
cumple. Es más útil — y más honesto — reconocerlo como Stage-Gate
adaptado a un ejecutor que necesita constraints explícitos, no
libertad de auto-organización.

[↑ Contenido](#contenido)

---

## Tabla de Cumplimiento de los 12 Principios

| # | Principio | Cumplimiento | Observación |
|---|-----------|-------------|-------------|
| 1 | Satisfacer al cliente con entrega continua de software valioso | Parcial | El pipeline de planning es secuencial (idea → handoff) antes de que exista una línea de código ejecutable; `fastForward` comprime esa secuencia pero no la elimina. La cadencia de **entrega externa** (al MIM/cliente) es de un ciclo completo (Fase 1 a Fase 8), no continua. |
| 2 | Bienvenidos los cambios tardíos en los requisitos | Parcial | Mecanismos existen (`transition` a draft, re-convocación, `verifyConsistency`) pero son costosos operativamente. |
| 3 | Entregar software frecuentemente | Parcial (cadencia interna) | Hay iteración frecuente **dentro** de execution (commits, ciclos Red-Green-Refactor), pero eso es cadencia de **desarrollo interno**, no de entrega al cliente — no debe confundirse con el principio 1. La entrega verificable al MIM ocurre en los gates de Fase Accept (execution) y Fase 7 (planning), no en cada commit. |
| 4 | Negocio y desarrollo trabajan juntos diariamente | Bien servido | El MIM interactúa en todas las fases vía el SM. No hay "muro" entre negocio y desarrollo. |
| 5 | Construir proyectos alrededor de individuos motivados y darles confianza | Adaptado | La confianza se reemplaza por verificación sistémica (PDC). Ver justificación abajo. |
| 6 | Comunicación cara a cara como método más eficiente | No aplica | Los agentes IA no tienen "cara". El SM como intermediario estructurado es necesario. Ver justificación abajo. |
| 7 | Software funcionando como medida principal de progreso | Bien servido | boundaryModel (App + E2E) con cadena de trazabilidad AC → testPlan → testContract → testImplementation → Cobertura. |
| 8 | Ritmo sostenible de desarrollo | No abordado | Sin mención explícita de límites de carga o throttling de agentes. |
| 9 | Excelencia técnica continua y buen diseño | Excelente | Refactor con 7 dimensiones de revisión, ADRs, respaldo ISO, gates de calidad. |
| 10 | Simplicidad: maximizar el trabajo no hecho | Bien servido | fastForward evita fases innecesarias, tiers de activación escalan ceremonia, roles se condensan. |
| 11 | Equipos auto-organizados producen las mejores arquitecturas | Adaptado | Prescripción vía contrato es necesaria porque los agentes IA no comparten contexto. Ver justificación abajo. |
| 12 | Reflexión y adaptación regular | Excelente | Fase 8 (Retrospectiva) completa con stop/start/continue/agreements. Alimenta el siguiente ciclo. |

> **Nota sobre la distinción entre cadencia interna y externa**: una
> versión anterior de esta tabla calificaba el principio 3 como "Bien
> servido" citando commits frecuentes, mientras calificaba el principio
> 1 como "Parcial" citando un pipeline largo antes de la primera
> entrega — una inconsistencia, porque ambos principios hablan de
> entrega al cliente, no de actividad interna del equipo. Commits
> frecuentes dentro de una iteración de execution no son "software
> entregado frecuentemente" en el sentido del Manifiesto Ágil; son
> cadencia de desarrollo. Ambas filas ahora reflejan la cadencia
> **externa** (qué tan seguido el MIM/cliente recibe algo verificable),
> que es la que el Manifiesto mide.

[↑ Contenido](#contenido)

---

## Adaptaciones Clave y Justificación

### Principio 5 — Confianza reemplazada por verificación

El principio original asume individuos con identidad persistente,
reputación acumulada y motivación intrínseca. Los agentes IA no tienen
ninguna de estas propiedades:

- No recuerdan interacciones previas (sin persistencia cross-session).
- No tienen reputación — cada instancia empieza desde cero.
- No tienen motivación — cumplen contratos, no objetivos personales.

El framework reemplaza "confianza" por el **PDC (Post-Delegation
Checkpoint)**: después de cada delegación, el SM verifica coherencia
(ECHO), cobertura (VERIFY), persiste el resultado (MARK) y decide el
siguiente paso (DECIDE). Esto no es desconfianza — es el equivalente
funcional de la confianza en un contexto donde la identidad no persiste.

### Principio 6 — Comunicación estructurada en vez de cara a cara

El principio original privilegia la comunicación de alto ancho de banda
entre humanos. Los agentes IA no se comunican entre sí — reciben contratos
y retornan resultados. El SM actúa como intermediario que:

- Traduce la intención del MIM en delegationContracts con campos
  obligatorios.
- Recibe status reports estructurados de los subAgents.
- Usa el PDC como protocolo de verificación post-retorno.

La "conversación" entre agentes es un intercambio de contratos y
resultados, no un diálogo. Esto es una limitación inherente, no una
elección de diseño.

### Principio 11 — Prescripción necesaria por falta de contexto compartido

Los equipos humanos auto-organizados funcionan porque comparten contexto
implícito: cultura del equipo, decisiones previas, preferencias,
relaciones de confianza. Los agentes IA no comparten nada:

- Cada subAgent recibe un contexto acotado por contrato.
- No saben qué están haciendo los otros subAgents.
- No pueden negociar entre sí ni ajustar su enfoque en tiempo real.

El modelo command-and-control vía contratos rígidos es una compensación
necesaria. El SM centraliza la coordinación que en un equipo humano sería
distribuida. Esto no es una elección ideológica — es la única forma de
producir resultados coherentes cuando los participantes no comparten
estado.

[↑ Contenido](#contenido)

---

## Clarificación de Nomenclatura

### SM no es un Scrum Master

En este framework, **SM significa Session Manager (Orquestador)**, no
Scrum Master según el Scrum Guide. Las diferencias son sustanciales:

| Aspecto | Scrum Master (Scrum Guide) | SM (este framework) |
|---------|---------------------------|---------------------|
| Función | Servant leader, facilita al equipo | Facade, controla gates y delegación |
| Autoridad | No tiene autoridad sobre el producto | Decide convocación, valida outputs, bloquea avances |
| Producción | No produce artefactos | No produce contenido, pero controla transiciones |
| Equipo | Sirve al equipo auto-organizado | Comanda subAgents sin autonomía |

El SM del framework tiene funciones que un Scrum Master no tiene:
controlar gates, decidir convocación de roles, validar outputs, y bloquear
avances prematuros. Es más cercano a un **controller** que a un
facilitador.

### PO no es el Product Owner clásico

El MIM es el verdadero decisor de producto: sabe qué quiere, tiene la
visión y el presupuesto. El rol PO en este framework funciona como un
**Business Analyst proxy** que:

- Formaliza las ideas del MIM en artefactos estructurados.
- Desafía las ideas con preguntas de negocio.
- Prioriza requisitos y define ACs.
- No tiene autoridad final — el MIM decide.

### "Contrato" no es "contract negotiation"

El Manifiesto Ágil valora "colaboración con el cliente sobre
negociación contractual" ("customer collaboration over contract
negotiation"). Este framework usa la palabra "contrato" de forma
constante — `delegationContracts`, `handoff.md` como contrato entre
planning y execution, fase Contract-First en execution — lo cual, leído
rápido, parece contradecir esa preferencia. No la contradice: son dos
significados distintos de la misma palabra.

- El "contract negotiation" del Manifiesto es un contrato **comercial**
  entre cliente y proveedor: alcance fijado por adelantado, cambios
  costosos, negociación adversarial sobre quién asume el riesgo.
- Los "contratos" de Virgil son contratos **técnicos agente-a-agente**:
  especificaciones que evitan que un subAgent sin contexto compartido
  interprete mal su tarea. Se compilan a partir de artefactos que el
  MIM ya aprobó — no se negocian con el MIM.

El MIM nunca negocia un contrato con el framework; aprueba artefactos,
y el framework compila contratos técnicos a partir de ellos para
coordinar agentes que no comparten estado. La colisión es de
vocabulario, no de intención — pero merece decirse explícitamente para
no sembrar la lectura de que el framework prioriza el contrato sobre
la colaboración con el MIM.

[↑ Contenido](#contenido)

---

## Scope del Framework

Este framework está optimizado para el caso **"1 humano (MIM) + N agentes
IA."** Las fases, artefactos y gates son reutilizables para equipos
humanos, pero el modelo de delegación (contratos rígidos, SM como único
punto de interacción, PDC como mecanismo de verificación) debe adaptarse
para contextos donde los participantes tienen persistencia, autonomía y
capacidad de comunicación directa.

[↑ Contenido](#contenido)

---

## Excepciones documentadas

El framework es prescriptivo por diseño, pero reconoce que existen casos
legítimos donde una regla específica no aplica (e.g., una librería
algorítmica pura donde el boundary App colapsa a la API pública).

El MIM puede declarar una excepción documentada a cualquier regla del
framework. La excepción debe especificar:

| Campo | Descripción |
|-------|-------------|
| Regla afectada | Referencia exacta a la regla que se overridea |
| Justificación | Por qué la regla no aplica en este contexto |
| Scope | Qué iteraciones, artefactos o fases cubre la excepción |
| Condición de terminación | Cuándo la excepción deja de aplicar |

Las excepciones se documentan en el `handoff.md` (sección de restricciones)
y el SM las respeta durante la ejecución. La excepción no elimina la
regla — la suspende para un contexto acotado.
