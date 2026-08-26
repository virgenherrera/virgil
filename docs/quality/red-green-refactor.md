# Red/Green/Refactor

[← docs/](../README.md) · [← quality/](./README.md)

Virgil aplica TDD por lotes (batch TDD), no TDD metodo por metodo. Primero se escribe
toda la suite de tests, luego toda la implementacion, luego todo el refactoring. Cada
fase es una invocacion independiente con su propio criterio de salida.

Fuente: `principia/constitution.md`, Seccion 7c.

## Las tres fases

| Fase | Que se produce | Criterio de salida |
|------|----------------|---------------------|
| **Red** | Suite completa de tests | Todos los tests fallan (red valido) |
| **Green** | Implementacion que satisface tests | Todos los tests pasan |
| **Refactor** | Metricas dentro de umbral | Mutation, CRAP, complejidad OK |

Cada fase se ejecuta como invocacion independiente del agente: nueva sesion, sin
historial conversacional. Cada fase recibe unicamente los deliverables y build
artifacts de la fase anterior, no la historia de razonamiento. Este mecanismo
satisface GP-4 (constraint > confianza): la independencia es estructural, no una
promesa de comportamiento.

## Las 5 gates

El ciclo R/G/R se divide en 5 gates con criterios de entrada y salida explicitos:

| Gate | Nombre | Entrada | Salida |
|------|--------|---------|--------|
| **R0** | Handoff completo | Handoff aprobado de planning | Deliverables de planning validados |
| **R1** | Red valida | Plan de tests + contratos | Suite completa, todos los tests fallan |
| **G1** | Green production-safe | Suite red valida | Implementacion donde todos los tests pasan |
| **F1** | Refactor seguro | Green completo | Metricas dentro de umbral, tests siguen pasando |
| **V1** | Verify independiente | Refactor completo | Certificacion mecanica aprobada |

### R0: Handoff completo

Valida que el handoff de planning contiene toda la informacion necesaria para iniciar
ejecucion. Sin R0, no se escribe ni una linea de test.

### R1: Red valida

Se escriben todos los tests segun la spec. El plan de tests se define primero, luego
los contratos, luego la implementacion de tests. Todos deben fallar; si alguno pasa
sin implementacion, el test esta mal escrito.

### G1: Green production-safe

Se escribe codigo para pasar los tests. Si durante Green se detecta un test faltante,
se regresa a Red. No se agregan tests durante Green.

### F1: Refactor seguro

Verificacion mecanica: mutation testing, CRAP score, complejidad ciclomatica. Se limpia
codigo sin cambiar comportamiento. Si algun test deja de pasar, se regresa a Red
(regresion detectada).

### V1: Verify independiente

Certificacion final mediante las [QA Gates](qa-gates.md). Una invocacion independiente
verifica que todo el pipeline de calidad esta satisfecho.

## Flujo de re-delegacion

Las fases no son lineales en la practica. Existen caminos de retorno:

- **Red a Red**: gap detectado en el plan de tests
- **Green a Red**: test faltante descubierto durante implementacion
- **Refactor a Red**: regresion detectada por metricas

Cada re-delegacion pasa por el PDC completo.

## Ejecucion paralela via compositeAgent

Cuando la ejecucion se paraleliza en multiples lanes, cada lane opera dentro de un
mutation domain aislado. Dentro de ese dominio, un `compositeAgent` ejecuta las tres
fases secuencialmente:

| Invocacion | Rol | Responsabilidad |
|-----------|-----|-----------------|
| 1 | testEngineer | Escribir tests segun spec (Red) |
| 2 | Implementor | Codigo que pase los tests (Green) |
| 3 | fitnessFunction | Mutation, CRAP, complejidad + review residual (Refactor) |

Un compositeAgent no es un agente monolitico: es una secuencia de invocaciones
independientes orquestadas bajo una etiqueta comun. Cada invocacion es stateless.

### Desambiguacion: fitness functions vs fitnessFunction

- **fitness functions** (plural, generico): categoria de gate de calidad mecanica (junto con mutation testing y R/G/R) aplicable a todo el pipeline. Abarca todas las metricas automatizadas que certifican calidad.
- **fitnessFunction** (singular, camelCase): rol especifico de invocacion dentro de la secuencia del compositeAgent (testEngineer -> Implementor -> fitnessFunction). Es una instancia concreta dentro de un mutation domain.

No confundir: la categoria es universal; el rol es una instancia de invocacion.

## Documentos relacionados

- [Echo System](echo-system.md) -- pipeline donde se ejecuta R/G/R
- [Testing Matrix](matriz-de-testing.md) -- que constituye un test valido dentro de R/G/R
- [Binding Layer](binding-layer.md) -- como progresa la confianza del enlace durante R/G/R
- [QA Gates](qa-gates.md) -- certificacion final en V1

---

← Anterior: [Echo System](./echo-system.md) · [↑ quality](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Testing Matrix](./matriz-de-testing.md) →
