# Agente compuesto (compositeAgent)

Un compositeAgent es una secuencia de invocaciones stateless orquestadas bajo una etiqueta comun dentro de un mutation domain aislado. No es un agente monolitico: es la ejecucion coordinada de tres roles independientes que mapean directamente a las fases Red, Green y Refactor del pipeline.

Fuente: `principia/constitution.md`, Seccion 7c.

## Estructura: tres invocaciones secuenciales

El compositeAgent ejecuta tres roles en secuencia estricta. Cada rol es una **invocacion independiente del agente** (nueva sesion, sin historial conversacional).

| Orden | Rol | Fase R/G/R | Responsabilidad |
|-------|-----|-----------|-----------------|
| 1 | **testEngineer** | Red | Escribir tests segun spec y contratos |
| 2 | **Implementor** | Green | Escribir codigo que pase los tests |
| 3 | **fitnessFunction** | Refactor | Verificacion mecanica: mutation, CRAP, complejidad + residualReview |

### Flujo de ejecucion

1. El orquestador crea un **mutation domain** (lane aislado) para el compositeAgent
2. Invoca a **testEngineer** con la spec y los contratos de prePhase. testEngineer escribe los tests en el mutation domain y devuelve los deliverables Red
3. Invoca a **Implementor** con los deliverables Red. Implementor escribe codigo en el mismo mutation domain y devuelve los deliverables Green
4. Invoca a **fitnessFunction** con los deliverables Green. fitnessFunction ejecuta verificacion mecanica y residualReview en el mismo mutation domain y devuelve el resultado del lane

Cada invocacion recibe unicamente los deliverables y build artifacts producidos por la fase anterior, **no la historia de razonamiento**.

## Invariante de independencia (GP-4)

La independencia entre fases no es una instruccion al agente: es un **constraint tecnico** impuesto por el Kernel.

- Cada fase se ejecuta como invocacion stateless: nueva sesion, cero historial
- El Kernel implementa este reset como mecanismo estructural, no como promesa de comportamiento
- Esto satisface el Principio de Gobierno GP-4 (Constraint > confianza): la independencia es estructural, no una promesa

**Por que importa**: si el Implementor tuviera acceso al razonamiento del testEngineer, podria escribir codigo que satisface la intencion del test en lugar del contrato del test. La independencia por constraint garantiza que el Implementor solo ve los tests como entrada, no la logica detras de su creacion.

## Mutation domains aislados

Cuando la ejecucion se paraleliza en multiples lanes, cada lane opera dentro de un mutation domain aislado. Esto significa:

- **Filesystem aislado**: cada lane trabaja en su propio espacio sin interferir con otros
- **Deteccion de conflictos**: al integrar, se detectan colisiones entre lanes
- **Identidad de revision**: cada lane mantiene su propia identidad de commit

Los worktrees de Git son la implementacion de referencia del Dogma actual. Otro mecanismo es admisible siempre que satisfaga las tres propiedades anteriores.

Cada mutation domain alberga un compositeAgent completo. Multiples compositeAgents pueden ejecutarse en paralelo sobre lanes diferentes, siempre que sus mutation domains no se interfieran.

## Mapeo al pipeline R/G/R

El compositeAgent implementa las tres fases centrales del [pipeline de ejecucion](pipeline.md):

| Pipeline | compositeAgent | Criterio de salida |
|----------|---------------|-------------------|
| Red | testEngineer | Todos los tests escritos y fallando |
| Green | Implementor | Todos los tests pasando |
| Refactor | fitnessFunction | Metricas dentro de umbral |

Las fases **prePhase** y **Verify** quedan fuera del compositeAgent:

- **prePhase** ocurre antes: define los contratos que alimentan al testEngineer
- **Verify** ocurre despues: certifica el resultado del lane completo

## Desambiguacion: fitnessFunction vs fitness functions

- **fitness functions** (plural, generico): categoria de gate de calidad junto con mutation testing y R/G/R. Aplica a todo el pipeline
- **fitnessFunction** (singular, camelCase): rol especifico de invocacion dentro de la secuencia compositeAgent. Es una instancia de la categoria dentro de un mutation domain

## Documentos relacionados

- El [pipeline de ejecucion](pipeline.md) describe las cinco fases dentro de las cuales el compositeAgent opera
- La [estrategia Git](estrategia-git.md) describe como se implementan los mutation domains con worktrees
- [Aceptar y rechazar](aceptar-rechazar.md) describe que ocurre cuando el resultado del compositeAgent no pasa Verify
