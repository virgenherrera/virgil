# Pipeline de ejecucion

[← docs/](../README.md) · [← execution/](./README.md)

El pipeline de ejecucion transforma un handoff de planning en una implementacion certificada a traves de cinco fases secuenciales, cada una con criterios de entrada y salida bien definidos. Ninguna fase puede saltarse.

Fuente: `principia/constitution.md`, Secciones 11a, 11b.

## Rol de Virgil durante ejecucion

Virgil OBSERVA durante la ejecucion: no dirige, no implementa. Si detecta vacios entre el handoff de planning y lo que esta ocurriendo, emite `PlanningGapDetected`. La orquestacion la ejecuta el SM (Session Manager); Virgil es el knowledge/control plane que registra evidencia y certifica.

## Las cinco fases

El pipeline sigue un orden estricto. Cada fase produce un output concreto y debe pasar su gate de salida antes de avanzar.

| Fase | Que produce | Gate de salida |
|------|-------------|----------------|
| **prePhase** | Contratos fuente: OpenAPI source, schemas, interfaces | Todos los contratos definidos y aprobados |
| **Red** | Suite completa de tests | Todos los tests existen y fallan (red valido) |
| **Green** | Implementacion | Todos los tests pasan |
| **Refactor** | Metricas dentro de umbral | Mutation score, CRAP y complejidad OK |
| **Verify** | Certificacion | Gates mecanicas + verificacion estructurada pasan |

### Checkpoints nombrados

Cada transicion entre fases corresponde a un checkpoint nombrado que actua como gate:

| Checkpoint | Nombre | Que valida |
|------------|--------|------------|
| **R0** | Handoff completo | El handoff de planning contiene toda la informacion necesaria |
| **R1** | Red valida | Suite completa de tests, todos fallan |
| **G1** | Green production-safe | Implementacion donde todos los tests pasan |
| **F1** | Refactor seguro | Metricas dentro de umbral, tests siguen pasando |
| **V1** | Verify independiente | Certificacion mecanica aprobada |

### prePhase: contratos antes de codigo

La prePhase es la fase clave que diferencia este pipeline de un ciclo TDD clasico. Antes de escribir un solo test, se definen los contratos que regiran la implementacion:

- **APIs**: endpoints, metodos, request/response schemas
- **Schemas**: estructuras de datos, validaciones, tipos
- **Interfaces**: contratos entre modulos, boundaries de servicio

Los contratos definidos en prePhase son **deliverables normativos** (no build artifacts). Un OpenAPI generado por build a partir del codigo es un build artifact derivado; el contrato fuente definido en prePhase es la autoridad.

### Red: tests primero, en lote

La fase Red aplica TDD a nivel de batch: se escribe **toda** la suite de tests antes de cualquier implementacion. Esto es el Macro Red/Green/Refactor descrito en la seccion de calidad.

- Cada test referencia un acceptance criteria del planning
- Los tests se ejecutan y **todos deben fallar** (confirma que no hay falsos positivos)
- Si un test pasa sin implementacion, es sospechoso y debe investigarse

### Green: implementar para pasar

La fase Green produce el codigo necesario para que todos los tests pasen. No se escribe codigo que no este respaldado por un test.

- Se implementa contra los contratos definidos en prePhase
- El criterio de salida es binario: todos los tests pasan, o no
- Si durante Green se descubre que falta un test, se retrocede a Red

### Refactor: verificacion mecanica

Con tests pasando, la fase Refactor ejecuta verificacion mecanica sobre metricas de calidad:

- **Mutation testing**: fuerza real de los tests
- **CRAP score**: riesgo de cambio
- **Complejidad ciclomatica**: funciones simples
- **Tamano de modulo**: LOC acotado
- **Estructura de dependencias**: cero ciclos
- **Seguridad**: cero CVEs criticos

Los umbrales los define el Dogma por tier (strict, standard, relaxed). El principio es: **mecanico, no subjetivo**.

### Verify: certificacion final

Verify ejecuta las gates del pipeline de QA completo (ver [aceptar-rechazar.md](aceptar-rechazar.md)):

- Echo completo (5 pasos green)
- Verificacion funcional (cada AC tiene test que pasa)
- Verificacion de contratos (interfaces respetan definiciones)
- Coverage gate (sin regresion, nuevo codigo cubierto)
- Metricas de calidad (mutation, CRAP, complejidad)
- Seguridad (cero criticos)
- Alineacion arquitectonica (implementacion refleja design.md)

Cuando el proyecto declara un perfil de compliance regulatoria (HIPAA, PCI DSS, GDPR), el review humano se activa como gate blocking adicional sobre logica de autorizacion y modelado de dominio. Esta activacion es automatica e incondicional para perfiles regulados. Para proyectos sin perfil regulatorio, el review humano permanece opcional y no-blocking.

## Contratos primero: habilitador de paralelismo

La prePhase no solo establece calidad — habilita **ejecucion paralela**. Cuando los contratos estan definidos y aprobados, multiples lanes pueden trabajar simultaneamente contra la misma interfaz sin coordinacion adicional.

**Ejemplo**: si prePhase define una API REST con su schema, tres lanes pueden arrancar en paralelo:

- **Lane A** (frontend): consume el contrato para construir la UI
- **Lane B** (backend): implementa la API segun el contrato
- **Lane C** (infra): prepara el deployment contra el contrato

Cada lane opera dentro de su propio [mutation domain aislado](estrategia-git.md), ejecutando el ciclo Red-Green-Refactor de forma independiente. La integracion ocurre despues, con re-ejecucion del Echo sobre la revision integrada.

Sin contratos primero, el paralelismo requiere coordinacion constante entre lanes. Con contratos primero, cada lane tiene una interfaz estable contra la cual trabajar.

## Convenciones de commits

Las convenciones de commits son defaults del Dogma y pueden ser overrideadas por proyecto, siempre que Virgil pueda reconstruir fase, revision y evidencia por parseo determinista (no por inferencia de un LLM).

| Fase | Prefijo default | Frecuencia default |
|------|-----------------|--------------------|
| prePhase | `contract:` | 1 por tipo |
| Red | `test:` | 1 por test o grupo |
| Green | `feat:` | 1 por test que pasa |
| Refactor | `refactor:` | 1 por refactor atomico |

## Documentos relacionados

- El [agente compuesto](agente-compuesto.md) describe como se ejecutan las fases Red, Green y Refactor dentro de un lane
- La [estrategia Git](estrategia-git.md) describe como se aislan los lanes paralelos
- [Aceptar y rechazar](aceptar-rechazar.md) describe que pasa cuando Verify encuentra gaps

---

[↑ execution](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Agente compuesto](./agente-compuesto.md) →
