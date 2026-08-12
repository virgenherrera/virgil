# Contrato del runtime Go T0

## Estado y alcance

Este documento fija el **diseño normativo seleccionado** para la primera
implementación del runtime T0 de Virgil. Todavía no declara una capacidad
implementada, un scenario aprobado ni estado Green. Green solo puede
declararse después de ejecutar los scenarios app-level y publicar la evidencia
exigida por la [estrategia de validación](../quality/validation-strategy.md).

El alcance inicial es deliberadamente estrecho:

- una única operación del kernel: `virgil.init`;
- el ArtifactStoreAdapter `repo-docs`;
- las tres fixtures T0 versionadas en
  [`validation/fixtures/t0/`](../slices/01-planning/validation/fixtures/t0/README.md);
- un actor replay determinístico y aislamiento por proceso;
- ejecución local sin red y sin Docker obligatorio.

`virgil.new` y `virgil.continue` permanecen fuera de este vertical. Si llegan a
la implementación T0 antes de tener contrato ejecutable, DEBEN responder
`unsupported`; NO DEBEN simular éxito ni inventar estado.

## Invariantes de distribución

1. El runtime, el worker de `virgil.init` y el runner T0 se distribuyen en **un
   solo binario Go autocontenido**.
2. El consumidor no necesita Go, Node, Python, Docker ni acceso a red para
   invocarlo.
3. El binario recibe exactamente un documento JSON por `stdin`, responde
   exactamente un documento JSON por `stdout` y termina. `stdout` no admite
   logs, banners ni prosa; los diagnósticos de transporte van a `stderr` sin
   secrets.
4. El documento JSON, no el exit code ni el texto humano, es la autoridad del
   resultado. Un envelope inválido o una falla interna de transporte termina
   con exit code no cero; un `OperationResult` válido con status `blocked` o
   `unsupported` no es una falla de transporte.
5. La identidad de Virgil, del target y del store nunca se infiere desde el
   cwd, el nombre del directorio, variables globales o memoria conversacional.
6. Ninguna ejecución usa comandos de shell concatenados. Cuando el runner
   necesita otro proceso, invoca el ejecutable mediante argumentos y pipes
   estructurados, con timeout y cancelación.

## Envelopes de proceso

Los envelopes pertenecen al transporte del binario y envuelven —sin modificar—
los contratos canónicos de Slice 1. No reemplazan `OperationRequest`,
`OperationResult`, `AgentInteractionTrace` ni `EvidenceBundle`.

Todos llevan `runtime_protocol = "virgil.dev/runtime/v1alpha1"` y un
discriminador `kind`. El decoder DEBE rechazar campos duplicados, trailing
data, tipos desconocidos y payloads que excedan los límites configurados.

### `invoke`

`kind = "invoke"` ejecuta una operación pública. Su input mínimo es:

```json
{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "invoke",
  "process_id": "process-a",
  "request": {},
  "bindings": {
    "target": {
      "uri": "fixture://targets/consumer-init-happy",
      "root": "/absolute/materialized/consumer-init-happy"
    },
    "resources": []
  },
  "clock": {
    "now": "2030-01-01T00:00:00Z"
  }
}
```

- `request` DEBE ser el `OperationRequest` exacto validado contra su schema; el
  transporte no agrega ni elimina campos canónicos.
- `bindings.target` enlaza la URI lógica declarada por `ProjectRef` con un root
  absoluto materializado por el host. La ruta local NO sustituye esa identidad
  y NO necesita coincidir textualmente con `canonical_path` de una fixture.
- `bindings.resources` solo puede enlazar URIs ya declaradas con recursos
  explícitos y verificables. T0 no habilita discovery de red ni resolución por
  cwd.
- `clock` es input controlado; el worker NO usa el reloj real para campos que
  participan en un oráculo determinístico.

La respuesta `kind = "invoke_result"` contiene, como mínimo,
`runtime_protocol`, `process_id`, `os_pid`, el `OperationResult` canónico y las
observaciones de efectos necesarias para que el host construya la traza. El
worker no puede presentarse como observador independiente de su propio éxito:
el runner vuelve a medir filesystem y procesos desde afuera.

### `run_t0`

`kind = "run_t0"` ejecuta el harness black-box incluido en el mismo binario. Su
input mínimo declara:

```json
{
  "runtime_protocol": "virgil.dev/runtime/v1alpha1",
  "kind": "run_t0",
  "fixture_ids": [
    "t0-init-repo-docs-happy",
    "t0-init-unmanaged-write-blocked",
    "t0-init-idempotent-retry"
  ],
  "workspace_root": "/absolute/isolated/workspace",
  "evidence_root": "/absolute/isolated/evidence",
  "clock": {
    "now": "2030-01-01T00:00:00Z"
  }
}
```

- `fixture_ids`: lista no vacía de IDs T0 embebidos;
- `workspace_root`: root absoluto donde materializar targets aislados;
- `evidence_root`: root absoluto separado de cada target y store;
- `clock`: tiempo determinístico de la corrida;
- límites explícitos de tiempo y bytes cuando difieran de los defaults
  versionados.

La respuesta `kind = "run_t0_result"` enumera por fixture:

- outcome `passed | failed` del scenario, distinto del status de la operación;
- procesos observados con `process_id` y PID del sistema operativo;
- clasificación y checks ejecutados;
- referencia y digest del `EvidenceBundle` publicado, o la falla que impidió
  publicarlo.

Un scenario que esperaba un `OperationResult.status = "blocked"` puede tener
outcome `passed`. El runner NO declara `passed` solo porque un JSON valida: debe
ejecutar la interacción y verificar sus efectos externos.

## Boundaries de paquetes e imports

La implementación mantendrá esta dirección de dependencias:

```text
cmd/virgil
  -> internal/entrypoint
       -> internal/runtime
       -> internal/t0

internal/t0
  -> internal/wire
  -> internal/contracts
  -> internal/evidence
  -> os/exec

internal/runtime
  -> internal/wire
  -> internal/contracts
  -> internal/protocol
  -> internal/repodocs

internal/repodocs
  -> internal/protocol
  -> os.Root

internal/contracts
  -> bundle del módulo

test/app
  -> binario público únicamente
```

Reglas obligatorias:

1. `internal/t0` NO PUEDE importar `internal/runtime` ni llamar funciones del
   kernel. Debe lanzar `os.Executable()` como subprocess, enviar `invoke` por
   `stdin` y observar `stdout`, `stderr`, PID y filesystem.
2. `test/app` NO PUEDE importar paquetes internos de Virgil. Solo selecciona
   scenarios y opera el binario por su protocolo público.
3. `internal/runtime` no conoce fixtures, snapshots, asserts ni paths de
   evidencia del harness.
4. `internal/repodocs` recibe referencias y roots ya explícitos; no descubre el
   target ni el dogma.
5. El paquete raíz futuro será el único dueño de `go:embed` y expondrá un
   `fs.FS` read-only. Esta ubicación es intencional: los patrones de `go:embed`
   no pueden subir con `..`, y los assets canónicos viven bajo `docs/`.

## Bundle canónico y validación

El binario DEBE incluir directamente, mediante `go:embed`, los bytes
versionados de:

- los ocho JSON Schemas de
  [`docs/slices/01-planning/schemas/`](../slices/01-planning/schemas/README.md);
- las tres fixtures T0 y sus ActorScripts.

El fixture provider también compila en el binario los bytes exactos del
recurso determinístico `fixture://dogma/virgil/v1` definidos por el README de
las fixtures y verifica su digest antes de ejecutar. Ese recurso tampoco se
resuelve por red ni filesystem del consumidor.

No se permite una copia relajada bajo otro directorio, descargar schemas en
runtime ni usar la red para resolver `$ref`. El compilador registra cada schema
por su `$id` canónico y usa un loader **bundled-only**: una URI ausente o externa
falla cerrada como contrato/fixture no soportado. Se habilitan los formatos
requeridos por Draft 2020-12 y, luego de JSON Schema, se verifican las
invariantes cruzadas que el schema no puede expresar.

Cambiar un schema, fixture u oráculo para hacer pasar la implementación está
prohibido. Cualquier revisión de Red se hace antes y de forma trazable, no desde
Green.

## `repo-docs`: init atómico e idempotente

Para el alcance T0, un init exitoso publica exactamente estos recursos
autoritativos:

```text
{target}/docs/virgil/projects/{project_id}/project.json
{target}/docs/virgil/projects/{project_id}/events.jsonl
```

Antes de cualquier efecto, el runtime DEBE validar schema, referencias
cruzadas, digests, `method_source != target`, binding target, namespace,
policy, capabilities e identidad idempotente. Una falla previa es fail-closed.

La publicación cumple el contrato de
[`repo-docs`](../slices/01-planning/repo-docs-adapter.md):

1. prepara el directorio completo y su único evento `project_initialized` en un
   temporal hermano dentro del `managed_root` y del mismo filesystem;
2. crea temporales de forma exclusiva, escribe contenido completo, sincroniza
   archivos y directorio, y nunca sigue un path que escape del root;
3. publica el directorio por rename atómico y sincroniza el parent;
4. solo entonces devuelve success y referencia los recursos publicados;
5. si el host/filesystem no ofrece exclusión, atomicidad y durabilidad
   suficientes, devuelve `unsupported`: no cae a copy, overwrite ni
   last-write-wins.

`project.json` conserva como mínimo la identidad del proyecto, las referencias
resueltas, la policy/adapters efectivos y el registro durable de la intención
idempotente: key, digest RFC 8785 y `request_id` original. `events.jsonl`
contiene exactamente un evento completo `project_initialized` para el primer
init.

El namespace fuera de la policy se rechaza antes de escribir. El resultado es
`blocked`, incluye `STORE_POLICY_VIOLATION`, registra un `EffectRecord` de
write denegado con `occurred = false` y deja diff cero.

Un retry en proceso fresco reconstruye el resultado leyendo únicamente el
store. Para la misma combinación proyecto/operación/key:

- mismo digest del request según RFC 8785, excluyendo solo `request_id`, produce
  replay semántico sin writes ni eventos duplicados y enlaza
  `replayed_from_request_id`;
- digest distinto produce `IDEMPOTENCY_CONFLICT` sin mutación.

## Fresh process real

Cada `process_id` de un ActorScript corresponde a una invocación nueva del
mismo ejecutable con `exec.CommandContext`; no es un goroutine, un reset de
struct ni una llamada interna. El runner:

1. inicia cada subprocess con ambiente mínimo allowlisted y sin secrets
   heredados;
2. entrega solo el envelope, bindings y clock de ese paso;
3. nunca transmite memoria conversacional ni el resultado completo del proceso
   anterior como estado oculto;
4. captura PID real, límites, exit status, stdout y stderr redactado;
5. exige PIDs distintos entre `process-a` y `process-b` en la fixture de retry.

El proceso B solo puede recuperar desde los recursos durablemente publicados.

## Evidencia y observación independiente

El harness externo al worker toma snapshots determinísticos antes y después de
cada checkpoint, tanto del target como del store. Con esas observaciones
construye el `AgentInteractionTrace` y verifica requests, resultados, orden,
efectos autorizados/denegados, eventos, diffs, prohibited effects, recovery y
outcome contra la fixture.

Cada corrida intenta publicar fuera del target y del store un EvidenceBundle
que incluye:

- fixture/revisión, baseline y source revision;
- perfiles, capabilities, entorno y procesos/PIDs;
- traza completa, event log y recursos requeridos;
- diffs de target/store y checkpoints intermedios;
- checks y clasificación del outcome;
- digests de todos los recursos enumerados.

La traza y el manifest calculan SHA-256 sobre RFC 8785 excluyendo únicamente su
propio `integrity.digest`. Credenciales, tokens y valores sensibles nunca se
persisten; se registra la redacción y el mecanismo de provisión. El bundle se
prepara completo, sincroniza y publica atómicamente. Solo el manifest ya
publicado puede afirmar `published_atomically = true`.

Un error al producir evidencia no se convierte en `passed`. Logs del worker,
asserts internos o tests unitarios no reemplazan estas observaciones.

## Selector app-level

Los únicos tests que pueden seleccionar estos scenarios viven en `test/app`,
usan `t.TempDir()` para workspace/evidence aislados e invocan el binario real.
Los nombres normativos son:

- `TestApp_T0InitRepoDocsHappy`;
- `TestApp_T0InitUnmanagedWriteBlocked`;
- `TestApp_T0InitIdempotentRetryFreshProcess`.

El selector canónico es:

```sh
go test ./test/app -run '^TestApp_'
```

Un build tag `applevel` PUEDE agregarse como filtro adicional de CI, pero no
reemplaza package + nombre y no puede hacer que la corrida canónica omita los
scenarios silenciosamente. No se crean unit tests para cerrar este gate.

Este comando es parte del diseño del gate; este documento NO afirma que haya
sido ejecutado ni que hoy pase.

## Toolchain y dependencias

La versión mínima es **Go 1.25**. Se elige por `os.Root` y las operaciones de
filesystem traversal-resistant necesarias —incluidas `MkdirAll`, `ReadFile` y
`Rename`—, no por conveniencia sintáctica. Aun con `os.Root`, el runtime valida
symlinks, roots canónicos, pertenencia al managed root y garantías del
filesystem; la API no sustituye la policy.

El vertical admite exactamente dos dependencias directas externas, ambas
pineadas:

| Dependencia | Versión | Justificación |
|---|---:|---|
| `github.com/santhosh-tekuri/jsonschema/v6` | `v6.0.3` | Implementa JSON Schema Draft 2020-12, `$id`/`$ref` y formatos sin inventar un validador incompleto. Se configura con loader bundled-only. |
| `github.com/gowebpki/jcs` | `v1.0.1` | Implementa RFC 8785 para identidad idempotente e integridad; `encoding/json` no produce JCS. |

La standard library cubre JSON framing, SHA-256, embed, filesystem, subprocess,
timeouts y app harness. T0 no agrega CLI framework, YAML, logger, diff engine,
UUID library, Docker SDK ni cliente de red. Una tercera dependencia exige una
revisión explícita de este contrato y su trade-off de supply chain.

## Controles de seguridad y límites

La futura implementación DEBE fijar y evidenciar límites de tamaño de input y
output, profundidad JSON, cantidad de fixtures, duración de subprocess y bytes
de evidencia. También DEBE:

- rechazar JSON ambiguo, resoluciones de schema/dogma fuera del bundle y el uso
  de `canonical_path` del request como ruta host-local sin el binding explícito;
- comparar roots resueltos y bloquear escapes, symlinks adversariales y
  colisión `method_source == target`;
- usar environment allowlisted, sin credenciales heredadas;
- matar el process group al vencer el timeout y acotar stdout/stderr;
- publicar evidencia fuera del target y con redacción previa al digest;
- fallar cerrado cuando no puede demostrar policy, atomicidad, integridad o
  proceso fresco.

Docker puede ser un IsolationAdapter futuro, pero hacerlo obligatorio en T0
ocultaría el contrato de proceso y excluiría hosts válidos sin aportar una
garantía universal.

## Secuencia de implementación

Este checkpoint no autoriza a saltar Red:

1. materializar los tres selectors app-level contra el binario ausente y
   confirmar que fallan por comportamiento faltante, no por fixture rota;
2. implementar `invoke`, `virgil.init` y `repo-docs` hasta satisfacer happy y
   blocked;
3. implementar `run_t0`, fresh-process e idempotent recovery;
4. publicar y verificar EvidenceBundles completos;
5. recién entonces evaluar G1 Production-Safe Green.

Hasta completar esa secuencia, el runtime Go T0 permanece **diseñado, no
implementado**.
