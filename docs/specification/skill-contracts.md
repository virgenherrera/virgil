# Contratos de operaciones

[← docs/](../README.md) · [← specification/](./README.md)

Contratos host-neutral para las operaciones canonicas de Virgil. Estos contratos
describen intencion observable; no son prompts, comandos de CLI ni SKILL.md para un
proveedor especifico. Cada operacion se mapea a un MCP tool.

Referencia constitucional: Principia S3b (flujo de invocacion), S5 (componentes),
S9c (delegationContract).

## OutputEnvelope comun

Toda operacion devuelve un envelope estructurado cuya forma normativa se define en
`operation-protocol.md`. El envelope incluye `status`, referencias resueltas, artefactos,
efectos, siguiente accion y diagnosticos. Un HostAdapter PUEDE variar la representacion
pero no PUEDE omitir campos ni invariantes del protocolo.

<!-- SPEC-OPS-RUNCONTEXT -->
## RunContext

Identifica el cambio activo y los limites dentro de los cuales puede actuar un runtime.
Todo efecto sobre el target o sobre el estado del proceso pertenece a un `RunContext`.

Campos minimos:

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `run_id` | string | si | Identidad del run/change |
| `change_id` | string | si | Identidad del cambio dentro del proyecto |
| `project_ref` | ProjectRef | si | Identidad estable del proyecto y target |
| `intention` | string | si | Intencion declarada del cambio |
| `scope` | object | si | Scope permitido y exclusiones |
| `derived_step` | string | cond | Primer artefacto requerido no aprobado, o `complete` |
| `target_baseline` | string | si | Baseline del target al inicio del run |
| `method_pack` | MethodPackRef | si | Method Pack fijado para el run (no cambia mid-run) |
| `host` | HostSnapshot | si | HostAdapter y snapshot de capacidades |
| `artifact_store_ref` | ArtifactStoreRef | si | Ref, policy efectiva y capabilities |
| `permissions` | object | si | Permisos de lectura, escritura y escalacion |

El `RunContext` se crea en `virgil-new` y se recupera en `virgil-continue`. El Method Pack
queda fijado al crear el run; no se cambia mid-run.

<!-- SPEC-OPS-CONTEXTBRIEF -->
## ContextBrief

Paquete minimo suficiente que recibe un actor para una operacion. El brief no necesita
contener el conocimiento global, pero debe ser posible auditar por que cada fuente fue
incluida.

Campos minimos:

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `brief_id` | string | si | Identidad unica del brief |
| `objective` | string | si | Objetivo y resultado esperado |
| `scope` | object | si | Scope permitido y exclusiones |
| `artifacts` | array | si | Artefactos, hechos y evidencia seleccionados |
| `sources` | array | si | Referencias a las fuentes y su frescura |
| `artifact_store_ref` | ArtifactStoreRef | si | Ref, allowlist aplicada y exclusiones |
| `capabilities` | array | si | Capacidades autorizadas para esta operacion |
| `success_conditions` | array | si | Condiciones de exito observables |
| `block_conditions` | array | si | Condiciones de bloqueo y escalacion |
| `budget` | object | cond | Budget de contexto cuando aplique |

<!-- SPEC-OPS-GAP -->
## PlanningGapDetected

Mensaje mediante el cual execution devuelve una insuficiencia a planning.
`PlanningGapDetected` NO autoriza a execution a redefinir ACs, decisiones o handoffs
aprobados.

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `run_ref` | RunRef | si | Run/change afectado |
| `scope` | object | si | Scope afectado dentro del cambio |
| `condition` | string | si | Condicion aprobada que no puede ejecutarse o verificarse |
| `evidence` | array | si | Evidencia que demuestra el gap |
| `can_continue_outside_scope` | bool | si | Si el trabajo puede continuar fuera de ese scope |

<!-- SPEC-OPS-INIT -->
## virgil-init

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `project_id` | string | si | Identidad propuesta del proyecto |
| `dogma_ref` | DogmaRef | si | Source y version/digest del dogma y Method Pack |
| `project_ref` | ProjectRef | si | Identidad y target explicitos |
| `artifact_store_ref` | ArtifactStoreRef | si | Adapter, version y policy |
| `host` | HostSnapshot | si | Capabilities del HostAdapter |

### Comportamiento

1. Resuelve y valida DogmaRef, ProjectRef y ArtifactStoreRef sin inferir identidad desde cwd.
2. Aplica `method_source != target`: DogmaRef y target no pueden resolver a la misma ruta canonica.
3. Verifica capabilities, durabilidad y atomicidad requeridas.
4. Crea el namespace del proyecto mediante el adapter configurado.
5. Registra adapter ID/version, roots, allowlist y efectos de inicializacion.

### Stop conditions

- DogmaRef y target resuelven a la misma ruta canonica.
- Falta ProjectRef, ArtifactStoreRef o policy explicita.
- `project_id` colisiona con una identidad incompatible existente.
- `repo-docs` resuelve un managed root fuera del corpus permitido.
- Falta persistencia durable o atomicidad requerida.
- El Method Pack no puede resolverse.

<!-- SPEC-OPS-NEW -->
## virgil-new

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `change_id` | string | si | Identidad unica del cambio |
| `intention` | string | si | Descripcion de la intencion inicial |
| `actor` | ActorRef | si | Quien proporciona la intencion |
| `evidence` | array | no | Evidencia inicial con procedencia |

### Comportamiento

1. Resuelve las referencias del proyecto y sus adapters.
2. Rechaza colisiones de `change_id` dentro del proyecto.
3. Fija el Method Pack y crea el RunContext.
4. Persiste identidad y evento de creacion mediante ArtifactStoreAdapter.
5. Compila el primer `ContextBrief` para `idea` desde la read allowlist.
6. Si la intencion alcanza, crea una revision `draft` para `idea`.
7. Si no alcanza, devuelve preguntas acotadas como `needs_input`.

### Stop conditions

- `change_id` ya usado en el mismo proyecto.
- Intencion ausente o ambigua para el primer brief.
- Referencia inexistente o identidad inconsistente.
- Capability requerida no soportada.

<!-- SPEC-OPS-CONTINUE -->
## virgil-continue

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `change_id` | string | si | Cambio activo explicito |
| `entry` | ContinueEntry | si | Respuesta, contenido, aprobacion o recuperacion |
| `actor` | ActorRef | si | Actor responsable de la entrada |

`ContinueEntry` es exactamente uno de: `response`, `content_proposal`, `approval_decision`
o `recovery_request`. Una entrada de aprobacion DEBE identificar actor, autoridad,
artefacto y revision.

### Comportamiento

1. Recupera revisiones y estado mediante ArtifactStoreAdapter.
2. Verifica que adapter, roots y policy coincidan con el RunContext.
3. Recalcula revisiones aprobadas efectivas.
4. Deriva el primer artefacto requerido no aprobado (`derived_step`).
5. Solicita al Method Pack el contrato de rol, routing y gate aplicable.
6. Compila un `ContextBrief` minimo desde la read allowlist.
7. Ejecuta como maximo el trabajo permitido hasta la proxima condicion de input o aprobacion.
8. Persiste revisiones, eventos y efectos antes de devolver el siguiente paso.

### Stop conditions

- Se necesita input humano o decision de aprobacion.
- El gate solicita correcciones.
- Todos los artefactos requeridos tienen revision aprobada efectiva (`complete`).
- El ledger o las referencias no permiten un siguiente paso unico.
- Falta una capability requerida.
- Continuar excederia el write scope o intentaria modificar codigo, producto o configuracion.

<!-- SPEC-OPS-STATUS -->
## virgil-status

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `change_id` | string | no | Si se omite, reporta estado general del proyecto |

### Comportamiento

1. Escanea revisiones persistidas mediante ArtifactStoreAdapter.
2. Deriva `derived_step` por la logica definida en `state-model.md`.
3. Devuelve estado de cada revision encontrada, step actual y siguiente accion.

Esta operacion es read-only: no produce EffectRecords de tipo `write`.

<!-- SPEC-OPS-TRANSITION -->
## virgil-transition

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `change_id` | string | si | Cambio objetivo |
| `artifact_kind` | string | si | Tipo de artefacto (`idea`, `spec`, etc.) |
| `transition` | string | si | Transicion solicitada (ver `state-model.md`) |
| `actor` | ActorRef | si | Actor que solicita la transicion |

### Comportamiento

1. Valida que la transicion sea legal segun la maquina de estados (ver `state-model.md`).
2. Verifica la invariante de revision unica.
3. Ejecuta la transicion y persiste el evento resultante.
4. Recalcula `derived_step` tras la transicion.

### Stop conditions

- Transicion no permitida por la maquina de estados.
- Actor sin autoridad para la transicion solicitada.
- Violacion de la invariante de revision unica.

## Portabilidad

Las operaciones anteriores son canonicas. Un ArtifactStoreAdapter puede traducirlas a
filesystem, Jira, GitHub Projects/Issues u otro sistema, pero no cambia su semantica.
Los nombres, workflows o IDs de un producto externo no se codifican en el kernel.

---

← Anterior: [Adapter repo-docs](./repo-docs-adapter.md) · [↑ specification](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Catalogo de schemas](./schemas.md) →
