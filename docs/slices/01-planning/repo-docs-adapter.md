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
- `managed_root`, recomendado `{target}/docs/virgil/`;
- `project_id`;
- `change_id` al crear un cambio.

El adapter resuelve rutas canónicas, incluidos symlinks, y valida:

1. `method_source != target`;
2. `managed_root` pertenece al `corpus_root` configurado;
3. el namespace persistido incluye `project_id`;
4. `change_id` solo es único dentro de ese proyecto;
5. la policy de lectura y escritura está versionada;
6. el HostAdapter ofrece las capabilities necesarias para los efectos
   solicitados.

Ni `ProjectRef` ni `ArtifactStoreRef` se infieren únicamente desde el cwd.

## Policy de lectura y escritura

Por defecto:

- el adapter PUEDE leer o indexar `corpus_root` según una allowlist explícita;
- solo PUEDE escribir dentro de `managed_root`;
- los documentos existentes fuera de `managed_root` son read-only;
- código, producto y configuración permanecen fuera del write scope de
  planning.

Una escritura fuera de `managed_root` requiere un opt-in explícito, acotado a
paths concretos y registrado en la policy y en el ledger. No existe un permiso
implícito por estar dentro de `docs/`.

Cada operación registra:

- ID y versión del ArtifactStoreAdapter;
- `DogmaRef`, `ProjectRef` y `ArtifactStoreRef`;
- roots canónicos resueltos;
- allowlist de lectura y escritura efectiva;
- artefactos/eventos que justifican los efectos;
- diff observado y cualquier intento rechazado.

## Layout conceptual

```text
{target}/docs/                         # corpus_root
  ... documentación existente ...     # read-only por defecto
  virgil/                              # managed_root
    projects/
      {project_id}/
        project.json
        events.jsonl
        changes/
          {change_id}/
            change.json
            events.jsonl
            artifacts/
              idea/
                rev-000001/
                  envelope.json
                  content.md
              spec/
              design/
              tasks/
              handoff/
            briefs/
              {brief_id}.json
```

El layout es un contrato del adapter `repo-docs` para Slice 1, no el schema
universal de ArtifactStore. Un adapter Jira, Confluence, Basecamp, GitHub
Projects/Issues u otro sistema puede representar la misma semántica con IDs y
operaciones propios.

## Inmutabilidad y atomicidad

Dentro del baseline single-writer:

1. un proyecto o cambio nuevo se prepara completo en un temporal dentro de
   `managed_root`, incluido su evento de creación;
2. una revisión o brief se completa antes de publicarse;
3. la publicación usa rename atómico del mismo filesystem cuando está
   disponible;
4. un evento completo incorpora el objeto al estado derivado;
5. cada evento tiene identidad idempotente.

Si el HostAdapter no puede garantizar la atomicidad/durabilidad requerida, la
operación responde `unsupported`; no degrada a last-write-wins. Un objeto
publicado sin evento completo es huérfano y recovery lo ignora.

El diff permitido de planning bajo `repo-docs` debe ser exactamente explicable
por revisiones, briefs y eventos registrados. Un archivo adicional, aunque
quede dentro de `managed_root`, es un efecto no autorizado.

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
