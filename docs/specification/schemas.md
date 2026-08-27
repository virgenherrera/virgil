# Catalogo de JSON Schemas

[← docs/](../README.md) · [← specification/](./README.md)

JSON Schemas normativos de la version `virgil.dev/planning-slice1/v1alpha1`. Definen la
forma machine-readable del protocolo. Los adapters DEBEN registrar los schemas bundled y
resolver referencias desde esa copia versionada; validarlos no requiere acceso de red a
`schemas.virgil.dev`.

Referencia normativa: [Protocolo de operaciones](./operation-protocol.md).

<!-- SPEC-SCHEMA-CATALOG -->
## Schemas disponibles

| Schema | `$id` | Proposito | Componente que valida |
|---|---|---|---|
| `common.schema.json` | `.../v1alpha1/common.schema.json` | Referencias, adapters, actors, diagnosticos y tipos compartidos | Todos los componentes |
| `operation-request.schema.json` | `.../v1alpha1/operation-request.schema.json` | Inputs estructurados de `virgil.init`, `virgil.new` y `virgil.continue` | OperationRequest |
| `operation-result.schema.json` | `.../v1alpha1/operation-result.schema.json` | Resultado correlacionable, recuperable y no dependiente de prosa | OperationResult |
| `effect-record.schema.json` | `.../v1alpha1/effect-record.schema.json` | Decision de policy y efecto realmente observado | EffectRecord |
| `virgil-config.schema.json` | `.../v1alpha1/virgil-config.schema.json` | Forma de `virgil.json`: identidad del proyecto, `dogma_ref`, `managed_root` | ProjectState / virgil-init |
| `scenario-fixture.schema.json` | `.../v1alpha1/scenario-fixture.schema.json` | Actor, adapters, oraculos, budget de contexto y efectos prohibidos | Harness T0 |
| `actor-script.schema.json` | `.../v1alpha1/actor-script.schema.json` | Secuencia deterministica de invocaciones, retries, intentos out-of-band y stops | Harness T0 |
| `agent-interaction-trace.schema.json` | `.../v1alpha1/agent-interaction-trace.schema.json` | Secuencia causal de instrucciones, decisiones, llamadas, contexto y efectos | Traza de evidencia |
| `evidence-bundle.schema.json` | `.../v1alpha1/evidence-bundle.schema.json` | Manifest inmutable de traza, autoridad de init, diffs, checks, outcome e integridad | Certificacion |
| `filesystem-snapshot.schema.json` | `.../v1alpha1/filesystem-snapshot.schema.json` | Estado observado de un root target/store en un checkpoint | Observacion de filesystem |
| `filesystem-diff.schema.json` | `.../v1alpha1/filesystem-diff.schema.json` | Cambios exactos entre dos snapshots del mismo root | Observacion de filesystem |
| `runner-observation-report.schema.json` | `.../v1alpha1/runner-observation-report.schema.json` | Procesos reales, checkpoints y checks calculados por el harness externo | Harness T0 |
| `doc-frontmatter.schema.json` | `.../v1alpha1/doc-frontmatter.schema.json` | Bloque JSON de frontmatter de documentos gestionados (idea, requirements, design, tasks) | Adapter repo-docs |
| `context-brief.schema.json` | `.../v1alpha1/context-brief.schema.json` | Paquete minimo suficiente que recibe un actor para una operacion | ContextBrief |

Todos los `$id` usan el prefijo `https://schemas.virgil.dev/planning-slice1/v1alpha1/`.

<!-- SPEC-SCHEMA-AUTHORITY -->
## Autoridad

Los schemas son normativos para la **estructura serializada**. El
[protocolo de operaciones](./operation-protocol.md) es normativo para la semantica y las
invariantes que JSON Schema no puede expresar por si solo.

Si schema y protocolo parecen contradecirse, la implementacion y el harness DEBEN detenerse
con un error de contrato. No eligen silenciosamente una fuente.

<!-- SPEC-SCHEMA-EVOLUTION -->
## Evolucion

- Una correccion compatible puede agregar aclaraciones semanticas o constraints que no
  invaliden documentos validos existentes.
- Un cambio incompatible publica una nueva version de protocolo y nuevos `$id`.
- Un adapter declara exactamente que version acepta; no transforma versiones de forma
  implicita.

## Reglas de oraculo del harness

Las igualdades entre IDs, el orden causal, la unicidad de secuencias, la minimizacion
semantica del contexto y la correspondencia entre manifest y bytes son oraculos del
harness: JSON Schema no puede demostrarlos por si solo.

<!-- SPEC-SCHEMA-ORACLE-IDENTITY -->
### Coherencia de identidades y baselines

El harness verifica que fixture, request, target y adapter profile usan los mismos IDs y
baselines. Toda discrepancia falla cerrado.

<!-- SPEC-SCHEMA-ORACLE-ACTORSCRIPT -->
### ActorScript

- Usa el actor del fixture, tiene secuencias unicas y crecientes, y cada accion declara
  `process_id`.
- Su primer `invoke` coincide byte por byte con `initial_request`.
- Cada `retry` apunta mediante `retries_action_id` a un `invoke` anterior y conserva su
  idempotency key y contenido canonico salvo `request_id`.
- Cada `OrderConstraint` referencia steps existentes y no forma ciclos.
- `min_count <= max_count` en todas las expectativas.

<!-- SPEC-SCHEMA-ORACLE-TRACE -->
### AgentInteractionTrace

- Tiene secuencias unicas y crecientes.
- Cada `causation_id` apunta a una entrada anterior o al request raiz.
- `context_requested` y `context_delivered` conservan `brief_id`, respetan
  allowlist/denylist y no exceden el budget.
- El outcome del trace coincide con el scenario y con los checks del bundle.

<!-- SPEC-SCHEMA-ORACLE-BUNDLE -->
### EvidenceBundle

- Cada contenido, diff y trace del manifest coincide con sus bytes y digest.
- Cada `BundleContent.schema_id` selecciona el schema exacto de sus bytes: JSON se valida
  como un documento y `application/x-ndjson` linea por linea; no se aceptan blobs, roles o
  media types sin formato normativo.
- Cada checkpoint referencia un step existente; `relative_to` es `fixture_baseline` o un
  checkpoint anterior y sus diffs se calculan entre esos dos estados, no siempre contra el
  baseline inicial.
- El bundle contiene exactamente un trace y un runner report, y al menos los snapshots y
  diffs target/store requeridos por la corrida.
- Las referencias top-level `trace`, `runner_report` y `diffs` deben coincidir por URI y
  digest con sus respectivos contents.
- `checks` y `outcome` del manifest deben coincidir con el runner report.
- Los target/store diffs top-level siempre son el intervalo `fixture_baseline` a ultimo
  checkpoint.
- Para un init exitoso se incluye ademas un `project_state` (bytes observados de
  `virgil.json`). En un scenario bloqueado antes de que `virgil.json` exista, ese rol no
  se inventa.

### Proceso y recovery

- Un evento `recovery` seguido de un retry fresh-process cambia `process_id`, y el replay
  solo atribuye al segundo request sus reads nuevos, nunca los writes originales.

### Adapter repo-docs

- Para `repo-docs`, cada path del store diff tambien aparece en el target diff del mismo
  intervalo.

<!-- SPEC-SCHEMA-ORACLE-PROHIBITED -->
### ProhibitedEffect

- `ProhibitedEffect.scope` evita inventar una sintaxis de complemento para globs:
  `matching_resource_pattern` aplica el patron literal, `outside_effective_policy` usa la
  policy resuelta del adapter y `by_request` atribuye la prohibicion a un intento concreto.
- Los patrones usan `/` y glob `*`/`**`; no aceptan prefijos de negacion como `!`.
- `prohibited_effects` invalida unicamente efectos que **ocurrieron**
  (`EffectRecord.occurred = true`). Un intento correctamente denegado se registra en
  `expected_effects` con `policy_decision = denied`, `occurred = false` y
  `observed = null`; no constituye por si mismo el efecto prohibido que el guard evito.

<!-- SPEC-SCHEMA-ORACLE-OUTCOME -->
### ExpectedOutcome

- `ExpectedOutcome` describe la certificacion del scenario y solo puede ser `passed` o
  `failed`. `blocked` y `unsupported` pertenecen a OperationResult: un scenario que
  esperaba y observo correctamente uno de esos stops puede pasar.

<!-- SPEC-SCHEMA-ORACLE-INTEGRITY -->
### Integridad y digests

- Los digests de AgentInteractionTrace y EvidenceBundle se calculan sobre su serializacion
  canonica excluyendo el campo `integrity.digest`.
- Los recursos enumerados por un bundle siempre incluyen digest propio.
- `field_equals` usa JSON Pointers absolutos como keys y escalares como valores. El harness
  compara cada pointer contra el objeto observado antes de aplicar los limites
  `min_count`/`max_count`; una key ausente nunca equivale a `null`.

<!-- SPEC-SCHEMA-ORACLE-PROJECTSTATE -->
### project_state

- `project_state`, cuando presente, se valida contra `virgil-config.schema.json` como un
  unico documento JSON.
- `virgil.json` conserva su propia copia completa de `original_request`, que es la
  evidencia durable: el harness recalcula su digest JCS RFC 8785 (excluyendo unicamente
  `request_id`) y lo compara contra `idempotency.request_digest`.
- `idempotency.original_request_id` debe coincidir con `original_request.request_id`.
- `resolved_context` debe resolver la misma identidad que `original_request` con el
  `canonical_path` real del target; una discrepancia falla cerrado.

### Paths y observacion de filesystem

- Los paths dentro de snapshots y diffs son canonicos, usan `/` y son relativos al `root`
  declarado. `root.uri` y `root.resolved_path` se entregan explicitamente; no se infieren
  desde CWD.
- Un baseline vacio se representa con `entries: []`.
- `scope_path` define el subconjunto observado: `/` para el target completo y
  `/{managed_root}` para el store `repo-docs`.
- Cada entry conserva `type`, `mode`, `size` y `sha256`. Para archivos regulares, `size` y
  `sha256` corresponden a sus bytes. Para symlinks, corresponden a los bytes exactos del
  link target devueltos por `readlink`: el harness **no sigue** el symlink.
- Los directorios se recorren pero no se enumeran. `mode` son siempre los cuatro digitos
  octales de permisos; el tipo vive en `type`. Cada path aparece una sola vez.
- Un diff siempre identifica `from_checkpoint`, `to_checkpoint` y un root explicito. Cada
  change conserva estado anterior/posterior completo; `added` exige `before: null`,
  `deleted` exige `after: null` y `modified` exige ambos.

### Fixtures T0

Las fixtures T0 y sus ActorScripts viven en el directorio de validacion de fixtures. Los
tres fixtures T0 declaran cero ArtifactEnvelope y cero ContextBrief; el bundle v1alpha1 no
admite roles opacos para ellos. Una slice que produzca esos objetos debe publicar primero su
schema exacto y versionar/ampliar el contrato.

---

← Anterior: [Contratos de operaciones](./skill-contracts.md) · [↑ specification](./README.md) · [↑↑ docs](../README.md)
