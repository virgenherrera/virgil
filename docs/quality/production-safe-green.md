# Production-Safe Green

## Definición

Green no pide “el mejor código”. Esa frase es subjetiva, no verificable y
empuja al agente a sobrediseñar. En Virgil:

> **Green es el mínimo código production-safe que satisface los contratos
> funcionales y todas las restricciones de quality y security definidas en
> Red.**

“Mínimo” reduce superficie y tiempo de feedback. “Production-safe” impide que
la velocidad se financie con deuda conocida. Si una condición es necesaria
para operar con seguridad, pertenece a Red y a Green; no se posterga a
Refactor.

## Red define el contrato antes del código

Antes de implementar, Red DEBE fijar:

1. **ACs app-level** observables desde la superficie pública.
2. **Casos negativos y de abuso**: inputs inválidos, identidad equivocada,
   permisos insuficientes, capability ausente y efectos prohibidos.
3. **Controles de seguridad aplicables** según la superficie y el riesgo. El
   perfil referencia versión e identificadores concretos; nombrar “OWASP” o un
   Top 10 sin seleccionar controles verificables no alcanza.
4. **Restricciones de arquitectura y dependencias**: boundaries, dirección de
   dependencias, paquetes permitidos y criterio para agregar terceros.
5. **Manejo de secrets y errores**: origen de credenciales, redacción,
   fail-closed, errores tipados y observabilidad sin datos sensibles.
6. **Checks requeridos** y evidencia que demuestra su resultado.
7. **Atajos prohibidos** para evitar que Green compre una victoria falsa.

El perfil OWASP depende de la superficie: por ejemplo,
[ASVS](https://owasp.org/www-project-application-security-verification-standard/)
para controles verificables de aplicaciones web,
[OWASP API Security](https://owasp.org/API-Security/) para riesgos específicos
de APIs, o [MASVS](https://mas.owasp.org/MASVS/) para mobile. Un target sin esas
superficies selecciona solo controles pertinentes y documenta la razón; no
copia un checklist universal.

Red debe fallar inicialmente por ausencia del comportamiento esperado, no por
un fixture roto o un environment indisponible. Los tests unitarios PUEDEN
complementar, pero los ACs que certifican el flujo son app-level según la
[estrategia de validación](validation-strategy.md).

## Contrato mínimo del handoff

Todo handoff de implementación DEBE incluir:

| Campo | Contrato |
|---|---|
| `quality_profile` | Superficie, riesgo, nivel de rigor, estándares/versiones elegidos y justificación. |
| `applicable_controls` | Controles concretos que deben cumplirse y cómo se observarán. |
| `forbidden_shortcuts` | Cambios o degradaciones que invalidan Green aunque el happy path pase. |
| `required_checks` | Checks app-level, negativos, de seguridad y estáticos requeridos. |
| `definition_of_green` | Condición verificable para declarar la implementación mínima production-safe. |
| `evidence_required` | Eventos, artefactos, logs redactados, diffs y outputs que deben conservarse. |
| `refactor_targets` | Mejoras estructurales deseables después de Green; nunca violations MUST conocidas. |

Si falta uno de estos campos, execution no inventa la política: emite
`PlanningGapDetected` y devuelve el handoff a planning.

## Green: límites no negociables

Para alcanzar Green, execution NO PUEDE:

- modificar, borrar o relajar tests para hacerlos pasar;
- introducir `TODO`, placeholders o implementaciones que simulan éxito;
- incorporar secrets en código, fixtures, logs o evidencia;
- agregar suppressions para esconder un check fallido;
- usar catches amplios que traguen errores o políticas allow-all;
- agregar una dependencia sin justificación, versión y revisión de impacto;
- bypassar autenticación, autorización, validación o guards de identidad;
- convertir una falla fail-closed en fallback silencioso;
- diferir a Refactor una violación MUST funcional, de quality o security.

Si un test o control aprobado está equivocado, Green se detiene. Corregirlo
requiere una revisión trazable de planning; nunca una edición oportunista desde
execution.

## Refactor

Refactor mejora estructura, nombres, duplicación y performance manteniendo el
sistema verde. Puede reducir complejidad o fortalecer evidencia, pero no cambia
ACs ni relaja controles.

Refactor no es un basurero para seguridad conocida. Una vulnerabilidad, bypass,
secret o manejo inseguro de errores descubierto durante Green se corrige antes
de declarar Green o vuelve a planning si modifica el contrato.

## QA/Verify

QA/Verify posterior es una certificación independiente contra el handoff
aprobado y su evidencia. No reemplaza Red, Green o Refactor, y no convierte una
implementación incompleta en aceptable. Si descubre un gap de planning, emite
`PlanningGapDetected`; si descubre una violación de implementación, falla el
gate con evidencia.

## Gates mínimos

| Gate | Condición |
|---|---|
| **R0 — Handoff completo** | Los siete campos requeridos están presentes, versionados y no se contradicen. |
| **R1 — Red válida** | Los scenarios app-level fallan por el comportamiento ausente; negative/abuse cases y controles aplicables tienen oráculos. |
| **G1 — Production-Safe Green** | ACs, casos negativos, controles y checks pasan sin ningún atajo prohibido. |
| **F1 — Refactor seguro** | La misma evidencia de Green continúa pasando y el diff respeta boundaries. |
| **V1 — Verify independiente** | Otro actor/runtime certifica el bundle y los efectos observados sin reinterpretar el contrato. |

## Trade-off de restricciones

Demasiadas constraints pueden congelar decisiones prematuramente, aumentar
acoplamiento y producir una solución sobrediseñada. Muy pocas hacen que Green
sea barato porque exporta deuda de seguridad, integración y operación.

La salida no es pedir “calidad máxima”, sino usar un perfil proporcional al
riesgo: cada constraint debe proteger un AC, un boundary, un control aplicable
o una condición operativa concreta. Lo deseable pero no obligatorio va a
`refactor_targets`; lo necesario para seguridad o corrección permanece en la
`definition_of_green`.
