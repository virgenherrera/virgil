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

## virgil-init

### Inputs

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| `project_id` | string | si | Identidad propuesta del proyecto |
| `project_ref` | ProjectRef | si | Identidad y target explicitos |
| `artifact_store_ref` | ArtifactStoreRef | si | Adapter, version y policy |
| `host` | HostSnapshot | si | Capabilities del HostAdapter |

### Comportamiento

1. Resuelve y valida ProjectRef y ArtifactStoreRef sin inferir identidad desde cwd.
2. Verifica capabilities, durabilidad y atomicidad requeridas.
3. Crea el namespace del proyecto mediante el adapter configurado.
4. Registra adapter ID/version, roots, allowlist y efectos de inicializacion.

### Stop conditions

- Falta ProjectRef, ArtifactStoreRef o policy explicita.
- `project_id` colisiona con una identidad incompatible existente.
- `repo-docs` resuelve un managed root fuera del corpus permitido.
- Falta persistencia durable o atomicidad requerida.

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
5. Si la intencion alcanza, crea una revision `draft` para `idea`.
6. Si no alcanza, devuelve preguntas acotadas como `needs_input`.

### Stop conditions

- `change_id` ya usado en el mismo proyecto.
- Intencion ausente o ambigua para el primer brief.
- Referencia inexistente o identidad inconsistente.
- Capability requerida no soportada.

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
5. Ejecuta como maximo el trabajo permitido hasta la proxima condicion de input o aprobacion.
6. Persiste revisiones y efectos antes de devolver el siguiente paso.

### Stop conditions

- Se necesita input humano o decision de aprobacion.
- El gate solicita correcciones.
- Todos los artefactos requeridos tienen revision aprobada efectiva (`complete`).
- Falta una capability requerida.
- Continuar excederia el write scope o intentaria modificar codigo, producto o configuracion.

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

← Anterior: [Adapter repo-docs](./repo-docs-adapter.md) · [↑ specification](./README.md) · [↑↑ docs](../README.md)
