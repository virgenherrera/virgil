# CI/CD Pipeline

[← docs/](../README.md) · [← implementation/](./README.md)

Pipeline concreto de integracion continua y entrega continua para el runtime Go de Virgil. Cada decision mapea al Echo System (principia S7a) y a Supply Chain Integrity (principia S7h).

Fuente: `principia/constitution.md`, Secciones 7a, 7h, 11c.

## CI: GitHub Actions

**Trigger**: push a cualquier branch, PR hacia main.

**Plataforma**: GitHub Actions, `ubuntu-latest`. Version de Go fijada por la directiva `toolchain` en `go.mod` (ver [go-runtime.md](go-runtime.md)). Un solo OS en CI; la cross-compilacion produce binarios para multiples plataformas en CD.

### Mapping Echo System a stages de CI

El pipeline mapea 1:1 a los 5 pasos del Echo System. El orden es constitucional y no se altera.

| Paso Echo | Stage CI | Que ejecuta | Gate |
|---|---|---|---|
| 1. Setup | `setup` | Checkout, setup Go, restore cache, `govulncheck ./...` | securityAudit blocking (S7h) |
| 2. Build | `build` | `CGO_ENABLED=0 go build -o dist/virgil ./cmd/virgil` | Binario compila sin errores |
| 3. Static | `static` | `go vet ./...`, `golangci-lint run`, `gofmt -l .` | Cero findings |
| 4. Dynamic | `dynamic` | `go test ./test/app/... -coverprofile=dist/coverage.out -count=1` | Coverage sin regresion |
| 5. E2E | `e2e` | `go test ./test/e2e/... -tags=e2e -count=1` | Conformance scenarios pasan |

### Caching

Dos caches aceleran el pipeline sin comprometer reproducibilidad:

| Cache | Key | Restaura |
|---|---|---|
| Go modules | `go.sum` hash | `~/go/pkg/mod` |
| Build cache | `**/*.go` hash | `~/.cache/go-build` |

El `go.sum` como key garantiza invalidacion automatica cuando cambian dependencias (versionPinning, S7h).

### Security: govulncheck como gate

`govulncheck` se ejecuta en Setup como gate blocking antes de Build. Si detecta vulnerabilidades en dependencias o en el codigo, el pipeline se detiene. Esto implementa securityAudit (S7h) en CI.

En Dev (pre-push hook), `govulncheck` alerta sin bloquear. En CI y CD, bloquea.

### Static analysis

Dos herramientas complementarias:

- **`go vet`**: analisis del compilador, detecta errores comunes
- **`golangci-lint`**: con configuracion de proyecto (`.golangci.yml`), incluye linters seleccionados para el codebase

### Coverage

El reporte de coverage se genera como artifact del pipeline. El threshold minimo se configura en el proyecto y nunca se reduce sin autorizacion del MIM (droppableCode, S7f). Coverage se mide sobre archivos con logica real (coverage selectiva).

## CD: Release pipeline

**Trigger**: push de tag `v*` (ver [releases.md](releases.md) para la estrategia de versionado).

### Cross-compilacion

Binario estatico, `CGO_ENABLED=0`. Cinco targets:

| GOOS | GOARCH | Archivo |
|---|---|---|
| linux | amd64 | `virgil-linux-amd64` |
| linux | arm64 | `virgil-linux-arm64` |
| darwin | amd64 | `virgil-darwin-amd64` |
| darwin | arm64 | `virgil-darwin-arm64` |
| windows | amd64 | `virgil-windows-amd64.exe` |

### Artefactos de release

| Artefacto | Herramienta | Proposito |
|---|---|---|
| Checksums SHA-256 | `sha256sum` | Verificacion de integridad post-descarga |
| SBOM | `cyclonedx-gomod` | Inventario de dependencias para auditoria de supply chain |
| Binarios | `go build` | Ejecutables por plataforma |

Los artefactos se publican en GitHub Releases. No se produce imagen Docker: Virgil es un CLI, no un servicio.

### Distribucion

- **Actual**: GitHub Releases (binarios + checksums + SBOM)
- **Futuro**: Homebrew tap para instalacion en macOS/Linux

## Validacion pre-release

Adaptado de `docs.old/validation/challenge-a-expectations.md`. Antes de cada release candidate, se valida en un proyecto consumidor real.

### Smoke test automatizado

```text
1. Descargar binario del release candidate
2. virgil init --project-id=smoke-test   (crear proyecto)
3. virgil status                          (verificar estado derivado)
4. Confirmar: virgil.json + AGENTS.md existen con schema correcto
```

### Challenge-A: validacion en proyecto TypeScript

Un proyecto TypeScript (`~/projects/challenge-a`) consume el binario como usuario final. Pre-release validation para cada RC.

**Prerequisitos**:

```bash
cd ~/projects/challenge-a
npm install
virgil install    # instala el RC via install.sh o go install
```

Reiniciar el agente despues del install.

**Step 1: init** — el agente llama `virgil_status`, luego `virgil_init`. Efectos: `virgil.json` + `AGENTS.md` creados. Sin directorio `docs/` todavia. Sin `active_change` en `virgil.json`.

**Step 2: pipeline** — el agente lee `CHALLENGE.md` y conduce idea, spec, design, tasks, handoff. Cada stage: `virgil_propose` (crea seed + artifact) seguido de aprobacion humana y `virgil_approve` (status transitions, `derived_step` avanza). Al completar: 5 artefactos aprobados, `derived_step` = `complete`, `active_change` = null.

**Step 3: implementation** — fuera del pipeline de Virgil. El agente implementa desde el handoff aprobado. `npm test` debe pasar todos los test cases.

**Concerns validados**:

| # | Concern | Condicion de paso |
|---|---------|-------------------|
| 1 | MCP discovery | Agente encuentra tools `virgil_*` tras install + restart |
| 2 | System prompt | Agente llama `virgil_status` en primera interaccion |
| 3 | `virgil_init` | `virgil.json` + `AGENTS.md` creados con schema correcto |
| 4 | `virgil_new` | `active_change` set, `derived_step` = idea |
| 5 | `virgil_propose` | Seed + artifact files creados con naming correcto |
| 6 | `virgil_approve` | Status transitions, `derived_step` avanza |
| 7 | Pipeline completion | 5 artefactos aprobados, complete alcanzado, `active_change` cleared |
| 8 | Handoff quality | Agente implementa codigo funcional desde el handoff aprobado |
| 9 | End-to-end | `npm test` pasa, CLI funcional |

**Modos de falla**:

| Sintoma | Causa probable |
|---------|----------------|
| Agente no encuentra tools `virgil_*` | MCP config incorrecta: verificar entry de `virgil serve` en settings del agente |
| `virgil_init` falla con `INVALID_ENVELOPE` | Version del binario incompatible o error de schema del envelope |
| Agente salta stages | Agente no lee respuesta de `virgil_status` sobre `derived_step` |
| Artefactos en path incorrecto | `managed_root` mal configurado en `virgil.json` |
| Tests fallan en caso DP | Agente uso greedy en vez de DP: el handoff debe especificar el algoritmo |
| Agente nunca llama `virgil_approve` | Agente no completa el loop de aprobacion |

Este challenge se ejecuta manualmente antes de promocionar un RC a release estable.

## Documentos relacionados

- [Echo System](../quality/echo-system.md) -- los 5 pasos abstractos que CI instancia
- [Supply Chain](../quality/supply-chain.md) -- los 3 invariantes de dependencias
- [Releases](releases.md) -- versionado, tagging, mantenimiento de dependencias
- [Go Runtime](go-runtime.md) -- version, dependencias, build

---

← Anterior: [Production-Safe Green](./production-safe-green.md) · [↑ implementation](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Releases](./releases.md) →
