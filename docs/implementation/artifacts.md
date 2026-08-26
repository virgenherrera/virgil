# Artefactos de build

[← docs/](../README.md) · [← implementation/](./README.md)

Definicion de los build artifacts que produce el Echo System Go: que se genera, donde se almacena, como se identifica y como se vincula con la evidencia de Virgil.

Fuente: `principia/constitution.md`, Secciones 7a, 7b, 11f.

## Distincion constitucional

Los build artifacts NO son deliverables (principia S7b). Los deliverables (idea.md, spec.md, etc.) viven en el ArtifactStore y son gestionados por el TPM. Los build artifacts son outputs efimeros y regenerables del pipeline Echo.

| Tipo | Ejemplo | Donde vive | Gestionado por |
|---|---|---|---|
| Deliverable | `project.json`, `events.jsonl` | ArtifactStore (`{target}/docs/virgil/`) | TPM |
| Build artifact | Binario, coverage, lint report | `dist/` (local, gitignored) o CI artifact store | Echo System |

## Estructura de dist

```text
dist/
  virgil                          -- binario local (dev)
  virgil-linux-amd64              -- cross-compiled
  virgil-linux-arm64              -- cross-compiled
  virgil-darwin-amd64             -- cross-compiled
  virgil-darwin-arm64             -- cross-compiled
  coverage.out                    -- Go cover profile (paso 3: Dynamic)
  coverage.html                   -- Reporte visual (generado con go tool cover)
  lint-report.json                -- Salida de golangci-lint (paso 2: Static)
  evidence/                       -- EvidenceBundles por corrida
    {run-id}/
      manifest.json               -- Identidad del bundle
      trace.json                  -- AgentInteractionTrace
      snapshots/                  -- Filesystem snapshots pre/post
      diffs/                      -- Filesystem diffs observados
      runner-report.json          -- Observaciones del runner
```

El directorio `dist/` esta en `.gitignore`. Los artefactos son regenerables desde cualquier `sourceRevision`.

## Convencion de nombres del binario

**Decision**: `virgil-{os}-{arch}` para cross-compilacion.

```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o dist/virgil-linux-amd64 ./cmd/virgil
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -o dist/virgil-darwin-arm64 ./cmd/virgil
```

Para desarrollo local, `dist/virgil` sin sufijo.

## Coverage

**Formato**: Go cover profile (`-coverprofile`).

```bash
go test ./test/app/... -coverprofile=dist/coverage.out -count=1
go tool cover -html=dist/coverage.out -o dist/coverage.html
```

Coverage se mide sobre archivos con logica real (principia S7f: cobertura selectiva). Codigo con 0% de cobertura en app tests es candidato a `droppableCode`.

El threshold de cobertura es obligatorio y nunca se reduce sin autorizacion explicita del MIM (principia S7f).

## Lint reports

**Formato**: JSON para consumo programatico.

```bash
golangci-lint run --out-format json > dist/lint-report.json
```

El reporte alimenta el paso Static del Echo. Si contiene errores, el pipeline se detiene.

## EvidenceBundle

El EvidenceBundle es el puente entre los build artifacts del Echo y el sistema de evidencia de Virgil (principia S11f: evidencia como dato queryable).

### Mapeo EchoRun a EvidenceIngestion

| Campo del EchoRun | Campo de evidencia | Fuente |
|---|---|---|
| `source_revision` | `sourceRevision` | `git rev-parse HEAD` |
| `echo_steps` | Resultados por paso | Exit codes + outputs de cada comando |
| `binary_digest` | `buildArtifactSet.binary` | SHA-256 del binario producido |
| `coverage_profile` | `buildArtifactSet.coverage` | `dist/coverage.out` |
| `lint_report` | `buildArtifactSet.lint` | `dist/lint-report.json` |
| `test_results` | `buildArtifactSet.tests` | Output de `go test -json` |

### Invariante de procedencia

Cada `buildArtifactSet` DEBE quedar ligado inequivocamente al `EchoRun` y a la `sourceRevision` que lo produjo (principia S7b). QA nunca certifica "el ultimo reporte" de forma implicita; certifica un conjunto de artefactos atribuible a una revision concreta.

```text
sourceRevision (commit SHA)
    |
    v
EchoRun (ejecucion de los 5 pasos)
    |
    v
buildArtifactSet (binario + coverage + lint + test results)
    |
    v
EvidenceIngestion (Kernel registra en Ledger)
```

### Publicacion del bundle

El EvidenceBundle se publica fuera del target y del store (principia S7b: storage efimero/regenerable). En desarrollo local, vive bajo `dist/evidence/{run-id}/`. En CI, se publica como artifact del pipeline.

El bundle se prepara completo, se sincroniza y se publica atomicamente. Credenciales y secrets nunca se persisten en el bundle; se registra la redaccion y el mecanismo de provision.

## Relacion con otros documentos

| Documento | Relacion |
|---|---|
| [Echo System Go](echo-system-go.md) | Define los comandos que producen estos artefactos |
| [Go Runtime](go-runtime.md) | Define la version de Go y dependencias que condicionan el build |
| [quality/echo-system](../quality/echo-system.md) | Define los 5 pasos abstractos |
| [quality/binding-layer](../quality/binding-layer.md) | Consume la evidencia para progresion declared-inferred-verified |

---

← Anterior: [Echo System Go](./echo-system-go.md) · [↑ implementation](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Testing Strategy](./testing-strategy.md) →
