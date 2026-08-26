# Principios de gobierno

[← docs/](../README.md) · [← architecture/](./README.md)

Los 6 principios de gobierno definen las reglas del juego: como se toman
decisiones, como se valida, como se gestiona un proyecto bajo Virgil.

Fuente: `principia/constitution.md`, Seccion 4a.

## GP-1: Metodologia end-to-end

**Principio:** Idea a codigo certificado a operacion. Sin saltos.

**Implicacion practica:** Cada feature recorre el ciclo completo de
planning, ejecucion, verificacion y entrega. No existe un camino
directo de "idea" a "codigo" que omita las fases intermedias. El SM
orquesta las delegaciones; el MIM dirige las decisiones de producto.

**Que previene:** Implementaciones sin planning, codigo sin
certificacion, features que llegan a produccion sin haber pasado por
verificacion mecanica.

## GP-2: Trazabilidad + fortaleza

**Principio:** No basta que el enlace exista; debe ser fuerte.

**Implicacion practica:** La trazabilidad en Virgil tiene tres niveles
de confianza progresivos: `declared` (el enlace existe), `inferred`
(evidencia lo respalda) y `verified` (mutation testing lo confirma).
Un test que existe pero no detecta mutaciones no es trazabilidad real.

**Que previene:** Tests de fachada que pasan pero no validan nada.
Enlaces declarativos sin evidencia de fortaleza. Cobertura de vanidad.

## GP-3: Gestion nivel superior

**Principio:** Dashboard de salud, no revision linea a linea.

**Implicacion practica:** El MIM gestiona el proyecto a traves de
indicadores de salud (cobertura, mutation score, CRAP, deuda tecnica),
no revisando cada linea de codigo. Virgil provee la informacion
necesaria para tomar decisiones a nivel de dashboard.

**Que previene:** Micromanagement del MIM sobre el codigo. Revision
manual exhaustiva como unico mecanismo de calidad. Agentes que
dependen de aprobacion humana linea por linea.

## GP-4: Constraint sobre confianza

**Principio:** Constraints enforceables y gates, no promesas del agente.

**Implicacion practica:** Virgil no confia en que el agente hara lo
correcto -- impone restricciones mecanicas que lo fuerzan. Cada fase
del compositeAgent se ejecuta como invocacion independiente (sin
historial conversacional). Los gates son binarios: pasan o no pasan.
La independencia entre fases es estructural, no una instruccion.

**Que previene:** Agentes que omiten pasos, reutilizan contexto entre
fases, o afirman haber verificado sin haberlo hecho. Dependencia de
"buena voluntad" del agente.

## GP-5: Handoff paralelo via claiming

**Principio:** Claiming sobre un handoff, no handoffs separados.

**Implicacion practica:** Cuando multiples lanes trabajan en paralelo,
operan sobre el MISMO handoff aprobado por claiming (cada lane toma
ownership de una porcion del scope). No se crean handoffs separados
por lane. Los contratos definidos en prePhase permiten que los lanes
trabajen contra la misma interfaz sin conflictos.

**Que previene:** Divergencia de scope entre lanes paralelos. Handoffs
contradictorios. Integraciones que descubren incompatibilidades
tardias porque cada lane partio de un spec diferente.

## GP-6: Gates mecanicas deterministas

**Principio:** Binario en ejecucion: pasa o no pasa. Planning y
escalacion involucran juicio; la verificacion queda acotada y trazable.

**Implicacion practica:** Las gates de certificacion (test pass/fail,
mutation score, coverage, CRAP, CVE scan, tamano de modulo) son
deterministas. No hay subjetividad en la evaluacion. Las gates de
verificacion estructurada (ARCH: alineacion con design.md) utilizan
comparacion semantica documentada y trazable. Los pasos de juicio
(planning, escalacion, PDC) son explicitos y dejan evidencia.

**Que previene:** Certificaciones basadas en opinion. Agentes que
"deciden" que el codigo esta listo sin pasar por verificacion
mecanica. Gates ambiguas donde el resultado depende de quien evalua.

## Resumen

| # | Principio | Frase clave |
|---|-----------|-------------|
| GP-1 | Metodologia e2e | Sin saltos en el ciclo |
| GP-2 | Trazabilidad + fortaleza | El enlace debe ser fuerte |
| GP-3 | Gestion nivel superior | Indicadores, no micromanagement |
| GP-4 | Constraint > confianza | Mecanico, no promesas |
| GP-5 | Handoff paralelo | Claiming, no handoffs separados |
| GP-6 | Gates deterministas | Pasa o no pasa |

---

[↑ architecture](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Invariantes arquitectonicos](./invariantes-arquitectonicos.md) →
