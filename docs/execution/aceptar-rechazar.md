# Aceptar y rechazar

[← docs/](../README.md) · [← execution/](./README.md)

Cuando Verify evalua una implementacion candidata, el resultado no es un generico "aprobado" o "rechazado": cada rechazo identifica la fase exacta que debe corregirse y enruta la re-delegacion al punto preciso del pipeline.

Fuente: `principia/constitution.md`, Seccion 11e.

## Enrutamiento de QA

El rechazo de QA es **especifico**. Cada tipo de gap se enruta a la fase del [pipeline](pipeline.md) que corresponde:

| Tipo de gap | Que significa | Re-delegar a |
|-------------|--------------|-------------|
| Gap de implementacion | El codigo no satisface un test que deberia pasar | **Green** |
| Gap de testing | La suite de tests es incompleta (falta cobertura de un AC) | **Red** |
| Gap de contratos | Una interfaz no respeta la definicion de prePhase | **prePhase** |
| Gap arquitectonico | El diseno no esta reflejado en el codigo (divergencia estructural) | **Refactor** |
| Gap de planning | Un feature o AC faltante que debio definirse en planning | **Planning** (PlanningGapDetected) |

## Que ocurre en cada tipo de rechazo

### Rechazo a Green (gap de implementacion)

El codigo existe pero no satisface los tests. La re-delegacion vuelve a la fase Green con los tests que fallan como input. El Implementor recibe:

- Los tests que no pasan
- Los contratos vigentes
- Los deliverables de Red como referencia

El ciclo Green se ejecuta de nuevo hasta que todos los tests pasen.

### Rechazo a Red (gap de testing)

La suite de tests es incompleta: un acceptance criteria documentado no tiene test que lo cubra. La re-delegacion vuelve a Red:

- El testEngineer recibe los ACs sin cobertura
- Escribe los tests faltantes
- Luego el pipeline continua por Green y Refactor normalmente

### Rechazo a prePhase (gap de contratos)

Una interfaz implementada no respeta su definicion contractual. Esto es mas grave porque puede afectar multiples lanes:

- El contrato se revisa y corrige en prePhase
- Los lanes que dependen de ese contrato deben re-evaluarse
- El pipeline re-ejecuta desde Red con los contratos corregidos

### Rechazo a Refactor (gap arquitectonico)

La implementacion funciona (tests pasan) pero diverge del diseno documentado en design.md. La re-delegacion va a Refactor, donde se ejecuta la verificacion mecanica (mutation, CRAP, complejidad) via fitnessFunction y, como gate separada, la verificacion estructurada de alineacion arquitectonica (ARCH) conforme a la seccion 7e del Principia.

### Escalacion a Planning (PlanningGapDetected)

Si el gap no es de ejecucion sino de planning (un feature faltante, un AC ambiguo, un deliverable insuficiente), QA emite `PlanningGapDetected`:

- La ejecucion se detiene para el scope afectado
- El control vuelve a planning para resolver el gap
- La ejecucion **nunca** reescribe un deliverable aprobado por su cuenta
- Las lanes independientes (sin relacion con el gap) continuan sin interrupcion

## Reglas de re-delegacion

Toda re-delegacion sigue las mismas reglas que una delegacion original:

- Pasa por el PDC completo (ECHO, VERIFY, MARK, DECIDE)
- El delegationContract incluye los 6 campos obligatorios
- El sub-agente recibe una invocacion stateless (nueva sesion, sin historial)
- El historial de fallos es per-deliverable y cross-session, lo que permite al SM ajustar estrategia

### CircuitBreaker

Tres fallos consecutivos al mismo rol activan el circuitBreaker, que detiene las delegaciones y escala al MIM. Esto previene loops infinitos de re-delegacion.

## Certificacion exitosa

Cuando todas las gates pasan:

- El resultado recibe certificacion (tag: `qa/approved`)
- El `buildArtifactSet` queda ligado a la `sourceRevision` certificada
- La evidencia se ingiere en el Ledger como dato queryable
- El enlace en el Binding Layer avanza a `verified`

## Documentos relacionados

- El [pipeline de ejecucion](pipeline.md) describe las fases a las cuales QA enruta los rechazos
- La [estrategia Git](estrategia-git.md) describe como PlanningGapDetected afecta a los lanes
- [Break-glass](break-glass.md) cubre el caso especial de emergencia P1 donde se comprime la ceremonia

---

← Anterior: [Estrategia Git](./estrategia-git.md) · [↑ execution](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Break-glass](./break-glass.md) →
