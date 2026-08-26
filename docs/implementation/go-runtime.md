# Go Runtime

[← docs/](../README.md) · [← implementation/](./README.md)

Decisiones concretas sobre el runtime Go de Virgil: version, dependencias, estructura de paquetes, build y modelo de proceso.

Fuente: `principia/constitution.md`, Secciones 5, 7h, 3b.

## Version de Go

**Decision**: Go 1.24+ (ultima estable). Se fija mediante la directiva `toolchain` en `go.mod`.

Razon: Go 1.24 es la ultima version estable a la fecha de este documento. La directiva `toolchain` garantiza que todos los ambientes usen la misma version del compilador, eliminando drift entre dev/CI/CD (principia S7h: versionPinning).

```text
go 1.24
toolchain go1.24.0
```

> **Nota**: el `go.mod` actual del repositorio declara Go 1.26.5 porque el desarrollo arranco con una version RC disponible. Si la version estable publicada difiere, se ajusta `go.mod` al release final. El invariante es: version exacta, no rango.

## Dependencias

**Decision**: minimas y pineadas a version exacta. Go modules con `go.sum` como lock file versionado (principia S7h: versionPinning).

| Dependencia | Version | Justificacion |
|---|---|---|
| `github.com/spf13/cobra` | v1.10.2 | CLI framework. Aporta subcomandos, flags, ayuda y completions sin reinventar la rueda. |
| `github.com/santhosh-tekuri/jsonschema/v6` | v6.0.3 | JSON Schema Draft 2020-12. Necesario para validacion de contratos y fixtures. Loader bundled-only. |
| `github.com/gowebpki/jcs` | v1.0.1 | RFC 8785 (JSON Canonicalization Scheme). Necesario para identidad idempotente e integridad de digests. |

Tres dependencias directas. Cada dependencia adicional requiere revision explicita de este contrato y evaluacion de trade-off de supply chain (principia S7h).

**Prohibidas**: ORMs, web frameworks, loggers externos, UUID libraries, Docker SDK, clientes de red, YAML parsers. Virgil es un CLI local, no un servicio web.

## Paquetes internos

**Decision**: toda la logica vive bajo `internal/` para prevenir importacion externa. La separacion Kernel/Adapter/MethodPack del Principia (S5) se mapea asi:

```text
cmd/virgil/              -- punto de entrada, main()
internal/
  kernel/                -- Ledger, TraceabilityGraph, EvidenceIngestion, ContextCompiler
  protocol/              -- OperationRequest/Result, envelopes, wire format
  contracts/             -- JSON Schemas embebidos, validacion
  adapters/
    repodocs/            -- ArtifactStoreAdapter: repo-docs (default)
    host/                -- HostAdapter: discovery, invocacion MCP/JSON-RPC
  packs/
    scrum/               -- Method Pack Scrum (unico implementado)
  runtime/               -- orquestacion de invocacion, dispatch
  t0/                    -- harness T0, fixtures embebidas
  evidence/              -- EvidenceBundle, snapshots, diffs
```

### Reglas de importacion

| Paquete | Puede importar | No puede importar |
|---|---|---|
| `kernel/` | `protocol/`, `contracts/`, stdlib | adapters, packs, t0 |
| `adapters/*` | `protocol/`, `contracts/`, stdlib | kernel internals, packs, t0 |
| `packs/*` | `protocol/`, kernel interfaces | adapters directos, t0 |
| `runtime/` | `protocol/`, `contracts/`, kernel, adapters, packs | t0 |
| `t0/` | `protocol/`, `contracts/`, `evidence/`, `os/exec` | kernel, runtime, adapters |
| `test/app/` | binario publico unicamente | cualquier paquete internal |

La regla critica: `t0/` opera el binario como subprocess, nunca importa el kernel (principia S7d: boundary testing). `test/app/` tampoco importa paquetes internos.

## Build

**Decision**: `go build` produce un unico binario estatico autocontenido (principia S5).

```bash
go build -o dist/virgil ./cmd/virgil
```

### Cross-compilacion

| Target | GOOS | GOARCH | Notas |
|---|---|---|---|
| Linux x86_64 | linux | amd64 | CI/CD principal |
| Linux ARM64 | linux | arm64 | Servidores ARM |
| macOS x86_64 | darwin | amd64 | Dev Intel |
| macOS ARM64 | darwin | arm64 | Dev Apple Silicon |
| Windows x86_64 | windows | amd64 | Soporte CLI multiplataforma |

**CGO**: deshabilitado (`CGO_ENABLED=0`). Todas las dependencias actuales son Go puro. Si tree-sitter (codebaseMemory, principia S8f) se integra en el futuro, esta restriccion se re-evaluara: tree-sitter requiere CGO, lo cual impactaria cross-compilacion y el invariante de binario estatico.

## Modelo de proceso

**Decision**: fresh process per invocation (principia S3b). Virgil no es un daemon.

- Cada invocacion crea un proceso nuevo del binario.
- Comunicacion via MCP/JSON-RPC: JSON por `stdin`, JSON por `stdout`.
- `stdout` es exclusivo para respuestas JSON. Diagnosticos van a `stderr`.
- El exit code no es la autoridad del resultado; el `OperationResult` JSON lo es.
- Ninguna ejecucion infiere identidad desde cwd, variables globales ni memoria conversacional.

### Assets embebidos

Los JSON Schemas y fixtures T0 se embeben en el binario via `go:embed`. El paquete `contracts/` es el unico propietario de la directiva `go:embed` para schemas. Los patrones de embed no pueden subir con `..`, por lo que la ubicacion del paquete determina que assets son accesibles.

---

[↑ implementation](./README.md) · [↑↑ docs](../README.md) · Siguiente: [Echo System Go](./echo-system-go.md) →
