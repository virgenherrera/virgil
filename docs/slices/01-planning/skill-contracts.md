# Slice 1 — Contratos host-neutral de skills

## Alcance

Estos contratos describen intención observable. No son `SKILL.md`, comandos
de una CLI ni prompts para un proveedor específico. Un RuntimeAdapter puede
exponerlos con la interfaz nativa del host siempre que conserve su semántica.

## OutputEnvelope común

Toda operación devuelve un envelope que permite continuar sin interpretar
prosa libre. Debe incluir, cuando aplique:

- `operation`;
- `status`: `success | needs_input | blocked | unsupported | error`;
- referencias de proyecto y cambio;
- artefacto/paso actual derivado;
- revisiones, briefs y eventos escritos;
- siguiente acción permitida;
- preguntas o condición de stop;
- capacidades faltantes y warnings.

La forma serializada se definirá con la implementación del slice.
`status` describe el resultado de esa invocación: no se persiste como lifecycle
del cambio ni agrega una segunda máquina de estados.

## `virgil-init`

### Inputs

- referencia y versión de `method_source`;
- referencia explícita de `target`;
- `store_root`;
- `project_id` propuesto o identidad a resolver;
- Method Pack, Scrum por defecto;
- snapshot de capacidades del RuntimeAdapter.

### Behavior

1. Canonicaliza y valida source, target y store.
2. Aplica los guards de aislamiento.
3. Verifica que el runtime soporte persistencia durable single-writer.
4. Crea el namespace y `ProjectRef` sin escribir en el target.
5. Registra el evento de inicialización.

### Writes

Solo `project.json` y eventos de inicialización dentro del store externo.

### Stop conditions

- source y target son iguales o ambiguos;
- el store cae dentro de source o target;
- `project_id` colisiona con una identidad incompatible;
- falta persistencia durable o escritura atómica requerida;
- el Method Pack no puede resolverse.

## `virgil-new`

### Inputs

- `ProjectRef` existente;
- `change_id` nuevo;
- intención inicial y actor que la proporcionó;
- override explícito del Method Pack, si aplica;
- evidencia inicial opcional con procedencia.

### Behavior

1. Resuelve el proyecto sin inferirlo del cwd.
2. Rechaza colisiones de `change_id` dentro del proyecto.
3. Fija el Method Pack y crea el `RunContext` del cambio.
4. Persiste `change.json` y el evento de creación.
5. Compila el primer `ContextBrief` para `idea`.
6. Si la intención alcanza para producir contenido, crea una revisión `draft`;
   si no, devuelve preguntas acotadas como `needs_input`.

### Writes

Solo el namespace del cambio, sus eventos, briefs y revisiones dentro del
store externo.

### Stop conditions

- proyecto inexistente o identidad inconsistente;
- `change_id` ya usado en el mismo proyecto;
- intención ausente o ambigua para el primer brief;
- capacidad requerida no soportada;
- cualquier operación intentaría escribir en el target.

## `virgil-continue`

### Inputs

- `ProjectRef` y `change_id` explícitos;
- respuestas, contenido o decisión de aprobación recibidos en este turno;
- actor responsable de esa entrada.

### Behavior

1. Recupera ledger, revisiones y briefs desde el store.
2. Recalcula revisiones aprobadas efectivas.
3. Deriva el primer artefacto requerido no aprobado.
4. Solicita al Method Pack el contrato de rol, routing y gate aplicable.
5. Compila un `ContextBrief` mínimo para una acción acotada.
6. Ejecuta como máximo el trabajo permitido hasta la próxima condición de
   input o aprobación.
7. Persiste revisiones y eventos antes de devolver el siguiente paso.

`virgil-continue` no salta una aprobación pendiente y no usa memoria de
conversación como sustituto del store.

### Writes

Solo revisiones, briefs y eventos del cambio en el store externo. Nunca el
target.

### Stop conditions

- se necesita input humano o decisión de aprobación;
- el gate solicita correcciones;
- todos los artefactos requeridos tienen revisión aprobada efectiva;
- el ledger o las referencias no permiten derivar un siguiente paso único;
- falta una capacidad requerida;
- continuar implicaría escribir en el target.
