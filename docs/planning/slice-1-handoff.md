# Handoff — Slice 1

[← docs/](../README.md) · [← planning/](./README.md)

Documento puente entre planificacion e implementacion del Slice 1 (Epic 1: Planning).
Este archivo es el punto de entrada primario para el agente implementador. Cada
restriccion critica esta aqui; no es necesario consultar otros archivos para entender
que construir, que esta prohibido y donde detenerse.

## H1: Limites de alcance

### Dentro del alcance

- **Epic 1 — Planning**: ciclo completo desde idea hasta handoff, incluyendo recovery
  en sesion fresca y auditabilidad de cada efecto.
- **19 tareas** (T-001 a T-019): scaffold, 4 tiers de paquetes, rama paralela t0,
  infraestructura de testing, CI/CD. Ver DAG en `slice-1-tareas.md`.
- **16 historias de usuario** (H-PROTO1 a H-SCHEMA2): contratos wire, validacion,
  estado, operaciones, evidencia, schemas, oraculo T0.
- **18 conformance scenarios** (C1-C18) y **7 adversariales** (A1-A7).
- **Un solo Method Pack**: Scrum (idea, spec, design, tasks, handoff).
- **Un solo ArtifactStoreAdapter**: repo-docs.

### Fuera del alcance

- Epics 2-7 (Execution, Verify, Ship, segundo host, Method Packs adicionales, GraphRAG).
- Emision de `PlanningGapDetected` desde Execution (pertenece a Epic 2).
- Method Packs Waterfall, Kanban, Shape Up.
- ArtifactStoreAdapters externos (Jira, Confluence).
- Cualquier funcionalidad de red, daemon o servicio web.

### Limites de filesystem

El agente implementador escribe UNICAMENTE bajo:

- `cmd/`, `internal/`, `test/`, `.github/workflows/`, `go.mod`, `go.sum`

NO modifica: `docs/`, `principia/`, `AGENTS.md`, `README.md`.

> **Nota sobre `virgil.json`**: el archivo de control del proyecto vive en `{target}/virgil.json`
> (fuera de `managed_root`). Los artefactos de planning (idea, spec, design, tasks, handoff)
> viven en `{target}/docs/virgil/{change_id}/`. La restriccion de managed_root aplica a los
> artefactos de planning, no al control file.

## H2: Restricciones criticas (NO NEGOCIABLES)

1. **S7d — File/Unit tests con mocks internos = PROHIBIDO (valor 0)**. Sin
   `mock.Anything`, sin `gomock`, sin `testify/mock`, sin interfaces de test, sin fakes,
   sin stubs en `test/app/`. La frontera de test es `test/app/` (proceso real).
2. **`managed_root` es `docs/virgil/`**, NO `docs/`. Todo diff del target queda
   contenido bajo `{target}/docs/virgil/`. Documentos fuera de ese path son read-only.
3. **Echo System usa numeracion 1-5**, NO 0-4. Los 5 stages CI se numeran del 1 al 5.
4. **`method_source != target`**: DogmaRef y target no pueden resolver a la misma ruta
   canonica, incluyendo symlinks.
5. **Proceso fresco por invocacion**: cada `process_id` corresponde a un subprocess
   nuevo via `exec.CommandContext`. Sin goroutines, sin reset de struct, sin estado
   entre invocaciones.
6. **JSON canonicalization RFC 8785 (JCS)** para digests. SHA-256 de la representacion
   JCS, excluyendo solo `request_id`; `idempotency_key` SI participa del digest.
7. **Atomicidad**: create-exclusive + rename. Sin partial writes, sin last-write-wins.
   Si el filesystem no ofrece exclusion/atomicidad/durabilidad, responder `unsupported`.
8. **Frontmatter JSON entre `---`**, NO YAML. Campos requeridos: `schema`,
   `artifact_kind`, `change_id`, `status`, `revision`, `content_digest`,
   `project_id`, `upstream_refs`, `idempotency_key`, `created_at`.
9. **Derivacion de estado**: no existe campo `phase` persistido. `derived_step` se
   calcula escaneando revisiones: primer tipo sin revision aprobada efectiva.
10. **Posiciones Scrum 1-5** (idea=1, spec=2, design=3, tasks=4, handoff=5), NO 0-4.

## H3: Decisiones ya tomadas

| Decision | Valor |
|---|---|
| Lenguaje | Go 1.24+, `CGO_ENABLED=0` |
| CLI framework | Cobra (`github.com/spf13/cobra` v1.10.2) |
| JSON Schema | `github.com/santhosh-tekuri/jsonschema/v6` v6.0.3 |
| JCS (RFC 8785) | `github.com/gowebpki/jcs` v1.0.1 |
| Testing framework | `testing` (stdlib). Sin testify, sin gomega |
| CLI black-box | `testscript` (`rogpeppe/go-internal`) |
| Assertions | `t.Errorf`/`t.Fatalf` directo. Sin frameworks externos |
| Comparacion de output | Golden files en `testdata/` |

### DAG de paquetes

```text
Tier 0: protocol/ + contracts/ + evidence/  (sin deps internas)
Tier 1: kernel/ + adapters/repodocs/ + adapters/host/  (paralelos)
Tier 2: packs/scrum/
Tier 3: runtime/
Tier 4: cmd/virgil/
```

**Regla de importacion**: un tier inferior NUNCA importa un tier superior.
`t0/` opera el binario como subprocess, nunca importa kernel/runtime/adapters.
`test/app/` tampoco importa paquetes internos.

### Modelo de estado

- Unica lifecycle persistida: revision de artefacto.
- Estados: `draft`, `awaiting_approval`, `approved`, `withdrawn`, `superseded`.
- Transiciones: `draft->awaiting_approval`, `draft->withdrawn`,
  `awaiting_approval->approved`, `awaiting_approval->withdrawn`,
  `approved->superseded`.
- `withdrawn` y `superseded` son terminales.
- Invariante: solo una revision abierta por tipo de artefacto y cambio.

## H4: Areas de riesgo

| Area | Riesgo | Mitigacion |
|---|---|---|
| Idempotencia (replay, digest JCS) | Alta complejidad; digest incorrecto rompe retry | Tests C8, C9; verificar contra RFC 8785 |
| Init atomico (5 pasos de publicacion) | Edge cases de filesystem (permisos, disco lleno) | Fail-closed; `unsupported` si faltan garantias |
| ContextBrief minimizacion | Debe ser auditable pero no filtrar datos de otros cambios | Test C12; allowlist + budget |
| Derivacion de estado desde ledger | Debe ser determinista con lecturas concurrentes | Test C10; sin campo persistido, solo consulta |
| Coherencia cruzada de referencias | Multiples IDs deben ser consistentes pre-efectos | Pipeline de 7 pasos; tests C15 |

## H5: Metodo de verificacion

### Suite primaria

```bash
go test ./test/app/... -run '^TestApp_'
```

Ejecuta los 18 conformance scenarios (C1-C18) contra el stack real.

### Suite adversarial

```bash
go test ./test/app/... -run '^TestApp_Adversarial_'
```

Ejecuta 7 scenarios (A1-A7): escritura fuera de scope, pedir todo el contexto,
saltar gate, mutar aprobado, capability no declarada, inventar estado, ignorar stop.

### Harness T0

Runner de subprocess en `internal/t0/`. Nunca importa kernel/runtime/adapters.
Opera unicamente el binario publicado.

### E2E

`test/e2e/` contra proyecto consumidor externo (Challenge-A). Validacion manual
pre-release: flujo idea a handoff completo reproducible.

### CI (Echo System)

5 stages en GitHub Actions: Setup (1), Build (2), Static (3), Dynamic (4), E2E (5).
El stage 4 (Dynamic) ejecuta `TestApp_*` y `TestApp_Adversarial_*` desde `test/app/`;
el stage 5 (E2E) ejecuta `test/e2e/` contra proyecto consumidor externo.

## H6: Dependencias externas

| Dependencia | Version | Proposito |
|---|---|---|
| `github.com/spf13/cobra` | v1.10.2 | CLI: subcomandos, flags, ayuda |
| `github.com/santhosh-tekuri/jsonschema/v6` | v6.0.3 | JSON Schema Draft 2020-12 |
| `github.com/gowebpki/jcs` | v1.0.1 | RFC 8785 para digests |

- No hay dependencias de red en runtime. Schemas se embeben via `go:embed`.
- Cada dependencia adicional requiere revision de supply chain (S7h).
- Prohibidas: ORMs, web frameworks, loggers externos, UUID libraries, YAML parsers.

## H7: Instrucciones de recuperacion

- **Atascado en implementacion**: leer `docs/specification/operation-protocol.md` para
  contratos wire, luego `docs/implementation/go-runtime.md` para estructura de paquetes.
- **Test falla**: consultar `docs/implementation/conformance.md` para el Given/When/Then
  exacto del scenario.
- **Scope creep**: verificar H1 de este documento. Si no esta en Epic 1, esta FUERA.
- **`PlanningGapDetected` necesario**: el agente implementador se DETIENE y reporta a
  planning. NO resuelve el gap por cuenta propia.
- **Duda sobre estado/transiciones**: consultar `docs/specification/state-model.md`.
- **Duda sobre wire format**: consultar `docs/specification/operation-protocol.md`.

## Prohibiciones (P1-P9)

| # | Prohibicion | Deteccion |
|---|---|---|
| P1 | Modificar/borrar tests para que pasen | `git diff` de `test/` no reduce assertions |
| P2 | Introducir TODO, placeholders, `panic("not implemented")` | `rg` + analisis estatico |
| P3 | Incorporar secrets en codigo, fixtures o logs | Scanner estatico + patrones |
| P4 | Agregar `//nolint` sin justificacion; `#nosec` prohibido | Linter config + review |
| P5 | `recover()` fuera de boundaries; `if err != nil { return nil }` | `go vet` + review |
| P6 | Agregar dependencia sin justificacion en `go.mod` | Diff review contra H6 |
| P7 | Bypassar guards o autorizacion | Review contra controles |
| P8 | Convertir fail-closed en fallback silencioso | Analisis de error paths |
| P9 | Diferir violacion MUST a Refactor | Review contra definition of green |

## Primeros pasos

Orden concreto para iniciar la implementacion:

1. **T-001**: Module scaffold. Crear `go.mod` con `go 1.24` + `toolchain go1.24.0`,
   layout de `cmd/virgil/` e `internal/`. Compilar con `go build ./...`.
2. **T-002, T-003, T-004** (paralelo): Tier 0. `protocol/` (envelopes, wire types),
   `contracts/` (JSON Schemas embebidos via `go:embed`), `evidence/` (EvidenceBundle,
   digests RFC 8785).
3. **T-015** (paralelo con Tier 0): `test/testutil/` helpers compartidos (repos
   temporales, sin mocks).
4. **T-005 a T-010** (paralelo entre si, requiere Tier 0): Tier 1. kernel/ (Ledger,
   TraceabilityGraph, EvidenceIngestion, ContextCompiler), adapters/repodocs/,
   adapters/host/.
5. **T-014** (paralelo con Tier 1, requiere Tier 0): Harness T0 en `internal/t0/`.
6. **T-011**: Tier 2. `packs/scrum/` (unico Method Pack).
7. **T-012**: Tier 3. `runtime/` (orquestacion, dispatch, proceso fresco).
8. **T-013**: Tier 4. `cmd/virgil/` (main, subcomandos Cobra).
9. **T-016, T-017**: Suites de test `test/app/` y `test/e2e/`.
10. **T-018, T-019**: CI/CD pipelines en `.github/workflows/`.

---

← Anterior: [Tareas](./slice-1-tareas.md) · [↑ planning](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Release Plan](./release-plan.md) →
