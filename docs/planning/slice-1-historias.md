# Historias de usuario — Slice 1

[← docs/](../README.md) · [← planning/](./README.md)

Historias derivadas de `docs/specification/`, agrupadas por area funcional (prefijo del
ID). Cada historia referencia los requisitos de especificacion que debe satisfacer; no
duplica su contenido.

## H-PROTO1: Constantes y tipos wire del protocolo

**Como** el runtime de Virgil, **necesito** fijar las constantes y tipos wire del
protocolo, **para** que todo adapter y transporte interoperen contra el mismo contrato.

**Criterios de aceptacion**:

- Transporte JSON-RPC 2.0/MCP; `protocol_version = virgil.dev/planning-slice1/v1alpha1`.
- Envelopes declaran `runtime_protocol = virgil.dev/runtime/v1alpha1` y `kind`; el
  decoder rechaza campos duplicados, trailing data y payloads fuera de limite.
- Cada diagnostico expone `code`, `severity`, `scope`, `message` del catalogo reservado.
- Errores se clasifican Transient (reintentable con la misma key) o Permanent.

**Requisitos de especificacion**: SPEC-PROTO-REQUEST, SPEC-PROTO-INVOKE,
SPEC-PROTO-DIAGNOSTICS, SPEC-PROTO-ERRORS

## H-REQ1: Validacion, coherencia y pipeline de resolucion de OperationRequest

**Como** el runtime de Virgil, **necesito** validar forma, coherencia cruzada y
ejecutar el pipeline de 7 pasos de cada OperationRequest, **para** que ninguna
operacion actue sobre referencias ambiguas ni escriba con una falla fail-open.

**Criterios de aceptacion**:

- Todo request declara `protocol_version`, `operation`, `request_id`,
  `idempotency_key`, `dogma_ref`, `project_ref`, `artifact_store_ref`, `host`,
  `actor`, `input`; `run_ref` es condicional (no aplica al primer `init`); no se usa
  `cwd` ni memoria conversacional como referencia.
- Se verifican las igualdades de coherencia cruzada entre referencias, incluida
  `run_ref.baseline == project_ref.target.baseline`.
- Pipeline en orden: validar identidad, resolver rutas canonicas, verificar
  coherencia cruzada, aplicar `method_source != target`, obtener
  policy/capabilities, derivar estado del ledger, construir el plan de efectos;
  efectos denegados se registran con `occurred = false`.
- Una falla en cualquier paso detiene el pipeline completo; sin inicializacion
  parcial "best effort".

**Requisitos de especificacion**: SPEC-PROTO-REQUEST, SPEC-PROTO-PIPELINE

## H-RES1: OperationResult y semantica de status

**Como** el runtime de Virgil, **necesito** producir un OperationResult con status
terminal tipado, **para** que todo cliente distinga exito, bloqueo y error sin prosa.

**Criterios de aceptacion**:

- El result incluye `status`, `requested_context`, `resolved_context` (condicional),
  `derived_step` (condicional), `artifacts`, `briefs`, `events`, `effects`, `next`,
  `diagnostics`.
- `status` es `success` | `needs_input` | `blocked` | `unsupported` | `error`; describe
  la invocacion, nunca el lifecycle del cambio.
- `resolved_context` nunca se inventa cuando la identidad es ambigua.

**Requisitos de especificacion**: SPEC-PROTO-RESULT, SPEC-PROTO-STATUS

## H-EFF1: EffectRecord y trazabilidad de efectos

**Como** el runtime de Virgil, **necesito** registrar un EffectRecord por cada efecto
sobre un recurso, **para** que lectura, escritura e invocacion externa queden auditadas.

**Criterios de aceptacion**:

- Cada EffectRecord expone `kind` (`read` | `write` | `external_call`), `resource`,
  `decision` (`authorized` | `denied` | `unsupported`) y `occurred`.
- `digest_before`/`digest_after` (SHA-256) son condicionales y aplican a writes.
- Describe un efecto logico, no cada syscall (temporales/fsync/rename son internos).

**Requisitos de especificacion**: SPEC-PROTO-EFFECT

## H-IDEM1: Idempotencia y contrato de replay

**Como** el runtime de Virgil, **necesito** que proyecto + operacion + `idempotency_key`
identifiquen una unica intencion, **para** que un retry nunca duplique efectos.

**Criterios de aceptacion**:

- Mismo key y digest devuelve el mismo resultado (replay); mismo key con contenido
  distinto responde `IDEMPOTENCY_CONFLICT`.
- Digest = SHA-256 JCS (RFC 8785) excluyendo solo `request_id`; `idempotency_key` SI
  participa del digest.
- Un replay enumera solo efectos nuevos, usa `replayed_from_request_id` y nunca copia
  writes originales; su equivalencia ignora `request_id`/timestamps, no eventos/status.

**Requisitos de especificacion**: SPEC-PROTO-IDEMPOTENCY, SPEC-PROTO-REPLAY

## H-ENV1: Envelopes de proceso invoke y run_t0

**Como** el runtime de Virgil, **necesito** envolver OperationRequest/Result en
envelopes de transporte sin modificarlos, **para** ejecutar operaciones publicas y
corridas del harness T0.

**Criterios de aceptacion**:

- `invoke` lleva `process_id`, el OperationRequest exacto, `bindings.target`/
  `bindings.resources` (solo URIs ya declaradas, sin discovery por cwd) y `clock`
  deterministico.
- `invoke_result` incluye `process_id`, `os_pid` y el OperationResult; el worker no se
  presenta como observador independiente de su propio exito.
- `run_t0` declara `fixture_ids`, `workspace_root`, `evidence_root`, `clock`;
  `run_t0_result` da outcome por fixture (`passed`/`failed`, distinto del status) y el
  EvidenceBundle publicado.

**Requisitos de especificacion**: SPEC-PROTO-INVOKE, SPEC-PROTO-RUN-T0

## H-STATE1: Maquina de estados de revision

**Como** el runtime de Virgil, **necesito** que la unica lifecycle persistida sea la de
una revision de artefacto, **para** que fase y progreso se deriven siempre por consulta.

**Criterios de aceptacion**:

- El Pack Scrum requiere `idea, spec, design, tasks, handoff` en orden (posiciones 1 a
  5, no 0 a 4). Solo una revision abierta (`draft`/`awaiting_approval`) por tipo y
  cambio.
- Transiciones legales: `draft->awaiting_approval`, `draft->withdrawn`,
  `awaiting_approval->approved`, `awaiting_approval->withdrawn`,
  `approved->superseded`; `withdrawn`/`superseded` son terminales.
- Una `approved` es efectiva solo sin sucesora abierta, sin `superseded`/`withdrawn`, y
  con `upstream_refs` a revisiones efectivas actuales. `derived_step` es el primer tipo
  sin revision efectiva, o `complete`; no existen estados `phase`/`stale`/`in_progress`
  persistidos.
- Un pivot crea `draft` para el primer tipo afectado; al aprobarse, la anterior pasa a
  `superseded` y se revisa el downstream.

**Requisitos de especificacion**: SPEC-STATE-TYPES, SPEC-STATE-TRANSITIONS,
SPEC-STATE-INVARIANT, SPEC-STATE-EFFECTIVE, SPEC-STATE-DERIVED, SPEC-STATE-PIVOT

## H-REPO1: Layout, escritura y atomicidad de repo-docs

**Como** el adapter repo-docs, **necesito** persistir revisiones y `virgil.json` con
escritura atomica y create-exclusive, **para** conservar un unico writer sin degradar a
last-write-wins.

**Criterios de aceptacion**:

- Layout: `{target}/virgil.json` y `{target}/docs/virgil/{change_id}/{NN}-{kind}.md`,
  con `managed_root = docs/virgil/` (no `docs/`). Frontmatter delimitado por `---` con
  contenido JSON (no YAML): `schema`, `artifact_kind`, `change_id`, `status`,
  `revision`, `content_digest`.
- Solo se escribe `virgil.json` y `docs/virgil/{change_id}/{NN}-{kind}.md` propios;
  documentos fuera de `docs/virgil/` son read-only, sin `CORRUPT_LEDGER`.
- `virgil.json` usa create-exclusive-y-rename; actualizaciones copy-rewrite-rename; sin
  atomicidad/durabilidad del host, responde `unsupported`.
- Crear/presentar/aprobar/retirar reescriben solo frontmatter; una correccion retira la
  revision presentada y crea sucesora `draft` con `revision` incrementada. No persiste
  `derived_step`: lo recalcula escaneando `docs/virgil/{change_id}/` y el `status` de
  cada frontmatter.
- Self-hosting requiere autorizacion explicita sin colisionar con el dogma canonico;
  Slice 1 admite un solo writer por cambio.

**Requisitos de especificacion**: SPEC-REPO-LAYOUT, SPEC-REPO-FRONTMATTER,
SPEC-REPO-WRITE-SCOPE, SPEC-REPO-ATOMICITY, SPEC-REPO-LIFECYCLE, SPEC-REPO-DERIVATION,
SPEC-REPO-SELFHOST, SPEC-REPO-CONCURRENCY

## H-CTX1: RunContext, ContextBrief y PlanningGapDetected

**Como** el runtime de Virgil, **necesito** construir RunContext y ContextBrief
auditables y reportar PlanningGapDetected, **para** que cada operacion actue dentro de
limites explicitos y trazables.

**Criterios de aceptacion**:

- RunContext expone `run_id`, `change_id`, `project_ref`, `intention`, `scope`,
  `target_baseline`, `method_pack`, `permissions`; se crea en `virgil-new`, se recupera
  en `virgil-continue`, y el Method Pack no cambia mid-run.
- ContextBrief expone `brief_id`, `objective`, `scope`, `artifacts`, `sources`,
  `capabilities`, `success_conditions`, `block_conditions`; cada fuente incluida es
  auditable.
- PlanningGapDetected expone `run_ref`, `scope`, `condition`, `evidence`,
  `can_continue_outside_scope`, y NO autoriza a execution a redefinir ACs ni handoffs
  aprobados.

**Requisitos de especificacion**: SPEC-OPS-RUNCONTEXT, SPEC-OPS-CONTEXTBRIEF,
SPEC-OPS-GAP

## H-OPS1: Operacion virgil-init

**Como** el runtime de Virgil, **necesito** inicializar un proyecto validando DogmaRef,
ProjectRef y ArtifactStoreRef sin inferir identidad desde cwd, **para** crear el
namespace solo cuando identidad y capabilities son inequivocas.

**Criterios de aceptacion**:

- Inputs: `project_id`, `dogma_ref`, `project_ref`, `artifact_store_ref`, `host`.
- Aplica `method_source != target`, verifica capabilities, crea el namespace via el
  adapter y registra roots/allowlist/efectos.
- Se detiene si DogmaRef y target colisionan, falta referencia/policy, `project_id`
  colisiona, el managed root cae fuera del corpus, o falta durabilidad/atomicidad.

**Requisitos de especificacion**: SPEC-OPS-INIT

## H-OPS2: Operacion virgil-new

**Como** el runtime de Virgil, **necesito** crear un cambio con su RunContext y el
primer ContextBrief de `idea`, **para** entregar una revision `draft` o preguntas
acotadas cuando la intencion no alcanza.

**Criterios de aceptacion**:

- Inputs: `change_id`, `intention`, `actor` (`evidence` opcional).
- Rechaza colisiones de `change_id`, fija el Method Pack, crea el RunContext y crea
  `draft` si la intencion alcanza (si no, `needs_input` con preguntas acotadas).
- Se detiene si `change_id` esta en uso, la intencion es ambigua, o falta capability.

**Requisitos de especificacion**: SPEC-OPS-NEW

## H-OPS3: Operacion virgil-continue

**Como** el runtime de Virgil, **necesito** recuperar el estado del cambio y avanzar
como maximo hasta la proxima condicion de input o aprobacion, **para** que ninguna
invocacion exceda el write scope de planning.

**Criterios de aceptacion**:

- Inputs: `change_id`, `entry` (`response` | `content_proposal` | `approval_decision` |
  `recovery_request`), `actor`.
- Recalcula revisiones efectivas, deriva `derived_step`, compila un ContextBrief minimo
  y persiste revisiones/eventos/efectos antes del siguiente paso.
- Se detiene ante input/aprobacion pendiente, correcciones del gate, `complete`, ledger
  ambiguo, capability faltante, o exceso del write scope.

**Requisitos de especificacion**: SPEC-OPS-CONTINUE

## H-OPS4: Operacion virgil-status

**Como** el runtime de Virgil, **necesito** reportar el estado de cada revision y el
`derived_step` actual sin efectos de escritura, **para** consultar el progreso de forma
segura y repetible.

**Criterios de aceptacion**:

- `change_id` es opcional; si se omite, reporta el estado general del proyecto.
- Escanea revisiones persistidas, deriva `derived_step` y devuelve estado, step actual
  y siguiente accion.
- Operacion read-only: no produce EffectRecords de tipo `write`.

**Requisitos de especificacion**: SPEC-OPS-STATUS

## H-OPS5: Operacion virgil-transition

**Como** el runtime de Virgil, **necesito** validar y ejecutar transiciones de revision
segun la maquina de estados, **para** que ninguna transicion ilegal o no autorizada se
persista.

**Criterios de aceptacion**:

- Inputs: `change_id`, `artifact_kind`, `transition`, `actor`.
- Valida contra la maquina de estados, verifica la invariante de revision unica,
  ejecuta y persiste el evento, recalcula `derived_step`.
- Se detiene si la transicion no esta permitida, el actor no tiene autoridad, o se
  violaria la invariante de revision unica.

**Requisitos de especificacion**: SPEC-OPS-TRANSITION

## H-SCHEMA1: Catalogo de JSON Schemas y autoridad

**Como** el runtime de Virgil, **necesito** registrar los 14 schemas normativos bundled
y resolver referencias desde esa copia versionada, **para** validar sin depender de
acceso de red a `schemas.virgil.dev`.

**Criterios de aceptacion**:

- El catalogo cubre common, operation-request/result, effect-record, virgil-config,
  scenario-fixture, actor-script, agent-interaction-trace, evidence-bundle,
  filesystem-snapshot/diff, runner-observation-report, doc-frontmatter, context-brief.
- Schemas normativos para la estructura; el protocolo normativo para semantica. Ante
  contradiccion, implementacion y harness se detienen con error de contrato.
- Un cambio incompatible publica version e `$id` nuevos; el adapter no transforma
  versiones de forma implicita.

**Requisitos de especificacion**: SPEC-SCHEMA-CATALOG, SPEC-SCHEMA-AUTHORITY,
SPEC-SCHEMA-EVOLUTION

## H-SCHEMA2: Reglas de oraculo del harness T0

**Como** el harness T0, **necesito** aplicar las reglas de oraculo que JSON Schema no
puede demostrar por si solo, **para** certificar un scenario solo cuando la interaccion
real y sus efectos externos lo respaldan.

**Criterios de aceptacion**:

- Verifica coherencia de IDs/baselines entre fixture, request, target y adapter
  profile; falla cerrado ante discrepancia.
- ActorScript: secuencias crecientes, primer `invoke` identico byte a byte al
  `initial_request`, `retry` conserva idempotency key, `OrderConstraint` sin ciclos.
  AgentInteractionTrace: secuencias crecientes, `causation_id` valido, contexto
  respeta allowlist/denylist y budget.
- EvidenceBundle: exactamente un trace y un runner report; referencias top-level
  coinciden por digest; `project_state` no se inventa si `virgil.json` no existe.
- `prohibited_effects` invalida solo efectos con `occurred = true` (un intento
  denegado no es por si mismo el efecto prohibido); `ExpectedOutcome` es
  `passed`/`failed`, y un scenario que esperaba `blocked`/`unsupported` puede
  certificar `passed`.
- Digests excluyen `integrity.digest`; `virgil.json` recalcula el digest JCS del
  `original_request` contra `idempotency.request_digest`.

**Requisitos de especificacion**: SPEC-SCHEMA-ORACLE-IDENTITY,
SPEC-SCHEMA-ORACLE-ACTORSCRIPT, SPEC-SCHEMA-ORACLE-TRACE, SPEC-SCHEMA-ORACLE-BUNDLE,
SPEC-SCHEMA-ORACLE-PROHIBITED, SPEC-SCHEMA-ORACLE-OUTCOME, SPEC-SCHEMA-ORACLE-INTEGRITY,
SPEC-SCHEMA-ORACLE-PROJECTSTATE

---

← Anterior: [Epics](./epics.md) · [↑ planning](./README.md) · [↑↑ docs](../README.md) ·
Siguiente: [Tareas](./slice-1-tareas.md) →
