# Protocolo de operaciones

[← docs/](../README.md) · [← specification/](./README.md)

Superficie publica wire-level de Virgil. Skills, CLIs, MCP servers u otros HostAdapters
PUEDEN representarla de forma distinta, pero DEBEN conservar los campos, estados e
invariantes observables. Transporte: JSON-RPC 2.0 (compatible con MCP).

Referencia constitucional: Principia S3b (flujo de invocacion), S5 (componentes).

## OperationRequest

Toda invocacion recibe un request estructurado. El request NO PUEDE usar cwd, memoria
conversacional ni variables globales como sustituto de referencias explicitas.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `protocol_version` | string | si | `virgil.dev/planning-slice1/v1alpha1` |
| `operation` | string | si | Operacion canonica (ver contratos en `skill-contracts.md`) |
| `request_id` | string | si | UUID unico de este intento |
| `idempotency_key` | string | si | Clave estable para reintentos de la misma intencion |
| `project_ref` | ProjectRef | si | Identidad estable del proyecto y target |
| `artifact_store_ref` | ArtifactStoreRef | si | Adapter, version, namespace y policy |
| `host` | HostSnapshot | si | HostAdapter, version y capabilities |
| `actor` | ActorRef | si | Identidad y autoridad declarada del solicitante |
| `input` | object | si | Payload especifico de la operacion |
| `run_ref` | RunRef | cond | Run/change explicito; no aplica al primer `init` |

### Coherencia cruzada

Las referencias DEBEN ser coherentes entre si:

- `artifact_store_ref.project_id == project_ref.project_id`
- Cuando existe `run_ref`: `run_ref.project_id == project_ref.project_id`

JSON Schema valida la forma; Virgil verifica las igualdades semanticas antes de efectos.

## OperationResult

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `protocol_version` | string | si | Version efectiva del contrato |
| `operation` | string | si | Operacion canonica resuelta |
| `request_id` | string | si | Correlacion exacta con el request |
| `idempotency_key` | string | si | Intencion estable usada para retry/replay |
| `status` | Status | si | Estado terminal de esta invocacion |
| `derived_step` | string | cond | Primer artefacto requerido no aprobado, o `complete` |
| `artifacts` | array | si | Revisiones leidas o publicadas (puede ser vacio) |
| `effects` | array | si | EffectRecords solicitados, decididos y observados |
| `next` | NextAction | si | Proxima accion permitida o condicion terminal |
| `diagnostics` | array | si | Codigos tipados y capabilities faltantes |

## Semantica de status

| Status | Significado |
|---|---|
| `success` | Operacion alcanzo su boundary; efectos autorizados publicados |
| `needs_input` | El siguiente avance exige una entrada tipada del actor |
| `blocked` | Una precondicion, gate o policy impide continuar |
| `unsupported` | Falta una capability requerida sin degradacion declarada |
| `error` | Fallo inesperado; no se presenta estado parcial como autoritativo |

## EffectRecord

Toda operacion que lee, escribe o invoca un recurso produce un registro estructurado.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `effect_id` | string | si | Identidad unica del efecto |
| `request_id` | string | si | Correlacion con el request que lo causo |
| `kind` | enum | si | `read`, `write` o `external_call` |
| `resource` | string | si | Path canonico o identificador del recurso |
| `decision` | enum | si | `authorized`, `denied` o `unsupported` |
| `occurred` | bool | si | Si el efecto realmente se consumo |
| `digest_before` | string | cond | SHA-256 del estado anterior (writes) |
| `digest_after` | string | cond | SHA-256 del estado posterior (writes) |

Un EffectRecord describe un efecto logico sobre un recurso del adapter, no cada syscall
usada para publicarlo. Temporales, `fsync` y rename son mecanismos internos.

## Idempotencia

La combinacion de proyecto, operacion e `idempotency_key` identifica una intencion:

1. Mismo key y mismo digest de request devuelve el mismo resultado semantico (replay).
2. Mismo key con contenido distinto responde `IDEMPOTENCY_CONFLICT`.
3. Un retry conserva causalidad hacia el primer `request_id`.

El digest estable del request es SHA-256 de su representacion JSON canonicalizada segun
RFC 8785 (JCS), excluyendo unicamente `request_id`. El `idempotency_key` SI participa
en el digest.

## Codigos de diagnostico reservados

| Codigo | Semantica |
|---|---|
| `IDENTITY_AMBIGUOUS` | Referencia no puede resolverse sin ambiguedad |
| `IDEMPOTENCY_CONFLICT` | Mismo key, contenido distinto |
| `PRECONDITION_FAILED` | Precondicion semantica no satisfecha |
| `APPROVAL_REQUIRED` | Se necesita decision de aprobacion humana |
| `STORE_POLICY_VIOLATION` | Escritura excede la policy del adapter |
| `CAPABILITY_UNSUPPORTED` | El host o adapter no soporta una capability requerida |
| `CORRUPT_LEDGER` | Estado inconsistente detectado en el store |
| `INTERNAL_ERROR` | Error inesperado del runtime |

Cada diagnostico incluye `code`, `severity`, `scope` y `message`. Un mensaje de excepcion
sin codigo no satisface el protocolo.

## Errores tipados

| Tipo | Semantica | Accion del cliente |
|---|---|---|
| Transient | Fallo temporal (timeout, red) | Reintentar con misma `idempotency_key` |
| Permanent | Violacion de contrato o estado invalido | Corregir el request antes de reintentar |

---

[↑ specification](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Modelo de estado](./state-model.md) →
