# Recuperacion de estado

[← docs/](../README.md) · [← lifecycle/](./README.md)

Despues de un crash, compactacion de contexto o inicio de nueva sesion, Virgil reconstruye el estado del proyecto sin perderlo. El estado no se almacena como puntero: se deriva de la evidencia persistida.

Fuente: `principia/constitution.md`, Seccion 10.

## Que dispara la recuperacion

Tres escenarios requieren que Virgil reconstruya su comprension del estado del proyecto:

| Escenario | Que ocurre | Que se pierde |
|-----------|------------|---------------|
| Crash | El proceso termina abruptamente | Estado en memoria, contexto de sesion |
| Compactacion | El LLM descarta contexto antiguo para liberar tokens | Historial conversacional, decisiones intermedias |
| Nueva sesion | El agente inicia sin historial previo | Todo el contexto de sesiones anteriores |

En los tres casos, el mecanismo de recuperacion es el mismo.

## Como se reconstruye el estado

La recuperacion sigue una secuencia de tres pasos entre el SM (Session Manager), el TPM (Task Progress Monitor) y el ArtifactStore.

### Paso 1: Consultar deliverables existentes

El SM pregunta al TPM: "que deliverables existen?" El TPM escanea el ArtifactStore y devuelve:

- Lista de deliverables encontrados
- Revisiones consolidadas de cada uno
- Historial de fallos per-deliverable y cross-session

### Paso 2: Derivar la fase actual

El SM deriva la fase actual del proyecto a partir de las revisiones consolidadas de los deliverables. La derivacion tiene reglas precisas:

- El estado se determina por **revisiones consolidadas**, no por mera existencia de archivos.
- Una revision solo participa en la derivacion cuando su persistencia y su gate/evidencia requerida quedaron confirmados.
- Una revision parcial (por ejemplo, un deliverable que se estaba escribiendo cuando ocurrio el crash) no hace avanzar la fase.
- El Ledger complementa la derivacion: el historial de transiciones registradas confirma que fases ya fueron completadas.

### Paso 3: Consultar historial y continuar

El SM consulta el historial de fallos para ajustar su estrategia antes de continuar:

- Si un deliverable fallo multiples veces, el SM puede cambiar de enfoque.
- `lastVerifiedAt` evita re-verificacion innecesaria si el codigo no toco el scope del deliverable.
- El SM reanuda desde la fase derivada, no desde el principio.

## Principio fundamental: estado derivado, no almacenado

El estado de fase no se almacena como puntero autoritativo. Se deriva de dos fuentes:

| Fuente | Que aporta |
|--------|-----------|
| Revisiones consolidadas de deliverables | Que fases produjeron entregables completos y validados |
| Ledger | Historial inmutable de transiciones y eventos |

Este diseno tiene una consecuencia importante: si el puntero se corrompiera (en un sistema que lo almacenara), el estado seria irrecuperable. Al derivarlo de la evidencia, el estado siempre se puede reconstruir.

## Cambios externos

Cuando el SM detecta cambios que ocurrieron fuera del flujo de Virgil (por ejemplo, commits directos al repositorio), los clasifica en tres categorias:

| Tipo de cambio | Accion |
|----------------|--------|
| Aditivo | Registrar como contexto adicional |
| Contradictorio | Escalar al MIM para decision |
| De otro ciclo | Registrar como contexto de referencia, sin afectar el ciclo actual |

## Documentos relacionados

- La maquina de estados cuyas fases se reconstruyen esta descrita en [Maquina de estados](maquina-de-estados.md).
- El flujo de invocacion que registra transiciones en el Ledger se describe en [Flujo de invocacion](flujo-de-invocacion.md).
- El ArtifactStore del que se leen los deliverables se detalla en [docs de contexto y conocimiento](../context-and-knowledge/).

---

← Anterior: [Flujo de invocacion](./flujo-de-invocacion.md) · [↑ lifecycle](./README.md) · [↑↑ docs](../README.md)
