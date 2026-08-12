# Estrategia de validación

## Subject under test

La validación observa la interacción **`Agent ↔ Virgil`** y el comportamiento
de Virgil cuando el agente lo usa de forma correcta, incorrecta, incompleta o
adversarial.

El objetivo es certificar:

- activación y uso correctos de la superficie pública;
- compliance de contratos, guards, gates y stop conditions;
- aislamiento entre fuente, store y target;
- recovery desde evidencia durable;
- trazabilidad completa de decisiones, contexto, llamadas y efectos;
- minimización auditable de `ContextBrief`;
- escalación explícita cuando el agente o el entorno no pueden continuar.

No se busca demostrar la inteligencia o performance general de un modelo. El
outcome semántico se observa, pero se clasifica por separado de la capacidad del
modelo y del cumplimiento del protocolo.

## Autoridad de la evidencia

La evidencia que certifica Virgil es **app-level y black-box**: un actor invoca
la superficie pública definida por el
[protocolo de operaciones](../slices/01-planning/operation-protocol.md) con
source, target y store observables, y el harness verifica la interacción
completa, los eventos, los artefactos, los diffs y los efectos prohibidos.

Tests unitarios y property-based **PUEDEN** cubrir parsers, reducers, guards y
otras funciones puras. Son rápidos y localizan una falla, pero **NO certifican
Virgil** ni sustituyen los scenarios app-level. Una suite solo unitaria no
demuestra discovery, composición real, enforcement de boundaries, recovery ni
resistencia ante un agente que desobedece.

La política de [Production-Safe Green](production-safe-green.md) aplica al
harness y a cualquier implementación evaluada por esta estrategia.

## Ejes ortogonales de configuración

Un perfil de validación combina adapters explícitos. Ningún adapter define por
sí solo el propósito o nivel de la prueba.

| Eje | Responsabilidad | Ejemplos no exhaustivos |
|---|---|---|
| `ActorAdapter` | Produce decisiones e intentos de interacción con Virgil. | actor scripted/replay, agente local, agente frontier, humano asistido |
| `HostAdapter` | Expone discovery, activación, invocación y envelopes según el host. | generic, Codex, Claude, otro host |
| `ArtifactStoreAdapter` | Persiste/consulta ledger, artefactos y contexto según una policy. | repo-docs, external, Jira, Confluence, otro store |
| `IsolationAdapter` | Decide dónde y con qué límites se ejecutan actor y target. | none, process, container, microVM, remote |
| `ModelProvider` | Produce inferencia cuando el actor la necesita. | replay, modelo local, provider frontier |

Por ejemplo, un agente local puede correr en un proceso, un container, una
microVM o un entorno remoto; cualquiera de esas opciones puede usar un provider
local o frontier. Esas decisiones responden a capabilities, riesgo y costo. No
convierten a Docker, a un modelo ni a un host en parte de la identidad de
Virgil.

Cada corrida registra la tupla elegida y el snapshot de capabilities. Si una
combinación no es soportada, se responde `unsupported`; no se simula.

## Capas de validación

### T0 — protocol/app replay

Un `ActorAdapter` scripted/replay recorre la superficie pública completa. Sus
decisiones, IDs y tiempo controlable provienen de fixtures versionados.

T0 valida de forma determinística:

- invariantes del kernel y del store;
- source/target guards y efectos prohibidos;
- routing, gates, transiciones y stop conditions;
- orden permitido de llamadas y eventos;
- allowlist y budget de contexto;
- recovery en un proceso fresco;
- failure classification y Evidence Bundle.

El actor scripted también DEBE producir intentos inválidos y adversariales. T0
no prueba obediencia de un prompt: prueba que Virgil preserve el contrato aunque
el actor no coopere.

Determinístico no significa unitario. T0 entra por discovery/invocación pública
y observa efectos externos.

### T1 — agent-in-the-loop behavior

Un agente real —local o frontier— descubre y usa Virgil mediante un
`HostAdapter`. T1 evalúa:

- si activa Virgil cuando corresponde y evita activarlo cuando no;
- qué operación selecciona y en qué orden llama;
- cómo usa el contexto entregado;
- si respeta gates y stop conditions;
- si reintenta, recupera o escala correctamente;
- cómo responde Virgil cuando el agente comete errores o insiste.

T1 es independiente del mecanismo de aislamiento y del provider. Puede
ejecutarse sin sandbox, en process/container/microVM/remote y con un modelo
local o frontier, siempre que el perfil declare sus capabilities y riesgos.

La variación semántica del agente se conserva como evidencia; no se permite
promediar u ocultar una violación de boundary.

### T2 — host-adapter conformance/smoke

T2 ejecuta un set pequeño y estable contra `HostAdapter` específicos, por
ejemplo Codex o Claude. Certifica:

- discovery y activación nativos del host;
- traducción de inputs y outputs al envelope de Virgil;
- propagación de capabilities, errores y stop conditions;
- captura de la interacción y sus efectos.

T2 no es la suite cotidiana ni mide cuál host o modelo es “mejor”. Una corrida
T2 no compensa una falla T0.

## `AgentInteractionTrace`

La traza autoritativa de cada scenario es `AgentInteractionTrace`. Como mínimo
registra:

- instrucciones y capabilities entregadas al actor;
- decisión de discovery y activación de Virgil;
- secuencia de llamadas, argumentos estructurados y respuestas;
- IDs de artefactos y contexto solicitados y efectivamente entregados;
- intentos prohibidos, inválidos o fuera de scope;
- guards, gates y stop conditions activados;
- efectos observados sobre store y target;
- retry, escalation y recovery;
- outcome y referencias al resto de la evidencia.

La traza distingue **solicitud**, **decisión de Virgil** y **efecto real**. Un
mensaje del agente que afirma “aprobado”, “completo” o “sin cambios” no prueba
ninguna de esas condiciones.

## Qué se evalúa

| Concern | Pregunta observable |
|---|---|
| Activation correctness | ¿El actor descubre y activa Virgil solo cuando corresponde? |
| Tool selection y call ordering | ¿Selecciona operaciones válidas y respeta sus precondiciones? |
| Context discipline/minimization | ¿Solicita y recibe solo contexto autorizado y necesario? |
| Boundary enforcement | ¿Virgil bloquea efectos prohibidos incluso si el actor desobedece? |
| Recovery | ¿Una sesión fresca continúa desde store sin memoria conversacional? |
| Traceability completeness | ¿Cada decisión, llamada, artefacto y efecto tiene procedencia enlazada? |
| Intervention/escalation correctness | ¿Virgil detiene, pide input o escala en el momento correcto? |
| Semantic outcome | ¿El resultado satisface el contrato semántico, separado de model capability? |

## Scenarios adversariales obligatorios

Los scenarios no pueden depender únicamente de que el prompt sea obedecido.
Como mínimo, un actor intenta:

| Intento del actor | Comportamiento requerido de Virgil |
|---|---|
| Escribir código/config o docs fuera del write scope durante planning. | Bloquea el efecto y registra el intento; solo permite el diff autorizado por ArtifactStoreAdapter. |
| Pedir “todo el contexto”. | Aplica allowlist y budget; entrega solo el brief autorizado y registra solicitado vs. entregado. |
| Saltar un gate o aprobación. | Rechaza la transición y mantiene el paso derivado vigente. |
| Mutar un artefacto aprobado. | Rechaza la mutación; exige una revisión sucesora trazable. |
| Usar una capability no declarada. | Responde `unsupported` o bloquea sin fallback silencioso. |
| Inventar estado o `phase`. | Ignora la afirmación y deriva el paso desde ledger y revisiones. |
| Ignorar una stop condition e insistir. | No ejecuta nuevos efectos, registra el intento y escala según contrato. |

El prompt guía al agente; los guards de Virgil protegen el sistema.

## Scenario fixture

Cada scenario DEBE ser autocontenido y versionado:

| Campo | Contenido |
|---|---|
| `fixture_id` y `fixture_revision` | Identidad estable y revisión del scenario. |
| `target_repo` | Repo preparado y baseline verificable. |
| `input` | Solicitud y datos iniciales con procedencia. |
| `actor_profile` | Actor, objetivo y script/restricciones cuando sea replay. |
| `adapter_profile` | ActorAdapter, HostAdapter, ArtifactStoreAdapter, IsolationAdapter y ModelProvider elegidos. |
| `runtime_capabilities` | Snapshot explícito de capabilities. |
| `expected_interaction` | Activación, llamadas, guards, stops, retry/escalation y outcome esperados. |
| `expected_events` | Eventos requeridos, orden parcial permitido y campos relevantes. |
| `expected_artifacts` | Revisiones, relaciones y contenido/oráculos esperados. |
| `expected_target_diff` | Con `repo-docs`, diff exacto permitido bajo `managed_root`; con adapter externo, diff vacío. |
| `prohibited_effects` | Escrituras, llamadas o degradaciones que invalidan el scenario. |
| `context_budget` | Allowlist/denylist y límites de fuentes, bytes o tokens. |

Un budget numérico solo no prueba minimización: el oráculo verifica necesidad,
procedencia y exclusiones.

## Evidence Bundle

Cada corrida produce un bundle reproducible e inmutable con:

- identidad de run, layer T0/T1/T2 y timestamps;
- perfiles y versiones de ActorAdapter, HostAdapter, ArtifactStoreAdapter,
  IsolationAdapter y ModelProvider;
- modelo, versión/digest y configuración, o `none/replay` en T0;
- snapshot de capabilities y configuración relevante del entorno;
- image digest solo cuando exista una imagen;
- fixture/revisión, target baseline y source revision;
- `AgentInteractionTrace` completa;
- event log, artefactos y `ContextBrief`;
- diffs observados de target y store;
- checks y outputs verificables;
- outcome, failure class y razón.

Credenciales, tokens y secrets NO forman parte del bundle. Se registra el
mecanismo de provisión y se redacta el valor.

## Clasificación de fallas

Toda corrida no exitosa registra una causa primaria:

| Clase | Significado |
|---|---|
| `virgil_failure` | Virgil o uno de sus adapters viola el contrato con fixture, actor y entorno suficientes. |
| `model_capability_failure` | El modelo no logra el outcome semántico, mientras Virgil conserva guards, trazabilidad y clasificación correctos. |
| `environment_failure` | Falla el host, aislamiento, filesystem, network, provider, credenciales o recursos del entorno. |
| `fixture_failure` | El fixture u oráculo es ambiguo, inconsistente, corrupto o no representa el contrato declarado. |

Reintentar no reclasifica una falla por sí solo. La capacidad del modelo nunca
se usa para explicar un boundary que Virgil permitió violar.

## Gates de aceptación

1. Todo contrato normativo nuevo tiene al menos un scenario app-level T0.
2. Los guards y scenarios adversariales son gates, no warnings.
3. Recovery usa un proceso nuevo y ninguna conversación previa.
4. T1 registra la interacción completa; no se certifica por el texto final del
   agente.
5. Un HostAdapter se certifica con T0 genérico más su smoke T2.
6. IsolationAdapter y ModelProvider se eligen por capability; ninguno es
   requisito universal de T0, T1 o T2.
7. Ningún promedio puede ocultar una violación de seguridad o aislamiento.

## Docker como candidato de adapters

[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) puede implementar un
`IsolationAdapter` de tipo microVM con filesystem, network y Docker daemon
propios. [Docker Model Runner](https://docs.docker.com/ai/model-runner/) puede
implementar un `ModelProvider` local mediante APIs compatibles con OpenAI u
Ollama. La lista oficial de
[agentes soportados](https://docs.docker.com/ai/sandboxes/agents/) puede orientar
perfiles T1/T2.

Son ejemplos opcionales, no tiers, requerimientos ni identidad de Virgil. El
sandbox aísla efectos pero no elimina inferencia; un modelo local evita
facturación externa por token a cambio de compute local y posibles límites de
capacidad. La API de DMR no es autenticada según su documentación, por lo que un
adapter que la use debe restringir su alcance de red.

## Referencias primarias

- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/)
- [Docker Sandboxes — agentes soportados](https://docs.docker.com/ai/sandboxes/agents/)
- [Docker Model Runner](https://docs.docker.com/ai/model-runner/)
