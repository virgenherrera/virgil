# Slice 1 — Contratos host-neutral de skills/tools

## Alcance

Estos contratos describen intención observable. No son `SKILL.md`, comandos
de una CLI ni prompts para un proveedor específico.

Skills y tools se ejecutan principalmente en el contexto del repo consumidor,
pero DEBEN recibir:

- `ProjectRef` con target explícito;
- `DogmaRef` y versión explícitos;
- `ArtifactStoreRef`, adapter y policy explícitos;
- HostAdapter y snapshot de capabilities.

El cwd puede ayudar al HostAdapter a proponer un target, pero no prueba
identidad ni autoriza efectos. HostAdapter gobierna discovery/invocación;
ArtifactStoreAdapter gobierna persistencia/retrieval. Ninguno reemplaza al otro.

## OutputEnvelope común

Toda operación devuelve un envelope que permite continuar sin interpretar
prosa libre. Su forma normativa para Slice 1 se define en el
[protocolo de operaciones](operation-protocol.md). Debe incluir, cuando
aplique:

- `operation`;
- `status`: `success | needs_input | blocked | unsupported | error`;
- ProjectRef, DogmaRef, ArtifactStoreRef y run/change;
- HostAdapter y ArtifactStoreAdapter efectivos;
- artefacto/paso actual derivado;
- revisiones, briefs y eventos escritos;
- roots/recursos resueltos, allowlist y efectos observados;
- siguiente acción permitida;
- preguntas o condición de stop;
- capabilities faltantes y warnings.

La representación específica de cada host puede variar, pero no puede omitir
los campos e invariantes del protocolo. `status` describe esa invocación: no se
persiste como lifecycle del cambio.

## `virgil-init`

### Inputs

- `DogmaRef`, incluido Method Pack/version;
- `ProjectRef` con target explícito;
- `ArtifactStoreRef` con adapter y policy;
- `project_id` propuesto o identidad a resolver;
- snapshot de capabilities del HostAdapter.

### Behavior

1. Resuelve y valida DogmaRef, ProjectRef y ArtifactStoreRef sin inferir
   identidad solo desde cwd.
2. Aplica `method_source != target`.
3. Solicita al ArtifactStoreAdapter sus roots/recursos y policy efectivos.
4. Verifica capabilities, durabilidad y atomicidad requeridas.
5. Crea el namespace del proyecto mediante el adapter configurado.
6. Registra adapter ID/version, roots, allowlist y efectos de inicialización.

### Writes

- Con `repo-docs`: solo `managed_root`, recomendado
  `{target}/docs/virgil/`.
- Con un adapter externo: solo los recursos externos autorizados; target diff
  vacío.

`virgil-init` no escribe código, producto, configuración ni documentación
fuera de la allowlist efectiva.

### Stop conditions

- DogmaRef y target son iguales o ambiguos;
- falta ProjectRef, ArtifactStoreRef o policy explícita;
- `repo-docs` resuelve un managed root fuera del corpus/root permitido;
- la operación escribiría fuera de la allowlist;
- `project_id` colisiona con una identidad incompatible;
- falta persistencia durable/atomicidad requerida;
- el Method Pack no puede resolverse.

## `virgil-new`

### Inputs

- ProjectRef, DogmaRef y ArtifactStoreRef existentes;
- `change_id` nuevo;
- intención inicial y actor que la proporcionó;
- override explícito del Method Pack, si aplica;
- evidencia inicial opcional con procedencia.

### Behavior

1. Resuelve las tres referencias y sus adapters sin inferir identidad del cwd.
2. Rechaza colisiones de `change_id` dentro del proyecto.
3. Fija el Method Pack y crea el `RunContext`.
4. Persiste identidad y evento de creación mediante ArtifactStoreAdapter.
5. Compila el primer `ContextBrief` para `idea`.
6. Si la intención alcanza, crea una revisión `draft`; si no, devuelve
   preguntas acotadas como `needs_input`.

### Writes

Solo eventos, briefs y revisiones del namespace autorizado por
ArtifactStoreRef. Bajo `repo-docs`, el diff debe quedar dentro de
`managed_root` y estar respaldado por esos objetos.

### Stop conditions

- referencia inexistente o identidad inconsistente;
- `change_id` ya usado en el mismo proyecto;
- intención ausente o ambigua para el primer brief;
- capability requerida no soportada;
- cualquier efecto excedería la policy del ArtifactStoreAdapter.

## `virgil-continue`

### Inputs

- ProjectRef, DogmaRef, ArtifactStoreRef y `change_id` explícitos;
- respuestas, contenido o decisión de aprobación recibidos;
- actor responsable de esa entrada.

### Behavior

1. Recupera ledger, revisiones y briefs mediante ArtifactStoreAdapter.
2. Verifica que adapter, roots/recursos y policy coincidan con el RunContext.
3. Recalcula revisiones aprobadas efectivas.
4. Deriva el primer artefacto requerido no aprobado.
5. Solicita al Method Pack el contrato de rol, routing y gate aplicable.
6. Compila un `ContextBrief` mínimo desde la read allowlist.
7. Ejecuta como máximo el trabajo permitido hasta la próxima condición de input
   o aprobación.
8. Persiste revisiones, eventos y efectos antes de devolver el siguiente paso.

`virgil-continue` no salta aprobaciones y no usa memoria conversacional como
sustituto del ArtifactStore.

### Writes

Solo revisiones, briefs y eventos autorizados por ArtifactStoreRef. Con
`repo-docs`, documentos existentes fuera de `managed_root` permanecen
intactos salvo opt-in explícito y registrado.

### Stop conditions

- se necesita input humano o decisión de aprobación;
- el gate solicita correcciones;
- todos los artefactos requeridos tienen revisión aprobada efectiva;
- el ledger o las referencias no permiten un siguiente paso único;
- falta una capability requerida;
- continuar excedería el write scope o intentaría modificar código, producto o
  configuración.

## Portabilidad

Las operaciones anteriores son canónicas. Un ArtifactStoreAdapter puede
traducirlas a filesystem, Jira, Confluence, Basecamp, GitHub Projects/Issues u
otro sistema, pero no cambia su semántica. Los nombres, workflows o IDs de un
producto externo no se codifican en el kernel.
