# Flujo de contexto

[← docs/](../README.md) · [← context-and-knowledge/](./README.md)

Como fluye el contexto entre agentes durante la ejecucion: compilacion,
patrones de entrega, contratos de delegacion y checkpoints
post-delegacion.

Fuente: `principia/constitution.md`, Seccion 9 (9a, 9b, 9c).

## Regla fundamental

Nunca se pasa contexto crudo a un sub-agente. El contexto se entrega
de dos formas:

- **Compilado:** un ContextBrief acotado al objetivo
- **Como referencia:** un topic_key para que el sub-agente lea del RAG

## ContextBrief

El ContextCompiler selecciona deliverables, hechos y limites para
producir un ContextBrief acotado al objetivo del actor.

### Que incluye

- Deliverables relevantes para la tarea
- Hechos y restricciones aplicables
- Limites de scope

### Trazabilidad

La seleccion queda trazable: que se incluyo, de donde salio, que se
excluyo. Esto permite auditoria post-hoc.

### Superficie de alucinacion

La compilacion es un paso de juicio con superficie de alucinacion
inherente: la seleccion o resumen puede omitir o distorsionar
informacion. La trazabilidad permite detectar omisiones despues del
hecho, pero no las previene en tiempo de compilacion. Este riesgo se
mitiga con el PDC (coherence check post-delegacion) y con la
reconstruccion del ContextBrief ante PlanningGapDetected.

## Dos patrones de entrega

### PatternB (default)

El SM pasa un topic_key; el sub-agente lee directamente del RAG.

- **Cuando:** el target es conocido y deterministico
- **Costo:** bajo (evita materializar contexto en el prompt)
- **Calidad:** buena

### PatternA

El SM busca, cura e inyecta el contexto en el prompt del sub-agente.

- **Cuando:** busqueda fuzzy, fan-out alto (8+ fuentes)
- **Costo:** alto (materializa contexto completo)
- **Calidad:** optima

Ambos patrones operan sobre el RAG dual: devRag en Modo Desarrollo,
consumerRag en Modo Consumo.

## delegationContract

Cada delegacion del SM a un sub-agente lleva un contrato de 6 campos
obligatorios:

| Campo | Que define |
|-------|------------|
| Identidad | Nombre de rol, tier de razonamiento (busqueda / implementacion / arquitectura), constraints de comportamiento |
| Scope | Limite explicito del alcance: que archivos, que acciones, que esta fuera |
| Objetivo verificable | Criterio binario que el SM evalua contra el output |
| Input | Datos resueltos que el sub-agente necesita, sin referencias que deba perseguir |
| Output schema | Estructura exacta del resultado esperado |
| Reglas inyectadas | Reglas del proyecto y constraints como texto literal en el briefing. El sub-agente NO busca su propio contexto: recibe todo lo necesario inyectado por el SM |

### Notas sobre los campos

- **Identidad** no es decorativa. El tier de razonamiento se asigna
  por complejidad de la tarea: una busqueda no requiere capacidad
  arquitectonica; una decision de diseno no se delega a capacidad de
  busqueda.
- **Reglas inyectadas** llegan como texto literal porque un sub-agente
  sin estado (GP-4: constraint sobre confianza) no tiene acceso al
  registro de origen ni responsabilidad de buscarlo.
- **Input** son datos resueltos. El sub-agente no persigue referencias
  ni navega el repositorio por su cuenta.

## PDC: Post-Delegation Checkpoint

Despues de cada delegacion, el SM ejecuta un checkpoint de 4 pasos.
El PDC es un safeguard de coherencia de orquestacion, NO un gate de
certificacion.

### Secuencia PDC

| Paso | Accion | Pregunta |
|------|--------|----------|
| ECHO | Coherence check | El output es coherente con el objetivo? |
| VERIFY | Completeness check | El output esta completo? |
| MARK | Persistir | Registrar resultado en TPM |
| DECIDE | Avanzar o escalar | Se continua o se re-delega? |

### Reglas del PDC

- Sin Status Report en el output, el SM lo trata como FAILED.
- Tres fallos consecutivos al mismo rol activan el **circuitBreaker**.
- El circuitBreaker escala al MIM para decision.

### Distincion importante

El paso ECHO del PDC valida coherencia del output delegado. El
**Echo System** ejecuta Setup a Build a Static a Dynamic a E2E y
produce build artifacts. El primero es un checkpoint de orquestacion;
el segundo es el pipeline canonico de evidencia. No confundir.

## CircuitBreaker

Mecanismo de proteccion contra fallos repetitivos:

- Se activa tras 3 fallos consecutivos al mismo rol
- Detiene las delegaciones a ese rol
- Escala al MIM para decision

El circuitBreaker previene loops infinitos de re-delegacion y fuerza
intervencion humana cuando un rol no puede cumplir su objetivo.

## Documentos relacionados

- [Sistema RAG](./sistema-rag.md) -- el DBMS que los patrones de
  entrega consultan
- [Codebase Memory](./codebase-memory.md) -- complemento estructural
  para consultas de codigo
- [Modelo de interaccion](../architecture/modelo-de-interaccion.md)
  -- invariante fundamental (ownership no es igual a injection)
- [Principios de gobierno](../architecture/principios-de-gobierno.md)
  -- GP-4 (constraint sobre confianza) fundamenta el delegationContract

---

← Anterior: [Codebase Memory](./codebase-memory.md) · [↑ context-and-knowledge](./README.md) · [↑↑ docs](../README.md)
