# FastForward

FastForward es el gradiente de certeza que permite al SM (Session Manager) adaptar la profundidad de deliberacion en planning segun la certeza observable del contexto existente. La certeza es el input; la compresion de ceremonia es el output. No es un atajo: es un mecanismo auditado que comprime pasos ceremoniales, nunca gates de calidad.

Fuente: `principia/constitution.md`, Seccion 3a.

## Que se comprime y que no

Esta distincion es fundamental y no negociable.

| Categoria | Se comprime con FastForward | Ejemplo |
|-----------|----------------------------|---------|
| Ceremonia de planning | Si | Fases de deliberacion, documentacion iterativa, rondas de refinamiento |
| Gates de calidad del Kernel | Nunca | R/G/R, mutation testing, fitness functions, Echo System |

Los gates de certificacion (Red/Green/Refactor, mutation testing, fitness functions) se ejecutan integros en TODOS los niveles de FastForward, desde FF-1 hasta FF-4.

## Niveles de FastForward

El SM computa un score de certeza sobre estado observable y verificable. Ese score determina el nivel de compresion.

### FF-1: Ceremonia completa (score 0-2)

- Se ejecutan todas las fases de planning con deliberacion completa.
- Cada deliverable pasa por iteraciones de refinamiento con el MIM.
- Aplica cuando el contexto es nuevo, ambiguo o de alto riesgo.

### Compresion proporcional (score 3-5)

Para scores intermedios, el SM comprime la ceremonia de forma proporcional al nivel de certeza observable. No existen niveles discretos nombrados en este rango: la compresion es un gradiente continuo donde el SM decide cuantas rondas de deliberacion, refinamiento y validacion son necesarias basandose en la evidencia disponible. A mayor score, mayor compresion — pero siempre dentro de los limites que la evidencia soporta.

### FF-4: Ejecucion directa (score 6-8)

- La ceremonia de planning se reduce al minimo viable.
- Se pasa rapidamente a execution con documentacion esencial.
- Aplica cuando la certeza es alta y el cambio es de bajo riesgo con patron establecido.

## Quien decide el nivel

El SM evalua el gradiente de certeza y computa el score sobre estado observable y verificable. La formula de scoring y los inputs utilizados se registran en el Ledger, haciendolo auditable.

El MIM tiene autoridad sobre el proyecto y puede solicitar mas ceremonia si considera que el riesgo lo justifica. Sin embargo, la evaluacion del score de FastForward es responsabilidad del SM, que opera sobre evidencia observable — no sobre preferencia subjetiva.

## Auditabilidad

El mecanismo de FastForward esta disenado para ser auditable:

- La formula de scoring opera sobre inputs observables y verificables.
- Los inputs utilizados para computar el score se registran en el Ledger.
- El resultado del scoring se registra junto con los inputs.
- Cualquier revision posterior puede reconstruir por que se eligio un nivel determinado.

## Documentos relacionados

- FastForward opera dentro de la [maquina de estados](maquina-de-estados.md) del proyecto, comprimiendo las fases de planning.
- Cada transicion, comprimida o no, pasa por el [flujo de invocacion](flujo-de-invocacion.md) canonico.
- Las gates de calidad que FastForward nunca comprime se detallan en [docs de calidad](../quality/).
