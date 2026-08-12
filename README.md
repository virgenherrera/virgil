# Virgil

Virgil es el knowledge/control plane para desarrollo asistido por agentes: conserva ownership, contexto mínimo y trazabilidad
desde una idea hasta el código, la evidencia de verificación, el deploy y la
operación cuando aplique.

## Estado

El repositorio está reconstruyéndose desde sus contratos. Hoy contiene:

- el [dogma operativo canónico](docs/README.md);
- el primer slice `idea → handoff` y sus contratos host-neutral;
- schemas y fixtures Red para validar la interacción `Agent ↔ Virgil`.

La existencia de documentación o fixtures no implica que el runtime ya esté
implementado. Las capacidades reales se anuncian únicamente cuando producen
evidencia app-level conforme al dogma.

## Distribución

Virgil se implementará y distribuirá como un **binario autocontenido en Go**.
Un proyecto consumidor no debe instalar Node, Python ni Docker para usar el
kernel o el adapter `repo-docs`.

Skills, CLIs, MCP servers y adapters específicos de Codex, Claude u otros hosts
pueden exponer una UX nativa, pero traducen al mismo protocolo; no duplican el
kernel ni convierten herramientas del host en dependencias de la metodología.

## Boundaries

- `Virgil/docs/` es dogma operativo versionado y read-only para consumidores.
- `{consumer}/docs/` es el corpus operativo del consumidor.
- `{consumer}/docs/virgil/` es el managed root del adapter `repo-docs` default.
- `method_source`, target, proyecto, run y store siempre tienen identidad
  explícita; nunca se infieren solamente desde cwd.

El RAG es una proyección reconstruible. La autoridad reside en referencias,
revisiones, ledger, eventos y evidencia verificable.

## Validación

Virgil se certifica con escenarios **app-level y black-box** que entran por su
superficie pública y observan requests, guards, efectos, diffs, recovery y
Evidence Bundles. El runner de Go puede seleccionar esos escenarios mediante
paquete, nombre (`TestApp_*`) o tag (`applevel`); eso no los convierte en tests
unitarios.

Los unit tests no son evidencia de certificación y no cierran Red, Green,
Refactor ni Verify.
