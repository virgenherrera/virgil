# Que es Virgil

Virgil es el knowledge/control plane de un proyecto de software. Mantiene identidad, trazabilidad, contexto y transiciones a lo largo de todo el ciclo de vida, desde la idea hasta la operacion.

Fuente: `principia/constitution.md`, Seccion 1 y 1a.

## Que ES Virgil

Virgil cumple tres funciones complementarias:

- **Knowledge plane** -- Sabe que existe en el proyecto, quien lo posee y en que estado esta. Mantiene un inventario global de deliverables sin necesidad de cargar todo su contenido en el contexto del agente.
- **Control plane** -- Aplica contratos, valida gates de calidad y registra transiciones. Cada cambio de estado queda trazado en un Ledger inmutable.
- **Guia inyectada** -- Publica un archivo `AGENTS.md` en el proyecto consumidor con reglas operativas para el agente: patron de orquestacion, gestion de contexto y condiciones de parada.

## Que NO es Virgil

- **No es un framework de ejecucion.** Virgil no ejecuta codigo, no compila, no despliega.
- **No es un implementador.** No escribe codigo de produccion ni tests.
- **No es un cache de conversacion.** No almacena ni reproduce hilos de chat.
- **No es un Scrum Master.** No adopta roles ceremoniales. La ceremonia la define el Method Pack activo, no el Kernel.

## Como se comunica

Virgil se adhiere al **Open Agentic Standard**:

- Publica un `AGENTS.md` en el repositorio del proyecto consumidor como convencion de discoverability.
- Se comunica via **Model Context Protocol (MCP)** / JSON-RPC.
- Cualquier agente compatible puede consumir Virgil sin acoplamiento a un proveedor especifico de LLM.

Esto significa que no necesitas un host particular (Claude, GPT, etc.) para usar Virgil. El HostAdapter traduce las diferencias entre hosts manteniendo los mismos contratos.

## Que es configurable y que NO

La Seccion 1a del Principia establece la **regla anti-drift**: una frontera explicita entre lo que puedes adaptar a tu proyecto y lo que es constitucional e inamovible.

### NO es configurable (constitucional)

Estos mecanismos forman el ciclo cerrado de accountability de Virgil. Ningun proyecto, adapter ni Method Pack puede eliminarlos ni hacerlos opcionales:

- El Echo System de 5 pasos (Setup, Build, Static, Dynamic, E2E) y su orden.
- Macro Red/Green/Refactor y su independencia por fase.
- La existencia de build artifacts regenerables como salida canonica de Echo.
- La asociacion inequivoca entre EchoRun, sourceRevision y buildArtifactSet.
- EvidenceIngestion, Binding Layer y las gates minimas de calidad del Kernel.
- La regla de que la certificacion se decide sobre evidencia producida por el camino canonico, no sobre afirmaciones del agente.

### SI es configurable (adapters y convenciones)

Dentro de los contratos anteriores, estos elementos pueden sustituirse o ajustarse por proyecto:

- Herramientas concretas dentro de cada etapa de Echo (runners, scanners, linters).
- Comandos, proveedores CI/CD y triggers que disparan Echo.
- Estrategia Git: nombres de branches, worktrees, convenciones de commits.
- Ubicacion fisica de build artifacts (conservando identidad y procedencia).
- Backends de HostAdapter, ArtifactStoreAdapter, RAG y extensiones definidas por contrato.

### Prueba anti-drift

Si una reinterpretacion de Virgil permite que simplemente "observe lo que haya ocurrido" y certifique evidencia arbitraria sin pasar por Echo y build artifacts, esa reinterpretacion contradice el Principia. Virgil define el protocolo mediante el cual la ejecucion adquiere evidencia certificable.

## Siguiente lectura

Ahora que sabes que es Virgil, conoce a los [actores y modos operativos](modos-y-roles.md) que participan en el sistema.
