# Ejecucion

Esta seccion cubre como se transforma un handoff de planning en codigo certificado: el pipeline de fases, la estrategia de contratos primero, la composicion de agentes, el aislamiento Git y los mecanismos de aceptacion y emergencia.

## Que encontraras aqui

- Como se estructura el pipeline de ejecucion en cinco fases secuenciales
- Como los contratos definidos antes de implementar habilitan paralelismo
- Como el SM orquesta la ejecucion y como el compositeAgent define la secuencia de invocaciones stateless dentro de un mutation domain
- Que invariantes Git garantizan aislamiento y trazabilidad entre lanes
- Como QA enruta rechazos a la fase exacta que debe corregirse
- Que es break-glass y bajo que restricciones se activa

## Orden de lectura recomendado

| Orden | Documento | Que cubre |
|-------|-----------|-----------|
| 1 | [Pipeline de ejecucion](pipeline.md) | Cinco fases: prePhase, Red, Green, Refactor, Verify |
| 2 | [Agente compuesto](agente-compuesto.md) | compositeAgent: secuencia de invocaciones stateless por lane |
| 3 | [Estrategia Git](estrategia-git.md) | Cuatro invariantes de aislamiento y trazabilidad |
| 4 | [Aceptar y rechazar](aceptar-rechazar.md) | Enrutamiento QA: cada rechazo apunta a la fase correcta |
| 5 | [Break-glass](break-glass.md) | Lane de emergencia P1 con certificacion post-hoc |

Fuente: `principia/constitution.md`, Secciones 7c, 11a-11e.
