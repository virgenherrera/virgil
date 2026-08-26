# Break-glass

Break-glass es el lane de emergencia para incidentes P1 en produccion. Comprime la ceremonia del pipeline sin eliminarla, con certificacion post-hoc obligatoria. No es un atajo: es un protocolo de emergencia con restricciones explicitas y accountability completa.

Fuente: `principia/constitution.md`, Seccion 11e.

## Que es y cuando aplica

Break-glass existe para un escenario especifico: produccion esta caida o degradada (P1) y el pipeline completo tomaria demasiado tiempo. El protocolo permite:

- Comprimir las fases Red y Green en un fix directo
- Desplegar inmediatamente a produccion
- Ejecutar la certificacion completa despues, dentro de un plazo definido

**Condicion de activacion**: incidente P1 detectado. Break-glass no aplica para features urgentes, deadlines de negocio ni deuda tecnica acumulada.

## Autorizacion

Solo el MIM puede activar break-glass. No hay excepciones a esta regla.

Para equipos donde el MIM no siempre esta disponible, existe la opcion de **standing policy**: una politica emitida por el MIM que pre-autoriza activaciones bajo condiciones mecanicamente verificables:

| Aspecto de la standing policy | Que define |
|-------------------------------|-----------|
| Tipos de incidente cubiertos | Que escenarios P1 estan pre-autorizados |
| Fecha de expiracion | Hasta cuando es valida la politica |
| Notificacion obligatoria | Plazo para notificar al MIM post-activacion |

Una standing policy **no transfiere autoridad ni amplia scope**. Solo declara condiciones cerradas bajo las cuales break-glass puede activarse sin presencia del MIM. Cada activacion debe:

- Demostrar que cumplio las condiciones pre-autorizadas
- Quedar atribuida a la politica MIM vigente
- Notificar al MIM dentro del plazo declarado

## Ceremonia comprimida

Durante break-glass, la ceremonia se comprime pero no desaparece. El Principia (S11e) define tres puntos:

1. **Red + Green comprimidos**: el fix se implementa directamente, sin separar la fase de tests de la fase de implementacion.
2. **Deploy inmediato**: el fix se despliega a produccion sin esperar certificacion completa.
3. **Certificacion completa post-hoc**: toda la certificacion que el pipeline normal ejecuta antes del deploy se ejecuta despues, dentro del plazo definido.

Lo que se comprime es la **ceremonia** (el orden y completitud de las fases). Lo que **no** se elimina es la **accountability**: todo lo diferido debe completarse en el plazo post-hoc.

## Certificacion post-hoc

La certificacion completa debe ejecutarse dentro de un plazo definido despues del deploy de emergencia:

| Parametro | Valor |
|-----------|-------|
| Plazo default | 72 horas |
| Minimo configurable | 24 horas |
| Maximo configurable | 168 horas (7 dias) |
| Configurado por | Method Pack |

La certificacion post-hoc incluye todo lo que el pipeline normal ejecuta:

- Tests completos (Red completo, no solo el fix)
- Verificacion mecanica (mutation, CRAP, complejidad)
- Gates de QA completas
- Alineacion arquitectonica

### Que pasa si no se certifica a tiempo

Un fix de break-glass sin certificacion post-hoc dentro del plazo se trata como **deuda tecnica critica**. El Ledger registra la activacion como evento auditable, y la falta de certificacion queda visible como deuda pendiente.

## Restricciones explicitas

| Restriccion | Regla |
|-------------|-------|
| Scope | Exclusivamente el fix del incidente. Cero features, cero refactoring oportunista |
| Autorizacion | Solo MIM directo o via standing policy vigente |
| Registro | Cada activacion se registra en el Ledger como evento auditable |
| Certificacion | Obligatoria dentro del plazo. No es opcional |

## Lo que break-glass NO es

- **No es un atajo** para saltarse el pipeline cuando hay prisa
- **No es una excepcion permanente** que reduce los estandares de calidad
- **No es delegable** a agentes sin autorizacion del MIM
- **No aplica a features** por urgentes que sean

Break-glass existe porque la realidad de produccion a veces requiere velocidad sobre ceremonia. Pero la accountability es no negociable: lo que se difiere se paga despues, con certificacion completa y trazabilidad auditora.

## Documentos relacionados

- [Aceptar y rechazar](aceptar-rechazar.md) describe el flujo normal de certificacion que break-glass comprime
- El [pipeline de ejecucion](pipeline.md) describe las fases que se comprimen durante break-glass
