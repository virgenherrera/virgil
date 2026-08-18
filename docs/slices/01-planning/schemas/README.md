# Schemas de Slice 2

Estos JSON Schemas definen la forma machine-readable del protocolo
`virgil.dev/planning-slice2/v1alpha1`.

Sus `$id` son identificadores canónicos. Los adapters DEBEN registrar los
schemas bundled y resolver referencias desde esa copia versionada; validarlos
no requiere acceso de red a `schemas.virgil.dev`.

## Contratos disponibles

- [`common.schema.json`](common.schema.json): referencias, adapters, actors,
  diagnósticos y tipos compartidos.
- [`operation-request.schema.json`](operation-request.schema.json): inputs
  estructurados de `virgil.init`, `virgil.write` y `virgil.transition`.
- [`effect-record.schema.json`](effect-record.schema.json): decisión de policy
  y efecto realmente observado.
- [`virgil-config.schema.json`](virgil-config.schema.json): forma de
  `virgil.json`, el archivo de control del adapter en la raíz del target —
  identidad del proyecto, `dogma_ref`, `managed_root`.
- [`operation-result.schema.json`](operation-result.schema.json): resultado
  correlacionable, recuperable y no dependiente de prosa.
- [`scenario-fixture.schema.json`](scenario-fixture.schema.json): actor,
  adapters, oráculos, budget de contexto y efectos prohibidos de un scenario.
- [`actor-script.schema.json`](actor-script.schema.json): secuencia
  determinística de invocaciones, retries, intentos out-of-band y stops de T0.
- [`agent-interaction-trace.schema.json`](agent-interaction-trace.schema.json):
  secuencia causal de instrucciones, decisiones, llamadas, contexto y efectos.
- [`evidence-bundle.schema.json`](evidence-bundle.schema.json): manifest
  inmutable de traza, autoridad de init, diffs, checks, outcome e integridad.
- [`filesystem-snapshot.schema.json`](filesystem-snapshot.schema.json): estado
  observado de un root target/store en un checkpoint.
- [`filesystem-diff.schema.json`](filesystem-diff.schema.json): cambios exactos
  entre dos snapshots del mismo root.
- [`runner-observation-report.schema.json`](runner-observation-report.schema.json):
  procesos reales, checkpoints y checks calculados por el harness externo.
- [`doc-frontmatter.schema.json`](doc-frontmatter.schema.json): forma del
  bloque JSON de frontmatter (`---json` … `---`) al inicio de cada documento
  gestionado por Virgil: idea, requirements, design y tasks. Los tasks incluyen
  `status` (backlog/refined/active/done/released) y `refs` (requirements,
  design, implements).

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
- cada `BundleContent.schema_id` selecciona el schema exacto de sus bytes: JSON
  se valida como un documento y `application/x-ndjson` línea por línea; no se
  aceptan blobs, roles o media types sin formato normativo;
- cada checkpoint referencia un step existente; `relative_to` es
  `fixture_baseline` o un checkpoint anterior y sus diffs se calculan entre
  esos dos estados, no siempre contra el baseline inicial;
- un evento `recovery` seguido de un retry fresh-process cambia `process_id`, y
  el replay solo atribuye al segundo request sus reads nuevos, nunca los writes
  originales;
- para `repo-docs`, cada path del store diff también aparece en el target diff
  del mismo intervalo.

## Paths y observación de filesystem

Los paths dentro de snapshots y diffs son canónicos, usan `/` y son relativos
al `root` declarado: `/` identifica el propio root, nunca el filesystem del
host. `root.uri` y `root.resolved_path` se entregan explícitamente; no se
infieren desde CWD. Un baseline vacío se representa con `entries: []`.
`scope_path` define el subconjunto observado en esas coordenadas: `/` para el
target completo y `/{managed_root}` para el store `repo-docs`. Por eso un path
del store coincide byte por byte con el mismo path del target.

Cada entry conserva `type`, `mode`, `size` y `sha256`. Para archivos regulares,
`size` y `sha256` corresponden a sus bytes. Para symlinks, corresponden a los
bytes exactos del link target devueltos por `readlink`: el harness **no sigue**
el symlink. Los directorios se recorren pero no se enumeran: así el diff lógico
de init conserva exactamente `virgil.json`, sin convertir sus parents en
writes. Como `virgil.json` vive fuera de `managed_root`, el diff scoped al
store (`/docs`) de un init nunca lo observa: solo el diff del target completo
lo hace. El check obligatorio `no_unexpected_nodes` falla ante un
directorio temporal/huérfano o cualquier nodo no explicado. `mode` son siempre
los cuatro dígitos octales de permisos; el tipo vive en `type`. Cada path
aparece una sola vez. Estas invariantes son semánticas y el harness las
recalcula fuera del worker.

Las expectativas de fixture conservan paths policy-relative sin `/` inicial;
el harness las compara con evidencia prefijando exactamente `/`. No aplica
`filepath.Clean`, CWD ni otra reinterpretación ambiental.

Un diff siempre identifica `from_checkpoint`, `to_checkpoint` y un root
explícito. Cada change conserva estado anterior/posterior completo; `added`
exige `before: null`, `deleted` exige `after: null` y `modified` exige ambos.
Cada path aparece a lo sumo una vez y `modified` exige que al menos uno de
`type`, `mode`, `size` o `sha256` haya cambiado.

El runner report enlaza cada checkpoint con snapshots/diffs inmutables y
registra PID real, ejecutable, acciones, requests, exit code y hashes de los
streams capturados por proceso. `fresh_process: true` es una afirmación que el
selector app-level debe contrastar con el subprocess observado, no una prueba
por sí sola. `byte_count` y `sha256` describen los bytes **después** de redacción
y truncado; los bytes crudos con potenciales secrets no se persisten ni se
hashean dentro del bundle.

## Contenidos obligatorios del EvidenceBundle

El bundle contiene exactamente un trace y un runner report, y al menos los
snapshots y diffs target/store requeridos por la corrida. Las referencias
top-level `trace`, `runner_report` y `diffs` deben coincidir por URI y digest
con sus respectivos contents; cada snapshot/diff citado por el runner report
también debe estar enumerado. `checks` y `outcome` del manifest deben
coincidir con el runner report; los target/store diffs top-level siempre son el
intervalo `fixture_baseline` → último checkpoint. Para un init exitoso se
incluye además un `project_state` (los bytes observados de `virgil.json`). En
un scenario bloqueado antes de que `virgil.json` exista, ese rol no se
inventa. Estas correspondencias y la cardinalidad condicional por outcome son
oráculos semánticos del harness.

Los tres fixtures T0 declaran cero ArtifactEnvelope y cero ContextBrief, por eso
el bundle v1alpha1 no admite roles opacos para ellos. Una slice que produzca
esos objetos debe publicar primero su schema exacto y versionar/ampliar este
contrato; no puede esconderlos como `check_output` o JSON arbitrario.

`project_state`, cuando presente, se valida contra
`virgil-config.schema.json` como un único documento JSON — ya no hay un log de
eventos NDJSON que validar línea por línea. `virgil.json` conserva su propia
copia completa de `original_request`, que es la evidencia durable: el harness
recalcula su digest JCS RFC 8785 (excluyendo únicamente `request_id`) y lo
compara contra `idempotency.request_digest`; `idempotency.original_request_id`
debe coincidir con `original_request.request_id`. `resolved_context` debe
resolver la misma identidad que `original_request` con el `canonical_path`
real del target; una discrepancia falla cerrado.

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
