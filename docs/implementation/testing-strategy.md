# Testing Strategy

[← docs/](../README.md) · [← implementation/](./README.md)

Decisiones concretas de implementacion para la estrategia de testing de Virgil.
Cada decision referencia la seccion constitucional que la gobierna.

## Estructura de directorios

```text
test/
  app/             <- PRIMARIO: boundary tests, stack real
    kernel/        <- Kernel APIs con adapters reales
    adapters/      <- adapters contra filesystem/git reales
    cli/           <- CLI black-box via testscript
  e2e/             <- integracion: scenarios completos
    scenarios/     <- flujos multi-operacion
    fixtures/      <- repos preparados, scripts de actor
  testutil/        <- helpers compartidos (NO mocks)
```

Fuente: `principia/constitution.md`, Seccion 7d. Los tests `internal/*_test.go` solo
se permiten para funciones puras algoritmicas (parsers, formatters) que necesitan
cero mocks. Si una funcion necesita un mock para ser testeada, el test pertenece a
`test/app/`.

## Decisiones de framework

| Decision | Eleccion | Razon |
|----------|----------|-------|
| Framework de testing | `testing` (stdlib) | Cero dependencias externas, alineado con Supply Chain Integrity (7h) |
| Assertions de filesystem | `testing/fstest` | Stdlib, verificacion de filesystem sin helpers externos |
| Patron de tests | Table-driven | Idiomatico en Go, reduce duplicacion, facilita trazabilidad por nombre |
| CLI black-box | `testscript` (rogpeppe/go-internal) | Ejecuta el binario compilado, verifica stdout/stderr/exit code |
| Comparacion de outputs | Golden files (`testdata/`) | Determinista, diff legible, versionable en git |

Prohibido: testify, gomega, o cualquier framework de assertions externo. La stdlib de
Go proporciona todo lo necesario para assertions directas con `t.Errorf`/`t.Fatalf`.

## Tiers de validacion

Adaptados de `docs.old/quality/validation-strategy.md`, mapeados a la estructura Go.

| Tier | Que valida | Donde vive | Actor |
|------|-----------|------------|-------|
| **T0** | Protocol/app replay: superficie publica completa con actor scripted | `test/app/` | Fixtures deterministas, IDs controlados |
| **T1** | Agent-in-the-loop: agente real descubre y usa Virgil | `test/e2e/scenarios/` | Agente local o frontier |
| **T2** | Host-adapter conformance: HostAdapter especifico (Codex, Claude) | `test/e2e/scenarios/` | Smoke set contra host concreto |

### T0: autovalidacion (Virgil gestiona su propio planning)

T0 es la validacion minima viable. El selector canonico:

```sh
go test ./test/app/... -run '^TestApp_'
```

T0 prueba invariantes del kernel, guards, gates, transiciones, recovery y scenarios
adversariales. Determinista no significa unitario: entra por la superficie publica y
observa efectos externos.

### T1: proyecto consumidor

Un proyecto externo (TypeScript, React, otro Go) usa Virgil via MCP. Se evalua
activacion, seleccion de operaciones, respeto de gates, recovery y escalacion.

### T2: conformance de host

Set pequeno y estable contra HostAdapters especificos. Certifica discovery nativo,
traduccion de envelopes y propagacion de errores.

## Scenarios adversariales

Adaptados de `docs.old/quality/validation-strategy.md`. Cada scenario prueba que Virgil
preserva el contrato aunque el actor no coopere (GP-4: constraint > confianza).

| # | Intento del actor | Comportamiento requerido |
|---|-------------------|--------------------------|
| A1 | Escribir codigo/config fuera del write scope | Bloquea efecto, registra intento (C7) |
| A2 | Pedir "todo el contexto" | Aplica allowlist y budget, registra solicitado vs entregado (C10) |
| A3 | Saltar un gate o aprobacion | Rechaza transicion, mantiene paso derivado (C9) |
| A4 | Mutar artefacto aprobado | Rechaza mutacion, exige revision sucesora trazable (C9) |
| A5 | Usar capability no declarada | Responde `unsupported`, sin fallback silencioso (C11) |
| A6 | Inventar estado o phase | Ignora afirmacion, deriva paso desde ledger (C4) |
| A7 | Ignorar stop condition e insistir | No ejecuta efectos, registra intento, escala (C15) |

Cada scenario adversarial es un test en `test/app/` con prefijo `TestApp_Adversarial_`.

## Modelo de fixtures

Fixtures basados en el formato Given/When/Then de los 18 conformance scenarios (C1-C18
de `docs.old/slices/01-planning/conformance.md`).

| Aspecto | Decision |
|---------|----------|
| Formato | Given/When/Then con campos estructurados del `ScenarioFixture` |
| Almacenamiento | `test/app/testdata/` y `test/e2e/fixtures/` |
| Acceso en Go | `embed.FS` para fixtures estaticos, `testdata/` para golden files |
| Actor scripted | Secuencia de operaciones con IDs y decisiones predeterminadas |
| Target repo | Repo temporal creado por `testutil`, con baseline verificable |

Cada fixture incluye: `fixture_id`, `target_repo`, `input`, `actor_profile`,
`expected_events`, `expected_artifacts`, `prohibited_effects`.

## Las 9 prohibiciones Green

Adaptadas de `docs.old/quality/production-safe-green.md` como reglas concretas de Go.

| # | Prohibicion | Deteccion en Go |
|---|-------------|-----------------|
| P1 | Modificar/borrar/relajar tests para que pasen | `git diff` del test no reduce assertions |
| P2 | Introducir `TODO`, placeholders o implementaciones simuladas | `rg 'TODO\|FIXME\|placeholder\|panic\("not implemented"\)'` |
| P3 | Incorporar secrets en codigo, fixtures o logs | `rg` con patrones de secrets + scanner estatico |
| P4 | Agregar suppressions para ocultar checks fallidos | `rg 'nolint\|nosec\|#nosec'` sin justificacion inline |
| P5 | Usar catches amplios o politicas allow-all | `rg 'recover\(\)' + 'err == nil'` sin discriminacion |
| P6 | Agregar dependencia sin justificacion | Diff de `go.mod` revisado contra `required_checks` |
| P7 | Bypassar autenticacion/autorizacion/guards | Review contra `applicable_controls` del handoff |
| P8 | Convertir falla fail-closed en fallback silencioso | Analisis estatico de error handling paths |
| P9 | Diferir a Refactor una violacion MUST | Review de `definition_of_green` vs estado actual |

## Politica de cobertura

Fuente: `principia/constitution.md`, Secciones 7d y 7f.

| Regla | Detalle |
|-------|---------|
| Donde se mide | Solo en tier App/Servicio: `go test -cover ./test/app/...` |
| Donde NO se mide | Packages internos (`internal/`). Su cobertura es irrelevante |
| droppableCode | Codigo con 0% de cobertura en appTests = candidato a eliminacion (7f) |
| Threshold | Obligatorio, nunca se reduce sin autorizacion MIM |
| Excepciones | Tag explicito en archivo, justificacion documentada, revision periodica |
| Mutation testing | Se ejecuta en Refactor (F1) para elevar enlace a `verified` |

Coverage no es metrica de vanidad: es el detector de codigo muerto que alimenta
droppableCode.

## Documentos relacionados

- [Production-Safe Green](production-safe-green.md) -- contrato R/G/R concreto
- [Testing Matrix](../quality/matriz-de-testing.md) -- modelo de boundaries
- [Binding Layer](../quality/binding-layer.md) -- progresion de confianza del enlace
- [Red/Green/Refactor](../quality/red-green-refactor.md) -- TDD por lotes

---

← Anterior: [Artefactos](./artifacts.md) · [↑ implementation](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Production-Safe Green](./production-safe-green.md) →
