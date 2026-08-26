# Echo System

El Echo System es el pipeline determinista de calidad que se ejecuta en todo ambiente.
Cinco pasos (Setup, Build, Static, Dynamic, E2E), siempre los mismos, siempre en el
mismo orden. Lo que varia es el scope, nunca la secuencia.

Fuente: `principia/constitution.md`, Seccion 7a.

## Los 5 pasos

| Paso | Nombre | Que hace |
|------|--------|----------|
| 1 | **Setup** | Instala dependencias, ejecuta security audit (gate blocking) |
| 2 | **Build** | Compila fuente a ejecutables |
| 3 | **Static** | Linting, formatting, analisis estatico |
| 4 | **Dynamic** | Tests a nivel de aplicacion, coverage |
| 5 | **E2E** | Solucion completa, cero mocks |

El orden es constitucional: Setup siempre precede a Build, Build siempre precede
a Static, y asi sucesivamente. Un proyecto no puede reordenar los pasos.

## Scope por ambiente

Los cinco pasos se ejecutan en todos los ambientes. Lo que cambia es la amplitud
del scope:

| Ambiente | Scope | Trigger por defecto | Enforcement |
|----------|-------|---------------------|-------------|
| Dev | Selectivo, feedback rapido | git hooks | Pre-commit, pre-push |
| CI | Completo | Push, PR | Pipeline stages |
| CD | Confianza absoluta | Tag, merge a main | Deployment gates |

En Dev, "feedback rapido" se refiere a verificaciones estructurales (lint, type-check,
formato, analisis estatico). Los tests de integracion contra stack real (tier
App/Servicio) se ejecutan en pre-push o en CI, no en pre-commit.

## Triggers son adapters, Echo no es configurable

Los triggers que disparan Echo son adapters de operacion y pueden cambiar por
proyecto: hooks, CI, CD, un runner local u otro mecanismo. Echo en si mismo
no cambia.

Un trigger es valido siempre que:

- Produzca el mismo contrato de Echo y sus build artifacts identificados
- Sea automatico (no omitible por el agente ejecutor)

Las herramientas concretas dentro de cada paso tambien son sustituibles: el linter,
el runner de tests, el scanner de seguridad. Lo que no es sustituible es la existencia
y el orden de los 5 pasos.

## Echo System vs ECHO del PDC

Estos son conceptos distintos que comparten nombre:

| Concepto | Que es | Donde opera |
|----------|--------|-------------|
| **Echo System** | Pipeline de build de 5 pasos (Setup, Build, Static, Dynamic, E2E) | Produce build artifacts y evidencia |
| **ECHO** (paso del PDC) | Coherence check del Post-Delegation Checkpoint | Valida coherencia del output de un sub-agente |

El Echo System genera evidencia certificable. El paso ECHO del PDC verifica coherencia
de una delegacion. No confundirlos: uno es infraestructura de calidad, el otro es un
safeguard de orquestacion.

## Build artifacts

Cada ejecucion del Echo System (un `EchoRun`) produce un conjunto de build artifacts
(`buildArtifactSet`) que queda ligado inequivocamente a la revision del codigo
(`sourceRevision`) que lo produjo. QA nunca certifica "el ultimo reporte" de forma
implicita; certifica un buildArtifactSet atribuible a una revision concreta.

Para la distincion entre build artifacts y deliverables de planning, consulta la
Seccion 7b del Principia.

## Documentos relacionados

- [Red/Green/Refactor](red-green-refactor.md) -- como se estructura la ejecucion dentro de Echo
- [QA Gates](qa-gates.md) -- como se certifica el resultado de Echo
- [Supply Chain](supply-chain.md) -- security audit como gate del paso Setup
