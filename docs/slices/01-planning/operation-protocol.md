# Slice 1 — Protocolo de operaciones

## Propósito

Este documento define la superficie pública mínima y host-neutral de Slice 1.
Skills, CLIs, MCP servers u otros HostAdapters PUEDEN representarla de forma
distinta, pero DEBEN conservar los campos, estados e invariantes observables.

El protocolo no elige lenguaje, transporte ni formato físico del store. Su
objetivo es evitar inputs ambientales, resultados de prosa libre y efectos que
no puedan auditarse.

La versión inicial de este contrato es `virgil.dev/planning-slice1/v1alpha1`.
Un cambio incompatible DEBE publicar un identificador nuevo; no puede alterar
la semántica de una versión ya persistida.

## Operaciones canónicas

Slice 1 expone únicamente:

- `virgil.init`: registra un proyecto y su ArtifactStoreAdapter;
- `virgil.new`: crea un run/change desde una intención inicial;
- `virgil.continue`: avanza como máximo hasta el siguiente gate o stop.

Un HostAdapter puede ofrecer nombres nativos distintos, pero la traza DEBE
registrar cuál operación canónica ejecutó.

## `OperationRequest`

Toda invocación recibe un request estructurado con:

| Campo | Requerido | Semántica |
|---|---:|---|
| `protocol_version` | sí | Versión del contrato de Slice 1. |
| `operation` | sí | `virgil.init`, `virgil.new` o `virgil.continue`. |
| `request_id` | sí | Identidad única de este intento. |
| `idempotency_key` | sí | Clave estable para reintentos de la misma intención. |
| `dogma_ref` | sí | Source y versión/digest read-only del dogma y Method Pack. |
| `project_ref` | sí | Identidad estable y target explícito. |
| `artifact_store_ref` | sí | Adapter, versión, namespace y policy. |
| `host` | sí | HostAdapter, versión y snapshot de capabilities. |
| `run_ref` | según operación | Run/change explícito; no aplica al primer `init`. |
| `actor` | sí | Identidad y autoridad declarada del solicitante. |
| `input` | sí | Payload específico de la operación. |

El request NO PUEDE usar cwd, memoria conversacional, variables globales o el
nombre de una carpeta como sustituto de esas referencias. Un HostAdapter PUEDE
proponer valores descubiertos, pero debe materializarlos en el request antes de
autorizar cualquier efecto.

Las referencias además DEBEN ser coherentes entre sí:

- `project_ref.dogma_ref_id == dogma_ref.dogma_id`;
- `project_ref.artifact_store_ref_id == artifact_store_ref.store_ref_id`;
- `artifact_store_ref.project_id == project_ref.project_id`;
- cuando existe, `run_ref.project_id == project_ref.project_id`;
- en Slice 1, `run_ref.baseline == project_ref.target.baseline`.

JSON Schema valida la forma, no puede demostrar esas igualdades. Virgil las
verifica antes de efectos y el harness las trata como oráculos semánticos.

### Payloads mínimos

- `virgil.init`: `project_id` propuesto y autorización de self-hosting cuando
  aplique.
- `virgil.new`: `change_id`, intención inicial, procedencia y evidencia inicial
  opcional.
- `virgil.continue`: `change_id` y exactamente una entrada tipada: respuesta,
  propuesta de contenido, decisión de aprobación o solicitud de recuperación.

Una entrada de aprobación DEBE identificar actor, autoridad, artefacto y
revisión. La palabra “aprobado” en texto libre no es una decisión válida.

## Resolución previa a efectos

Antes de ejecutar cualquier escritura, Virgil:

1. valida versión, operación e identidad/idempotency del request;
2. resuelve rutas y recursos canónicos de DogmaRef, ProjectRef y
   ArtifactStoreRef;
3. verifica la coherencia cruzada de sus IDs y baseline;
4. aplica `method_source != target` y autorización de self-hosting;
5. obtiene policy y capabilities efectivas de los adapters;
6. deriva el estado desde ledger y revisiones persistidas;
7. construye un plan de efectos autorizado.

Una falla en estos pasos es fail-closed. No existe una inicialización parcial
“best effort”.

## `EffectRecord`

Todo intento que podría leer, escribir o invocar un recurso externo produce un
registro estructurado con:

- `effect_id`, `request_id` y relación de causalidad;
- `kind`: `read | write | external_call`;
- recurso o path canónico;
- adapter y capability utilizados;
- decisión de policy: `authorized | denied | unsupported`;
- efecto solicitado y efecto realmente observado;
- digest o identidad del estado anterior y posterior, cuando aplique;
- referencias a eventos, artefactos o evidencia que lo justifican.

Una autorización no demuestra que el efecto ocurrió. Una afirmación del actor
tampoco. El harness compara solicitud, decisión y observación.

Con `repo-docs`, cada write autorizado debe quedar bajo `managed_root` y ser
explicable por revisiones, briefs o eventos publicados. Con un adapter externo,
el target diff de planning permanece vacío.

Un `EffectRecord` describe un **efecto lógico sobre un recurso del adapter**, no
cada syscall usada para publicarlo. En el init T0 con `repo-docs` hay
exactamente un write lógico: la publicación de `virgil.json`. `virgil.new` y
`virgil.continue` publican, del mismo modo, exactamente un write lógico cada
uno — la reescritura de `virgil.json` o de un único
`docs/{NN}-{kind}.md` — porque no existe un event log paralelo que publicar
junto al recurso. Temporales, `fsync` y el rename son mecanismos internos
cuya atomicidad se demuestra mediante snapshots y evidencia filesystem; no
agregan EffectRecords ni inflan los conteos del fixture.

Las reglas `prohibited_effects` del harness se evalúan solo sobre registros con
`occurred = true`. Los intentos denegados permanecen auditables como
`expected_effects`, pero no se confunden con una mutación prohibida consumada.

## `OperationResult`

Toda operación devuelve un resultado estructurado con:

| Campo | Requerido | Semántica |
|---|---:|---|
| `protocol_version` | sí | Versión efectiva del contrato. |
| `operation` | sí | Operación canónica resuelta. |
| `request_id` | sí | Correlación exacta con el request. |
| `idempotency_key` | sí | Intención estable usada para retry/replay. |
| `status` | sí | Estado terminal de esta invocación. |
| `requested_context` | sí | Referencias exactamente solicitadas, aun si no pudieron resolverse. |
| `resolved_context` | cuando resuelve | Referencias canónicas efectivas; no se inventa ante identidad ambigua. |
| `derived_step` | cuando exista | Primer artefacto requerido no aprobado o `complete`. |
| `artifacts` | sí | Revisiones leídas o publicadas con IDs. Puede ser vacío. |
| `briefs` | sí | ContextBrief consultados o publicados. Puede ser vacío. |
| `events` | sí | Eventos durablemente publicados. Puede ser vacío. |
| `effects` | sí | EffectRecords solicitados, decididos y observados. |
| `next` | sí | Próxima acción permitida o condición terminal. |
| `diagnostics` | sí | Códigos tipados, capabilities faltantes y preguntas. |

El resultado PUEDE acompañarse con una explicación humana, pero la explicación
no reemplaza ningún campo estructurado.

## Semántica de `status`

| Status | Significado |
|---|---|
| `success` | La operación alcanzó su boundary; todos los efectos autorizados quedaron publicados y no existe una violación o stop sin resolver. |
| `needs_input` | El siguiente avance exige una entrada tipada. Los efectos ya publicados se enumeran y son recuperables. |
| `blocked` | Una precondición, gate o policy impide continuar. No ocurrió ningún efecto no autorizado. |
| `unsupported` | Falta una capability o garantía requerida y no existe degradación declarada. |
| `error` | El runtime/adapter falló inesperadamente; Virgil no presenta estado parcial como autoritativo. |

`status` pertenece a la invocación. No es lifecycle del cambio ni de una
revisión.

## Diagnósticos mínimos

Los adapters pueden agregar códigos, pero Slice 1 reserva:

- `IDENTITY_AMBIGUOUS`;
- `METHOD_TARGET_COLLISION`;
- `SELF_HOST_UNAUTHORIZED`;
- `IDEMPOTENCY_CONFLICT`;
- `PRECONDITION_FAILED`;
- `APPROVAL_REQUIRED`;
- `STORE_POLICY_VIOLATION`;
- `CAPABILITY_UNSUPPORTED`;
- `ATOMICITY_UNSUPPORTED`;
- `CORRUPT_LEDGER`;
- `INTERNAL_ERROR`.

Cada diagnóstico incluye código, severidad, scope afectado, condición
observable y siguiente acción permitida. Un mensaje de excepción sin código no
satisface el protocolo.

## Idempotencia

La combinación de proyecto, operación e `idempotency_key` identifica una
intención:

1. mismo key y mismo digest de request devuelve el mismo resultado semántico o
   su replay recuperado, sin duplicar eventos ni revisiones;
2. mismo key con contenido distinto responde `IDEMPOTENCY_CONFLICT`;
3. un retry conserva causalidad hacia el primer `request_id`;
4. una respuesta perdida no autoriza a repetir efectos no idempotentes.

El digest estable del request es `sha256` de su representación JSON
canonicalizada según RFC 8785, excluyendo únicamente `request_id`. El
`idempotency_key` sí participa: no es metadata del transporte. Dos requests que
solo difieren en `request_id` son el mismo contenido para replay; cualquier
otra diferencia produce otro digest y, con la misma key, un conflicto.

Un replay enumera en su `OperationResult.effects` solo los efectos nuevos del
intento actual —por ejemplo, reads autorizados para recuperar el resultado— y
usa `replayed_from_request_id` para enlazar la invocación original. Nunca copia
los writes originales como si hubieran ocurrido otra vez. La equivalencia
semántica ignora `request_id`, timestamps, `replayed_from_request_id` y esa
lista de efectos frescos; no ignora eventos, revisiones, briefs, status ni next.

## Publicación y recuperación

Un resultado solo referencia eventos, revisiones o briefs publicados de forma
durable por el ArtifactStoreAdapter. Temporales y objetos sin evento completo
no forman parte del estado derivado.

Si la publicación falla, el resultado es `error` o `unsupported` según la
causa, y recovery ignora objetos huérfanos. Una corrida fresca debe poder
reconstruir `resolved_context`, `derived_step` y el resultado semántico de un
retry sin leer la conversación anterior.

## Forma machine-readable

Los JSON Schemas normativos de esta versión viven en
[`schemas/`](schemas/README.md). El schema gobierna la forma serializada; este
documento gobierna la semántica y las invariantes que el schema no puede
expresar. Una contradicción entre ambos es un error de contrato y detiene la
operación.

## Regla de compatibilidad

Un HostAdapter o ArtifactStoreAdapter es conforme solo si puede traducir este
protocolo sin perder identidad, idempotencia, diagnósticos, efectos ni stop
conditions. Si no puede representar una garantía, devuelve `unsupported`; no
la reemplaza con prosa ni con éxito aparente.
