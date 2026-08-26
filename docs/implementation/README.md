# Implementacion

[← docs/](../README.md)

Esta seccion define las decisiones tecnicas concretas que restringen la implementacion del runtime Go de Virgil. No son guias ni sugerencias: son contratos normativos derivados del Principia que el codigo debe satisfacer.

Donde `docs/quality/` y `docs/architecture/` describen el **que** (invariantes, principios, gates), esta seccion describe el **como** (version de Go, dependencias exactas, comandos concretos, estructura de paquetes, artefactos de build).

## Orden de lectura

1. [Go Runtime](go-runtime.md) -- version, dependencias, paquetes, modelo de proceso
2. [Echo System Go](echo-system-go.md) -- instanciacion concreta del Echo System para Go
3. [Artefactos](artifacts.md) -- build artifacts, coverage, evidencia
4. [Testing Strategy](testing-strategy.md) -- estructura de tests, frameworks, fixtures, tiers
5. [Production-Safe Green](production-safe-green.md) -- contrato R/G/R concreto, prohibiciones
6. [CI/CD](ci-cd.md) -- pipeline de integracion continua y entrega continua
7. [Releases](releases.md) -- versionado, tagging, mantenimiento de dependencias, roadmap
8. [Conformance](conformance.md) -- scenarios black-box de aceptacion

## Relacion con otras secciones

| Seccion | Relacion |
|---|---|
| `quality/echo-system` | Define los 5 pasos abstractos; esta seccion los instancia con comandos Go |
| `quality/supply-chain` | Define los 3 invariantes; `go-runtime.md` los aplica con `go.sum` y `govulncheck` |
| `architecture/componentes` | Define Kernel/Adapter/MethodPack; `go-runtime.md` los mapea a paquetes `internal/` |

Fuente: `principia/constitution.md`, Secciones 5, 7a, 7b, 7h.

---

← Anterior: [Especificacion](../specification/README.md) · [↑↑ docs](../README.md)
