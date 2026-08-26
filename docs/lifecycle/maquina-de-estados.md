# Maquina de estados del proyecto

[← docs/](../README.md) · [← lifecycle/](./README.md)

Virgil gestiona cada proyecto como una maquina de estados finita. Un feature no avanza a la siguiente fase hasta que su deliverable esta consolidado. No es una linea recta: es un loop que converge hacia un handoff bien acotado.

Fuente: `principia/constitution.md`, Seccion 3a.

## Fases del ciclo de vida

El ciclo completo tiene nueve fases agrupadas en tres zonas con roles distintos para Virgil.

| Zona | Fases | Rol de Virgil |
|------|-------|---------------|
| Planning | Idea, Requirements, Design, Tasks, Handoff | IMPONE convergencia mecanica via maquina de estados |
| Execution | Execution, Verify | OBSERVA. Emite PlanningGapDetected si detecta vacios |
| Post-entrega | Deliver, Operation | ASISTE de forma reactiva (Operation es opcional) |

## Tabla de transiciones

Cada transicion requiere que el deliverable de la fase actual este consolidado. Las transiciones hacia atras (loopback) ocurren cuando se detecta un gap.

| Fase origen | Fase destino | Condicion |
|-------------|--------------|-----------|
| Idea | Idea | Cuestionar, refinar (iteracion interna) |
| Idea | Requirements | Idea consolidada |
| Requirements | Requirements | Iterar con el MIM |
| Requirements | Idea | Gap detectado en la idea original |
| Requirements | Design | Requisitos completos |
| Design | Requirements | Gap detectado en requisitos |
| Design | Tasks | Diseno aprobado |
| Tasks | Design | Gap detectado en diseno |
| Tasks | Handoff | Tareas refinadas |
| Handoff | Execution | Handoff aprobado |
| Execution | Verify | Implementacion candidata lista |
| Verify | Deliver | Implementacion certificada |
| Deliver | Operation | Solo si aplica (superficie operacional activa) |

## Planning vs Execution

La separacion entre planning y execution es un principio arquitectonico (principio A5: Planning != Execution).

### Zona de Planning (Idea a Handoff)

- Virgil impone convergencia mecanica: la maquina de estados no permite avanzar sin deliverable consolidado.
- El SM (Session Manager) orquesta delegaciones a sub-agentes.
- El MIM dirige decisiones de producto.
- Cada fase itera internamente hasta consolidar su entregable.

### Zona de Execution (Execution a Verify)

- Virgil observa, no dirige.
- La ejecucion transforma el handoff en implementacion candidata.
- Verify certifica la implementacion contra las gates del Kernel.
- Execution nunca reescribe un deliverable aprobado.

### Zona Post-entrega (Deliver y Operation)

- Deliver marca la entrega formal.
- Operation se activa solo si el producto tiene superficie operacional activa (APIs, CLIs, servicios). Ver [docs de ejecucion](../execution/) para detalles.

## Loopback: PlanningGapDetected

Si durante execution se descubre que un deliverable aprobado es ambiguo, contradictorio o insuficiente, se emite la senal `PlanningGapDetected`. Este mecanismo tiene tres propiedades clave:

- **Bloqueo selectivo**: solo se bloquea el scope afectado, no todo el proyecto.
- **Devolucion a planning**: el control regresa a la fase de planning que corresponda.
- **Integridad del deliverable**: execution nunca reescribe un deliverable aprobado. Si hay un problema, se escala.

El loopback tambien ocurre dentro de planning: si Design detecta un gap en Requirements, regresa a Requirements. Si Tasks detecta un gap en Design, regresa a Design. Cada regresion es especifica: identifica la fase exacta que debe corregirse.

## Documentos relacionados

- La compresion de ceremonia en las fases de planning se describe en [FastForward](fastforward.md).
- Cada transicion se ejecuta a traves del [flujo de invocacion](flujo-de-invocacion.md).
- La reconstruccion del estado de la maquina tras interrupciones se cubre en [Recuperacion](recuperacion.md).

---

[↑ lifecycle](./README.md) · [↑↑ docs](../README.md) · Siguiente: [FastForward](./fastforward.md) →
