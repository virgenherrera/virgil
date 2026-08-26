# Binding Layer

El enlace entre un test y el codigo que lo satisface no es binario (existe / no existe).
Tiene tres niveles de confianza que progresan durante el ciclo Red/Green/Refactor.
El Binding Layer es el mecanismo que convierte la trazabilidad en algo accionable.

Fuente: `principia/constitution.md`, Seccion 7d (segunda parte).

## Los tres niveles de confianza

| Nivel | Estado | Fase R/G/R | Que garantiza |
|-------|--------|------------|---------------|
| 1 | **declared** | Red | El test existe y referencia un acceptance criteria |
| 2 | **inferred** | Green | Un hook detecto que codigo ejercita el test |
| 3 | **verified** | Refactor | Mutation testing confirmo fortaleza real |

Solo `verified` certifica fortaleza. Los demas niveles confirman existencia, no calidad.

## Progresion durante R/G/R

### declared (Red)

Cuando se escribe un test durante la fase Red, se crea un enlace `declared`. El test
referencia un acceptance criteria de la spec, pero aun no existe codigo que lo
satisfaga. Lo unico que se sabe es que el test existe y apunta al lugar correcto.

En la practica: el test esta escrito, falla (red valido), y su nombre importa un
identificador de la [matriz de testing](matriz-de-testing.md).

### inferred (Green)

Cuando la implementacion pasa los tests durante la fase Green, el enlace avanza a
`inferred`. Un hook (commit con referencia a test, coverage report, o
EvidenceIngestion del Kernel) detecta que codigo especifico ejercita el test.

En la practica: el test pasa, y la evidencia muestra que existe codigo que lo
satisface. Pero aun no se sabe si el test es fuerte; podria pasar por casualidad.

### verified (Refactor)

Durante la fase Refactor, mutation testing confirma la fortaleza real del enlace.
Si mutar el codigo no rompe el test, el test no esta verificando lo que dice
verificar.

En la practica: mutation testing introduce mutaciones en el codigo. Si el test
detecta las mutaciones (las mata), el enlace es `verified`. Si no las detecta
(mutantes sobreviven), el enlace permanece en `inferred` y requiere atencion.

## Solo verified certifica

La distincion es critica para la certificacion:

- **declared**: sabemos que el test existe. Util para trazabilidad, insuficiente
  para calidad.
- **inferred**: sabemos que algo ejercita el test. Util para coverage, insuficiente
  para fortaleza.
- **verified**: sabemos que el test realmente protege el codigo. Esto es lo que
  certifica.

Las [QA Gates](qa-gates.md) evaluan el nivel de confianza del Binding Layer como
parte del pipeline de certificacion. Un enlace `declared` o `inferred` puede existir,
pero no certifica fortaleza.

## Alimentacion por evidencia

El Binding Layer se alimenta de la evidencia ingresada por el Kernel:

- Cada commit con referencia a un test mueve el enlace de `declared` a `inferred`
- La verificacion mecanica (mutation testing en Refactor) lo mueve de `inferred`
  a `verified`

Esta progresion es mecanica y trazable. No depende de afirmaciones del agente.

## Documentos relacionados

- [Red/Green/Refactor](red-green-refactor.md) -- las fases donde progresa la confianza
- [Testing Matrix](matriz-de-testing.md) -- que tests son validos para crear enlaces
- [QA Gates](qa-gates.md) -- como se usa la confianza del enlace en certificacion
