# Protocolo de operaciones

[← docs/](../README.md) · [← specification/](./README.md)

Superficie publica wire-level de Virgil. Skills, CLIs, MCP servers u otros HostAdapters
PUEDEN representarla de forma distinta, pero DEBEN conservar los campos, estados e
invariantes observables. Transporte: JSON-RPC 2.0 (compatible con MCP).

Referencia constitucional: Principia S3b (flujo de invocacion), S5 (componentes).

<!-- SPEC-PROTO-REQUEST -->
## OperationRequest

Toda invocacion recibe un request estructurado. El request NO PUEDE usar cwd, memoria
conversacional ni variables globales como sustituto de referencias explicitas.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `protocol_version` | string | si | `virgil.dev/planning-slice1/v1alpha1` |
| `operation` | string | si | Operacion canonica (ver contratos en `skill-contracts.md`) |
| `request_id` | string | si | UUID unico de este intento |
| `idempotency_key` | string | si | Clave estable para reintentos de la misma intencion |
| `dogma_ref` | DogmaRef | si | Source y version/digest read-only del dogma y Method Pack |
| `project_ref` | ProjectRef | si | Identidad estable del proyecto y target |
| `artifact_store_ref` | ArtifactStoreRef | si | Adapter, version, namespace y policy |
| `host` | HostSnapshot | si | HostAdapter, version y capabilities |
| `actor` | ActorRef | si | Identidad y autoridad declarada del solicitante |
| `input` | object | si | Payload especifico de la operacion |
| `run_ref` | RunRef | cond | Run/change explicito; no aplica al primer `init` |

### Coherencia cruzada

Las referencias DEBEN ser coherentes entre si:

- `project_ref.dogma_ref_id == dogma_ref.dogma_id`
- `artifact_store_ref.project_id == project_ref.project_id`
- `project_ref.artifact_store_ref_id == artifact_store_ref.store_ref_id`
- Cuando existe `run_ref`: `run_ref.project_id == project_ref.project_id`
- En Slice 1: `run_ref.baseline == project_ref.target.baseline`

JSON Schema valida la forma; Virgil verifica las igualdades semanticas antes de efectos.

<!-- SPEC-PROTO-PIPELINE -->
## Resolucion previa a efectos

Antes de ejecutar cualquier escritura, Virgil ejecuta este pipeline de 7 pasos. Una falla
en cualquier paso es fail-closed. No existe una inicializacion parcial "best effort".

1. **Validar version, operacion e identidad/idempotency del request.** El request debe
   declarar `protocol_version`, `operation`, `request_id` e `idempotency_key` validos.
2. **Resolver rutas y recursos canonicos** de DogmaRef, ProjectRef y ArtifactStoreRef.
   Las URIs logicas se enlazan con roots absolutos mediante bindings explicitos.
3. **Verificar coherencia cruzada** de IDs y baseline entre las referencias (ver reglas de
   coherencia cruzada arriba).
4. **Aplicar `method_source != target`** y autorizacion de self-hosting. DogmaRef y target
   no pueden resolver a la misma ruta canonica.
5. **Obtener policy y capabilities efectivas** de los adapters. El HostAdapter y el
   ArtifactStoreAdapter declaran sus garantias disponibles.
6. **Derivar el estado desde ledger y revisiones persistidas.** El runtime reconstruye el
   contexto actual sin depender de memoria conversacional.
7. **Construir un plan de efectos autorizado.** Solo los efectos que pasan policy se
   incluyen en el plan; los denegados se registran como `EffectRecord` con
   `occurred = false`.

Este pipeline es el contrato de implementacion para el runtime. Los pasos son secuenciales
y cada paso depende del exito del anterior.

<!-- SPEC-PROTO-RESULT -->
## OperationResult

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `protocol_version` | string | si | Version efectiva del contrato |
| `operation` | string | si | Operacion canonica resuelta |
| `request_id` | string | si | Correlacion exacta con el request |
| `idempotency_key` | string | si | Intencion estable usada para retry/replay |
| `status` | Status | si | Estado terminal de esta invocacion |
| `requested_context` | array | si | Referencias exactamente solicitadas, aun si no pudieron resolverse |
| `resolved_context` | array | cond | Referencias canonicas efectivas; no se inventa ante identidad ambigua |
| `derived_step` | string | cond | Primer artefacto requerido no aprobado, o `complete` |
| `artifacts` | array | si | Revisiones leidas o publicadas (puede ser vacio) |
| `briefs` | array | si | ContextBrief consultados o publicados (puede ser vacio) |
| `events` | array | si | Eventos durablemente publicados (puede ser vacio) |
| `effects` | array | si | EffectRecords solicitados, decididos y observados |
| `next` | NextAction | si | Proxima accion permitida o condicion terminal |
| `diagnostics` | array | si | Codigos tipados, capabilities faltantes y preguntas |

<!-- SPEC-PROTO-STATUS -->
## Semantica de status

| Status | Significado |
|---|---|
| `success` | Operacion alcanzo su boundary; efectos autorizados publicados |
| `needs_input` | El siguiente avance exige una entrada tipada del actor |
| `blocked` | Una precondicion, gate o policy impide continuar |
| `unsupported` | Falta una capability requerida sin degradacion declarada |
| `error` | Fallo inesperado; no se presenta estado parcial como autoritativo |

<!-- SPEC-PROTO-EFFECT -->
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

<!-- SPEC-PROTO-IDEMPOTENCY -->
## Idempotencia

La combinacion de proyecto, operacion e `idempotency_key` identifica una intencion:

1. Mismo key y mismo digest de request devuelve el mismo resultado semantico (replay),
   sin duplicar eventos ni revisiones.
2. Mismo key con contenido distinto responde `IDEMPOTENCY_CONFLICT`.
3. Un retry conserva causalidad hacia el primer `request_id`.
4. Una respuesta perdida no autoriza a repetir efectos no idempotentes.

El digest estable del request es SHA-256 de su representacion JSON canonicalizada segun
RFC 8785 (JCS), excluyendo unicamente `request_id`. El `idempotency_key` SI participa
en el digest. Dos requests que solo difieren en `request_id` son el mismo contenido para
replay; cualquier otra diferencia produce otro digest y, con la misma key, un conflicto.

<!-- SPEC-PROTO-REPLAY -->
### Contrato de replay

Un replay enumera en su `OperationResult.effects` solo los efectos nuevos del intento
actual --por ejemplo, reads autorizados para recuperar el resultado-- y usa
`replayed_from_request_id` para enlazar la invocacion original. Nunca copia los writes
originales como si hubieran ocurrido otra vez.

La equivalencia semantica ignora `request_id`, timestamps, `replayed_from_request_id` y la
lista de efectos frescos del replay; **no ignora** eventos, revisiones, briefs, status ni
next.

<!-- SPEC-PROTO-DIAGNOSTICS -->
## Codigos de diagnostico reservados

| Codigo | Semantica |
|---|---|
| `IDENTITY_AMBIGUOUS` | Referencia no puede resolverse sin ambiguedad |
| `METHOD_TARGET_COLLISION` | DogmaRef y target resuelven a la misma ruta |
| `SELF_HOST_UNAUTHORIZED` | Self-hosting no autorizado para este proyecto |
| `IDEMPOTENCY_CONFLICT` | Mismo key, contenido distinto |
| `PRECONDITION_FAILED` | Precondicion semantica no satisfecha |
| `APPROVAL_REQUIRED` | Se necesita decision de aprobacion humana |
| `STORE_POLICY_VIOLATION` | Escritura excede la policy del adapter |
| `CAPABILITY_UNSUPPORTED` | El host o adapter no soporta una capability requerida |
| `ATOMICITY_UNSUPPORTED` | El adapter no puede garantizar atomicidad requerida |
| `CORRUPT_LEDGER` | Estado inconsistente detectado en el store |
| `INTERNAL_ERROR` | Error inesperado del runtime |

Cada diagnostico incluye `code`, `severity`, `scope` y `message`. Un mensaje de excepcion
sin codigo no satisface el protocolo.

## Envelopes de proceso

Los envelopes pertenecen al transporte del binario y envuelven --sin modificar-- los
contratos canonicos. No reemplazan `OperationRequest`, `OperationResult`,
`AgentInteractionTrace` ni `EvidenceBundle`.

Todos llevan `runtime_protocol = "virgil.dev/runtime/v1alpha1"` y un discriminador `kind`.
El decoder DEBE rechazar campos duplicados, trailing data, tipos desconocidos y payloads
que excedan los limites configurados.

<!-- SPEC-PROTO-INVOKE -->
### `invoke`

`kind = "invoke"` ejecuta una operacion publica.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `runtime_protocol` | string | si | `virgil.dev/runtime/v1alpha1` |
| `kind` | string | si | `"invoke"` |
| `process_id` | string | si | Identidad del proceso dentro del ActorScript |
| `request` | OperationRequest | si | Request canonico validado contra su schema |
| `bindings.target` | object | si | URI logica y root absoluto materializado por el host |
| `bindings.resources` | array | si | URIs ya declaradas con recursos explicitos y verificables |
| `clock` | object | si | Tiempo deterministico; el worker NO usa el reloj real |

- `request` DEBE ser el `OperationRequest` exacto; el transporte no agrega ni elimina
  campos canonicos.
- `bindings.target` enlaza la URI logica declarada por `ProjectRef` con un root absoluto
  materializado por el host. La ruta local NO sustituye esa identidad.
- `bindings.resources` solo puede enlazar URIs ya declaradas; T0 no habilita discovery de
  red ni resolucion por cwd.
- `clock` es input controlado; el worker NO usa el reloj real para campos que participan
  en un oraculo deterministico.

La respuesta `kind = "invoke_result"` contiene, como minimo, `runtime_protocol`,
`process_id`, `os_pid`, el `OperationResult` canonico y las observaciones de efectos
necesarias para que el host construya la traza. El worker no puede presentarse como
observador independiente de su propio exito: el runner vuelve a medir filesystem y procesos
desde afuera.

<!-- SPEC-PROTO-RUN-T0 -->
### `run_t0`

`kind = "run_t0"` ejecuta el harness black-box incluido en el mismo binario.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `runtime_protocol` | string | si | `virgil.dev/runtime/v1alpha1` |
| `kind` | string | si | `"run_t0"` |
| `fixture_ids` | array | si | Lista no vacia de IDs T0 embebidos |
| `workspace_root` | string | si | Root absoluto donde materializar targets aislados |
| `evidence_root` | string | si | Root absoluto separado de cada target y store |
| `clock` | object | si | Tiempo deterministico de la corrida |

La respuesta `kind = "run_t0_result"` enumera por fixture:

- outcome `passed | failed` del scenario, distinto del status de la operacion;
- procesos observados con `process_id` y PID del sistema operativo;
- clasificacion y checks ejecutados;
- referencia y digest del `EvidenceBundle` publicado, o la falla que impidio publicarlo.

Un scenario que esperaba un `OperationResult.status = "blocked"` puede tener outcome
`passed`. El runner NO declara `passed` solo porque un JSON valida: debe ejecutar la
interaccion y verificar sus efectos externos.

<!-- SPEC-PROTO-ERRORS -->
## Errores tipados

| Tipo | Semantica | Accion del cliente |
|---|---|---|
| Transient | Fallo temporal (timeout, red) | Reintentar con misma `idempotency_key` |
| Permanent | Violacion de contrato o estado invalido | Corregir el request antes de reintentar |

---

[↑ specification](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Modelo de estado](./state-model.md) →
