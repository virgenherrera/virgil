# Schemas de Slice 1

Estos JSON Schemas definen la forma machine-readable del protocolo
`virgil.dev/planning-slice1/v1alpha1`.

Sus `$id` son identificadores canónicos. Los adapters DEBEN registrar los
schemas bundled y resolver referencias desde esa copia versionada; validarlos
no requiere acceso de red a `schemas.virgil.dev`.

## Contratos disponibles

- [`common.schema.json`](common.schema.json): referencias, adapters, actors,
  diagnósticos y tipos compartidos.
- [`operation-request.schema.json`](operation-request.schema.json): inputs
  estructurados de `virgil.init`, `virgil.new` y `virgil.continue`.
- [`effect-record.schema.json`](effect-record.schema.json): decisión de policy
  y efecto realmente observado.
- [`operation-result.schema.json`](operation-result.schema.json): resultado
  correlacionable, recuperable y no dependiente de prosa.
- [`scenario-fixture.schema.json`](scenario-fixture.schema.json): actor,
  adapters, oráculos, budget de contexto y efectos prohibidos de un scenario.
- [`actor-script.schema.json`](actor-script.schema.json): secuencia
  determinística de invocaciones, retries, intentos out-of-band y stops de T0.
- [`agent-interaction-trace.schema.json`](agent-interaction-trace.schema.json):
  secuencia causal de instrucciones, decisiones, llamadas, contexto y efectos.
- [`evidence-bundle.schema.json`](evidence-bundle.schema.json): manifest
  inmutable de traza, artefactos, diffs, checks, outcome e integridad.

## Autoridad

Los schemas son normativos para la **estructura serializada**. El
[protocolo de operaciones](../operation-protocol.md) es normativo para la
semántica y las invariantes que JSON Schema no puede expresar por sí solo.

Si schema y protocolo parecen contradecirse, la implementación y el harness
DEBEN detenerse con un error de contrato. No eligen silenciosamente una fuente.

## Evolución

- Una corrección compatible puede agregar aclaraciones semánticas o constraints
  que no invaliden documentos válidos existentes.
- Un cambio incompatible publica una nueva versión de protocolo y nuevos `$id`.
- Un adapter declara exactamente qué versión acepta; no transforma versiones
  de forma implícita.

Las igualdades entre IDs, el orden causal, la unicidad de secuencias, la
minimización semántica del contexto y la correspondencia entre manifest y bytes
son oráculos del harness: JSON Schema no puede demostrarlos por sí solo.

Como mínimo, el harness verifica además:

- fixture, request, target y adapter profile usan los mismos IDs y baselines;
- ActorScript usa el actor del fixture, tiene secuencias únicas y crecientes, y
  cada acción declara `process_id`; su primer `invoke` coincide byte por byte
  con `initial_request`; cada `retry` apunta mediante `retries_action_id` a un
  `invoke` anterior y conserva su idempotency key y contenido canónico salvo
  `request_id`;
- cada `OrderConstraint` referencia steps existentes y no forma ciclos;
- `min_count <= max_count` en todas las expectativas;
- un trace tiene secuencias únicas y crecientes, y cada `causation_id` apunta a
  una entrada anterior o al request raíz;
- `context_requested` y `context_delivered` conservan `brief_id`, respetan
  allowlist/denylist y no exceden el budget;
- el outcome del trace coincide con el scenario y con los checks del bundle;
- cada contenido, diff y trace del manifest coincide con sus bytes y digest.
- cada checkpoint referencia un step existente; `relative_to` es
  `fixture_baseline` o un checkpoint anterior y sus diffs se calculan entre
  esos dos estados, no siempre contra el baseline inicial;
- un evento `recovery` seguido de un retry fresh-process cambia `process_id`, y
  el replay solo atribuye al segundo request sus reads nuevos, nunca los writes
  originales;
- para `repo-docs`, cada path del store diff también aparece en el target diff
  del mismo intervalo.

`field_equals` usa JSON Pointers absolutos como keys y escalares como valores.
El harness compara cada pointer contra el objeto observado antes de aplicar los
límites `min_count`/`max_count`; una key ausente nunca equivale a `null`.

`ProhibitedEffect.scope` evita inventar una sintaxis de complemento para globs:
`matching_resource_pattern` aplica el patrón literal, `outside_effective_policy`
usa la policy resuelta del adapter y `by_request` atribuye la prohibición a un
intento concreto. Los patrones usan `/` y glob `*`/`**`; no aceptan prefijos de
negación como `!`.

`prohibited_effects` invalida únicamente efectos que **ocurrieron**
(`EffectRecord.occurred = true`). Un intento correctamente denegado se registra
en `expected_effects` con `policy_decision = denied`, `occurred = false` y
`observed = null`; no constituye por sí mismo el efecto prohibido que el guard
evitó. Esto permite certificar fail-closed sin ocultar el intento adversarial.

`ExpectedOutcome` describe la certificación del scenario y solo puede ser
`passed` o `failed`. `blocked` y `unsupported` pertenecen a OperationResult: un
scenario que esperaba y observó correctamente uno de esos stops puede pasar.

Los digests de AgentInteractionTrace y EvidenceBundle se calculan sobre su
serialización canónica excluyendo el campo `integrity.digest`; los recursos
enumerados por un bundle siempre incluyen digest propio.

Las fixtures T0 y sus ActorScripts viven en
[`../validation/fixtures/t0/`](../validation/fixtures/t0/). Validarlas y correr
su interacción completa Agent↔Virgil produce evidencia de certificación. Los
unit tests, si existen, solo diagnostican internals y no satisfacen este
contrato.
