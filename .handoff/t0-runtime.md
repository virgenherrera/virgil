# Handoff: Virgil Slice 1 runtime

> Documento operativo temporal para Claude o Codex. No es dogma normativo.
> El dogma vive exclusivamente en `docs/`.

## Punto de reanudación

- Branch: `feat/t0-runtime`
- HEAD al redactar: `b6bd343` (`docs: add QUICKSTART.md for manual testing`)
- Working tree antes de este handoff: limpio
- No hay push ni PR desde esta tarea

## Estado verificado previamente

La implementación actual ya no es el viejo T0 limitado a `virgil.init`.
Incluye el flujo de Slice 1:

- `virgil.init`;
- `virgil.new`;
- `virgil.continue` para proponer y aprobar idea, spec, design, tasks y handoff;
- cierre del cambio y limpieza de `active_change`;
- generación de `AGENTS.md` en el consumidor;
- adapter local plano: `virgil.json` + `docs/{00-idea,01-spec,02-design,03-tasks,04-handoff}.md`;
- subprocesses reales, boundaries explícitos, idempotencia y evidencia tipada;
- quickstart manual en `QUICKSTART.md`.

El último resultado registrado en Engram fue **12/12 `TestApp_*` Green** y un
E2E real con dos cambios consecutivos. No vuelvas a afirmar ese resultado como
nuevo sin ejecutar el gate autorizado en tu propia sesión.

## Invariantes que NO podés romper

1. `docs/` de este repo es el dogma operativo de Virgil.
2. `docs/` del repo consumidor es el RAG/store operativo local por defecto.
3. Jira, Confluence, Basecamp y GitHub Projects/Issues son adapters futuros;
   el kernel no puede acoplarse a `repo-docs`.
4. Skills/tools gobiernan la interoperabilidad y operan principalmente sobre
   el repo consumidor.
5. Virgil es la Secretaría Ejecutiva/guardian de ownership: entrega contexto
   acotado por fase; NO vuelca todo el corpus al agente.
6. Nada de identidad implícita por CWD. Target, proyecto, change, run, adapter
   y policy son explícitos.
7. Solo escenarios app-level black-box `TestApp_*` certifican. Unit tests,
   coverage y mocks internos no cierran ningún gate.
8. Production-Safe Green: traversal, symlinks, idempotencia, atomicidad,
   allowlists y secrets se resuelven en Green, no se patean a Refactor.

## Antes de tocar código

```sh
git status --short --branch
git log -8 --oneline
grep -R '^func TestApp_' -n test/app
```

Después leé, en este orden:

1. `docs/README.md`
2. `docs/architecture/executive-secretary.md`
3. `docs/architecture/system-boundaries.md`
4. `docs/quality/validation-strategy.md`
5. `docs/quality/production-safe-green.md`
6. `docs/slices/01-planning/`
7. `QUICKSTART.md`

## Próximo trabajo recomendado

No reescribas el runtime de Slice 1. El siguiente vertical debe acercarse a la
visión de Secretaría Ejecutiva:

1. **ContextCompiler / ownership briefs**: dado project/change/phase, devolver
   únicamente artifacts, decisiones, acceptance criteria y evidencia necesaria
   para esa fase, con presupuesto explícito de bytes/tokens.
2. **Skill/host adapter mínimo**: una skill delgada que construya envelopes,
   invoque Virgil y traduzca el resultado al host sin meter dogma completo en
   `AGENTS.md` ni asumir sub-agents.
3. **Conformance app-level**: fixture black-box que demuestre que planning no
   recibe código innecesario y execution no redefine artifacts aprobados.
4. Recién después diseñar adapters externos; `repo-docs` sigue siendo la
   referencia, no el kernel.

Empezá con docs/spec + fixture Red. No agregues código antes de cerrar el
context envelope, el presupuesto y los oráculos observables.

## Deuda conocida que debe ir separada

- Crash recovery de staging necesita ownership/lease real. Nunca borres un
  staging ajeno a ciegas porque puede pertenecer a un writer vivo.
- Si rename tuvo éxito y falla `fsync(parent)`, el resultado es incierto y debe
  arbitrarse desde la autoridad durable; no reportes success narrativo.
- Conservá separación entre evento durable referenciado y evento nuevo del
  intento: un replay puede referenciar la autoridad original sin append nuevo.

No mezcles esta deuda con ContextCompiler salvo que un fixture app-level la
requiera para el vertical actual.

## Gate de certificación

El selector autorizado es únicamente:

```sh
go test ./test/app -run '^TestApp_' -count=1
```

El repo usa Docker para fijar toolchain cuando se autorice ejecución; seguí
`Makefile`/`QUICKSTART.md`. Las reglas actuales prohíben build después de
cambios en esta tarea: si no hay autorización explícita, hacé revisión estática
y NO afirmes Green.

## Definition of done del próximo agente

- diff acotado al vertical elegido;
- `git diff --check` limpio;
- ningún test unitario presentado como certificación;
- docs, fixture, runtime y evidencia cuentan la misma historia;
- handoff/Engram actualizado con hechos, no promesas;
- sin push ni PR salvo pedido explícito del usuario.
