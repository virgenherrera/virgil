# Production-Safe Green

[← docs/](../README.md) · [← implementation/](./README.md)

Contrato concreto para la fase Green de Virgil en Go. Define que significa "Green",
que campos debe contener cada handoff, que esta prohibido, y como se verifica.

Marco constitucional: `principia/constitution.md`, Secciones 7c (R/G/R) y 7d (boundaries).
Campos H1-H7 y prohibiciones P1-P9: implementacion concreta adaptada de
`docs.old/quality/production-safe-green.md`.

## Definicion de Green

> Green es el minimo codigo production-safe que satisface los contratos funcionales
> y todas las restricciones de quality y security definidas en Red.

"Minimo" reduce superficie y tiempo de feedback. "Production-safe" impide que la
velocidad se financie con deuda conocida. Si una condicion es necesaria para operar
con seguridad, pertenece a Red y a Green; no se posterga a Refactor.

## Los 7 campos obligatorios del handoff

Todo handoff de implementacion DEBE incluir estos campos. Si falta uno, execution
emite `PlanningGapDetected` y devuelve el handoff a planning.

| # | Campo | Contrato | Verificacion en Go |
|---|-------|----------|--------------------|
| H1 | `quality_profile` | Superficie, riesgo, nivel de rigor, estandares elegidos | Struct con campos requeridos, validacion en `virgil_write` |
| H2 | `applicable_controls` | Controles concretos y como se observan | Lista de control IDs referenciables por tests |
| H3 | `forbidden_shortcuts` | Cambios que invalidan Green aunque el happy path pase | Array de strings, cada uno mapeado a una prohibicion P1-P9 |
| H4 | `required_checks` | Checks app-level, negativos, de seguridad y estaticos | Lista de check IDs que el pipeline debe ejecutar |
| H5 | `definition_of_green` | Condicion verificable para declarar implementacion minima | Predicado evaluable: "todos los `TestApp_*` pasan + 0 mocks" |
| H6 | `evidence_required` | Eventos, artefactos, logs, diffs que deben conservarse | Lista de artefactos para el EvidenceBundle |
| H7 | `refactor_targets` | Mejoras estructurales para despues de Green | Lista de mejoras deseables, nunca violaciones MUST |

La validacion de completitud es mecanica: el kernel verifica la presencia de los 7
campos antes de permitir la transicion a execution (gate R0).

## Las 9 prohibiciones Green

Reglas concretas para Go. Cada prohibicion tiene un mecanismo de deteccion automatizable.

| # | Prohibicion | Que significa en Go | Deteccion |
|---|-------------|---------------------|-----------|
| P1 | No modificar tests para que pasen | `git diff` de `test/` no reduce assertions ni elimina subtests | Diff analysis en pipeline |
| P2 | No introducir placeholders | Sin `panic("not implemented")`, `// TODO: implement`, `return nil` sin logica | `rg` + analisis estatico |
| P3 | No incorporar secrets | Sin strings hardcodeadas de credenciales en `.go`, `testdata/`, fixtures | Scanner estatico + patterns |
| P4 | No agregar suppressions | `//nolint` solo con justificacion inline documentada; `#nosec` prohibido sin excepcion MIM | Linter config + review |
| P5 | No usar catches amplios | `recover()` solo en boundaries definidos; `if err != nil { return nil }` prohibido | `go vet` + reviewdog |
| P6 | No agregar dependencias sin justificacion | Todo cambio en `go.mod` requiere entrada en `required_checks` con version exacta (7h) | `go mod tidy` + diff review |
| P7 | No bypassar guards | Sin `ctx.Value()` para eludir autenticacion; sin type assertions sin check | Review contra `applicable_controls` |
| P8 | No convertir fail-closed en fallback | `os.Exit(1)` o `log.Fatal` no se reemplazan por `log.Warn` + continue | Analisis de error paths |
| P9 | No diferir violaciones MUST | Todo MUST del handoff se resuelve en Green o se escala a planning | Review contra `definition_of_green` |

## Que significa "Green pasa"

Green esta completo cuando se cumplen TODAS las condiciones simultaneamente:

| Condicion | Verificacion |
|-----------|--------------|
| Todos los tests app-level pasan | `go test ./test/app/... -run '^TestApp_'` exit code 0 |
| Cero mocks en toda la suite | Sin interfaces de test, sin fakes, sin stubs en `test/app/` |
| Coverage threshold alcanzado | `go test -cover ./test/app/...` sobre el umbral configurado |
| Cero prohibiciones violadas | Las 9 prohibiciones P1-P9 verificadas sin excepciones |
| Handoff completo satisfecho | Los 7 campos H1-H7 tienen evidencia correspondiente |
| Scenarios adversariales pasan | `TestApp_Adversarial_*` todos green |

Si cualquier condicion falla, Green no se declara.

## Que agrega Refactor

Refactor no cambia ACs ni relaja controles. Agrega verificacion de fortaleza:

| Metrica | Herramienta | Umbral |
|---------|-------------|--------|
| Mutation score | `gremlins` o equivalente | Definido por quality_profile, no relajable sin MIM |
| CRAP score | Derivado de cobertura + complejidad ciclomatica | Sin incremento respecto a baseline |
| Complejidad ciclomatica | `gocyclo` o `gocognit` | Maximo definido por quality_profile |
| Binding Layer | Progresion de `inferred` a `verified` | Mutation testing confirma fortaleza real |

Refactor es donde el enlace test-codigo alcanza el nivel `verified` via mutation
testing. Solo `verified` certifica fortaleza (Binding Layer, Seccion 7d).

## Refactor no es basurero de seguridad

Una vulnerabilidad, bypass, secret o manejo inseguro de errores descubierto durante
Green se corrige antes de declarar Green. Si la correccion modifica el contrato, se
escala a planning via `PlanningGapDetected`. Nunca se posterga a Refactor.

## Gates del ciclo R/G/R

| Gate | Condicion de entrada | Condicion de salida |
|------|---------------------|---------------------|
| **R0** | Handoff con 7 campos presentes | Deliverables de planning validados |
| **R1** | Plan de tests definido | Suite completa, todos fallan (red valido) |
| **G1** | Suite red valida | Production-Safe Green: todas las condiciones de arriba |
| **F1** | Green completo | Metricas dentro de umbral, tests siguen pasando |
| **V1** | Refactor completo | Certificacion independiente del bundle completo |

## Documentos relacionados

- [Testing Strategy](testing-strategy.md) -- estructura, frameworks, fixtures
- [Testing Matrix](../quality/matriz-de-testing.md) -- modelo de boundaries
- [Red/Green/Refactor](../quality/red-green-refactor.md) -- TDD por lotes
- [Binding Layer](../quality/binding-layer.md) -- progresion de confianza del enlace

---

← Anterior: [Testing Strategy](./testing-strategy.md) · [↑ implementation](./README.md) · [↑↑ docs](../README.md) · Siguiente: [CI/CD](./ci-cd.md) →
