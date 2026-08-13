# Slice 1 — Adapter `repo-docs`

## Propósito y límites

`repo-docs` es el `ArtifactStoreAdapter` local predeterminado de Slice 1.
Persiste el ledger, las revisiones y los briefs operativos del proyecto
consumidor dentro de un namespace administrado de su propio repositorio.

No contiene el dogma de Virgil. No es una base de datos, un coordinador
concurrente ni una autorización para escribir cualquier archivo del target.
Puede ofrecer un corpus para retrieval/RAG, pero el índice sigue siendo una
proyección reconstruible; las revisiones y eventos conservan la autoridad.

## Dos namespaces `docs/`

Estos árboles no deben confundirse:

1. `Virgil/docs/` contiene el dogma operativo canónico de Virgil: protocolo,
   boundaries, Method Packs, quality y slices. Es read-only para consumidores.
2. `{consumer}/docs/` contiene conocimiento y artefactos operativos del
   proyecto consumidor cuando usa `repo-docs`.

Copiar artefactos del consumidor a `Virgil/docs/`, o dogma mutable al corpus
del consumidor, viola `method_source != target`.

## Referencias y roots

La inicialización recibe:

- `DogmaRef` con source y versión explícitos;
- `ProjectRef` con identidad y target explícitos;
- `ArtifactStoreRef` con `adapter_id = repo-docs`, versión y policy;
- `corpus_root`, por defecto `{target}/docs/`;
- `managed_root`, `docs/` — el mismo árbol que `corpus_root`, no un
  subdirectorio separado;
- `project_id`.

El adapter resuelve rutas canónicas, incluidos symlinks, y valida:

1. `method_source != target`;
2. el namespace declarado es exactamente `docs`;
3. la policy de lectura y escritura está versionada;
4. el HostAdapter ofrece las capabilities necesarias para los efectos
   solicitados.

Ni `ProjectRef` ni `ArtifactStoreRef` se infieren únicamente desde el cwd. La
identidad del proyecto (`project_id`) y el cambio activo (`change_id`) no
viven en un path anidado: se leen de `virgil.json`, en la raíz del target.

## Policy de lectura y escritura

Por defecto:

- el adapter PUEDE leer o indexar `corpus_root` según una allowlist explícita;
- solo PUEDE escribir `virgil.json` (raíz del target) y los archivos de
  artefacto `docs/{NN}-{kind}.md` que él mismo administra;
- los documentos existentes en `docs/` fuera de esos nombres exactos son
  read-only y no producen `CORRUPT_LEDGER`: conviven con el corpus del
  consumidor en el mismo árbol;
- código, producto y configuración permanecen fuera del write scope de
  planning.

`write_allowlist` sigue siendo `["docs/**"]` como cota de policy, pero el
adapter mismo restringe sus escrituras a los nombres de archivo conocidos
(`{NN}-{kind}.md`), nunca a un archivo arbitrario bajo `docs/`. `virgil.json`
es el archivo de control del adapter (análogo a `.git/config`) y vive fuera de
`corpus_root`/`managed_root`; su escritura por `virgil.init` no requiere que
`docs/` exista todavía.

Una escritura fuera de `managed_root` requiere un opt-in explícito, acotado a
paths concretos y registrado en la policy. No existe un permiso implícito por
estar dentro de `docs/`.

Cada operación registra en el `OperationResult`:

- ID y versión del ArtifactStoreAdapter;
- `DogmaRef`, `ProjectRef` y `ArtifactStoreRef` resueltos;
- el o los `EffectRecord` que describen exactamente qué archivo se escribió;
- diff observado y cualquier intento rechazado.

## Layout conceptual

```text
{target}/
  virgil.json                          # control file del adapter (raíz)
  docs/                                 # corpus_root == managed_root
    ... documentación existente ...    # read-only por defecto
    00-idea.md                          # frontmatter JSON + contenido
    01-spec.md
    02-design.md
    03-tasks.md
    04-handoff.md
```

`virgil.json` es la única autoridad de proyecto: identidad, `dogma_ref`,
`adapter`, `managed_root`, y — mientras existe — el cambio activo bajo
`active_change` (`change_id`, `intention`, `run_id`, `created_at`). Slice 1
sostiene un único cambio activo por proyecto: los nombres de archivo fijos
`{NN}-{kind}.md` no dejan espacio de namespace para más de un cambio
concurrente. Ese es el límite explícito de este layout, no un accidente.

Cada archivo de artefacto es Markdown con frontmatter delimitado por `---`,
pero el contenido del frontmatter es **JSON**, no YAML — así el adapter
reutiliza `encoding/json` sin sumar una dependencia de parsing YAML:

```text
---json
{
  "schema": "virgil.dev/artifact/v1alpha1",
  "protocol_version": "virgil.dev/planning-slice1/v1alpha1",
  "artifact_kind": "idea",
  "change_id": "...",
  "project_id": "...",
  "status": "awaiting_approval",
  "revision": "rev-000001",
  "upstream_refs": [],
  "content_digest": "sha256:...",
  "idempotency_key": "...",
  "request_id": "...",
  "created_at": "...",
  "provenance": { "kind": "agent_generated", "captured_at": "..." }
}
---

# Contenido en Markdown a partir de aquí...
```

Al aprobar, el adapter reescribe el mismo archivo (mismo contenido, nuevo
frontmatter): agrega `approved_by` y `approved_at`, y cambia `status` a
`approved`. Un `request_changes` cambia `status` a `withdrawn`; una nueva
propuesta para el mismo `artifact_kind` reutiliza el mismo archivo, incrementa
`revision` (`rev-000002`, ...) y sobrescribe el contenido. El historial de
revisiones anteriores no vive en el filesystem administrado: vive en el
historial de git del repositorio consumidor, si el consumidor commitea. Este
es el punto central del refactor: **git es el ledger**, no un `events.jsonl`
paralelo.

El layout es un contrato del adapter `repo-docs` para Slice 1, no el schema
universal de ArtifactStore. Un adapter Jira, Confluence, Basecamp, GitHub
Projects/Issues u otro sistema puede representar la misma semántica con IDs y
operaciones propios.

## Estado derivado

`repo-docs` no persiste `derived_step` ni el estado de un cambio en ningún
archivo propio: los recalcula en cada operación escaneando `docs/` en busca
de `00-idea.md` .. `04-handoff.md` y leyendo el `status` de cada frontmatter
encontrado. El primer artefacto de la secuencia `idea -> spec -> design ->
tasks -> handoff` que no está en `status: approved` (porque no existe todavía,
está `awaiting_approval` o fue `withdrawn`) es el `derived_step` actual. Si
los cinco están `approved`, `derived_step` es `complete`.

Esto es lo que permite que un proceso nuevo, sin estado en memoria, recupere
exactamente el mismo `derived_step` que un proceso anterior: la única fuente
de verdad es el contenido durable de `docs/` y `virgil.json`.

## Inmutabilidad y atomicidad

Dentro del baseline single-writer:

1. `virgil.json` se escribe con create-exclusivo-y-rename en la inicialización
   y con copy-rewrite-rename en actualizaciones posteriores (por ejemplo,
   fijar `active_change`);
2. cada archivo de artefacto (`{NN}-{kind}.md`) se publica completo antes de
   quedar visible: create-exclusivo-y-rename cuando no existe, o
   copy-rewrite-rename cuando se reescribe (retirar, aprobar, o redraft tras
   `request_changes`);
3. la publicación usa rename atómico del mismo filesystem cuando está
   disponible.

Si el HostAdapter no puede garantizar la atomicidad/durabilidad requerida, la
operación responde `unsupported`; no degrada a last-write-wins.

El diff permitido de planning bajo `repo-docs` debe ser exactamente explicable
por `virgil.json` y los archivos de artefacto administrados. Un archivo
adicional bajo esos nombres exactos, sin corresponder a una operación válida,
es un efecto no autorizado.

## Concurrencia

Slice 1 admite un solo writer por cambio. Si no puede garantizarse esa
exclusión, el adapter detiene la operación. Leases, compare-and-swap y
coordinación pertenecen al
[Slice 7](../../roadmap/vertical-slices.md#slice-7--graphrag-y-paralelismo).

## Otros adapters

Un ArtifactStoreAdapter externo puede persistir todo fuera del working tree;
en ese perfil el target diff de planning debe ser vacío. La semántica de
identidad, revisiones, eventos, gates y trazabilidad no cambia.

El kernel no contiene branches de Jira, Confluence, Basecamp o GitHub. Skills y
tools traducen las operaciones canónicas mediante el adapter configurado.

## Self-hosting

Self-hosting requiere autorización explícita. Para validar o desarrollar
Virgil se RECOMIENDA un adapter externo o temporal, de modo que el dogma
`Virgil/docs/` no se mezcle con el RAG operativo del cambio. Si un perfil
self-host selecciona `repo-docs`, debe demostrar que su `managed_root` no
colisiona con el dogma canónico y registrar esa excepción.
