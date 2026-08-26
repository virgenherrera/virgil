# Conformance Scenarios

[← docs/](../README.md) · [← implementation/](./README.md)

Scenarios black-box que validan comportamiento observable del Slice 1 (Planning). No prescriben lenguaje, framework, host ni ArtifactStoreAdapter. Cada scenario usa formato Given/When/Then y es verificable mecanicamente.

Fuente: `principia/constitution.md`, Secciones 3b, 7d, 8a, 10.

## Tiers de ejecucion

Los conformance scenarios se ejecutan en dos tiers:

| Tier | Ambiente | Que valida |
|---|---|---|
| T0 | Self-hosted (binario contra fixtures embebidas) | Protocolo, contratos, idempotencia, recovery |
| T1 | Consumer project (proyecto TypeScript externo) | Flujo e2e real, MCP discovery, handoff quality |

En CI, T0 corre como parte del paso E2E del Echo System (`go test ./test/app -run '^TestApp_'`). T1 se ejecuta manualmente como validacion pre-release (Challenge-A).

## Aislamiento

### C1 — Dogma y target distintos

**Given** `method_source` y `target` resuelven a la misma ruta canonica, incluso mediante symlink.
**When** se ejecuta `virgil init`.
**Then** responde `blocked`, explica `method_source != target` y no escribe en dogma, target ni store.

### C2 — Proyectos aislados con el mismo change_id

**Given** dos ProjectRef distintos, ArtifactStoreRef explicitos y el mismo `change_id`.
**When** cada proyecto ejecuta `virgil new`.
**Then** revisiones, briefs y eventos quedan bajo namespaces de proyecto distintos; consultar uno no retorna datos del otro.

### C3 — Diff permitido con repo-docs

**Given** `corpus_root = {target}/docs/`, `managed_root = {target}/docs/virgil/` y policy predeterminada.
**When** un cambio recorre idea a handoff.
**Then** el target diff contiene unicamente paths bajo `managed_root`, y cada cambio esta respaldado por eventos o artefactos registrados por el adapter.

### C4 — Adapter externo no modifica el target

**Given** un ArtifactStoreAdapter externo y un target observable.
**When** el mismo flujo de planning termina.
**Then** el target diff es vacio y los efectos persistidos solo aparecen en los recursos externos registrados.

### C5 — Documentacion existente permanece intacta

**Given** `{target}/docs/` contiene documentos del proyecto antes de `virgil init`.
**When** Slice 1 crea y actualiza artefactos bajo `managed_root`.
**Then** bytes, permisos y tiempos de modificacion de los documentos existentes fuera de `managed_root` permanecen iguales.

### C6 — Escritura fuera de managed_root bloqueada

**Given** planning con `repo-docs` y sin opt-in adicional.
**When** un actor intenta escribir codigo, configuracion o un path fuera de `managed_root`.
**Then** Virgil bloquea el efecto, registra el intento y esos paths permanecen sin cambios.

## Recovery

### C7 — Recovery en sesion fresca

**Given** una sesion produjo revisiones aprobadas de `idea` y `spec` y termino.
**When** una sesion sin historial conversacional ejecuta `virgil status` con las mismas referencias.
**Then** reconstruye desde el ArtifactStore, deriva `design` como siguiente paso y produce el mismo resultado que la sesion anterior.

### C8 — Retry idempotente no duplica estado

**Given** un request con `idempotency_key` y digest conocidos que publico eventos y una revision.
**When** un proceso nuevo repite la misma operacion, key y contenido.
**Then** devuelve el mismo resultado semantico sin crear otra revision ni eventos duplicados.

### C9 — Reuso incompatible de idempotency key

**Given** un `idempotency_key` ya asociado a un digest de request.
**When** un actor lo reutiliza con contenido distinto.
**Then** responde `IDEMPOTENCY_CONFLICT`, no ejecuta efectos y conserva intacto el estado anterior.

## Derivacion de estado

### C10 — Siguiente fase deterministica

**Given** cualquier combinacion valida de revisiones y eventos.
**When** dos procesos de lectura calculan el paso actual.
**Then** ambos seleccionan el primer tipo requerido sin revision aprobada efectiva; no consultan un campo `phase` persistido.

### C11 — Revision aprobada inmutable

**Given** una revision aprobada con identidad y contenido conocidos.
**When** se solicita corregir ese artefacto.
**Then** la revision original conserva identidad y bytes; se crea una revision nueva y, solo cuando esta se aprueba, la anterior recibe `superseded`.

### C12 — ContextBrief minimo y auditable

**Given** un cambio en `design`, otro cambio del mismo proyecto, y documentos en `corpus_root`.
**When** Virgil compila el brief con la read allowlist del contrato.
**Then** incluye solo objetivo, limites y fuentes de ese cambio; no incluye datos de otros cambios/proyectos ni crawl del corpus.

## Adapter compliance

### C13 — Capability no soportada no se simula

**Given** un HostAdapter o ArtifactStoreAdapter que no ofrece durabilidad, atomicidad o acceso requeridos.
**When** una operacion necesita esa capability.
**Then** responde `unsupported`, identifica la capability faltante y no usa sustitutos silenciosos.

### C14 — Adapter, policy y efectos quedan auditados

**Given** cualquier operacion de planning.
**When** la operacion produce o rechaza un efecto.
**Then** la evidencia registra adapter ID/version, roots resueltos, allowlist efectiva, efecto solicitado, decision y efecto observado.

### C15 — Referencias cruzadas inconsistentes

**Given** un request valido contra JSON Schema donde ProjectRef referencia un DogmaRef o ArtifactStoreRef diferente al del envelope.
**When** Virgil resuelve el request antes de efectos.
**Then** responde `IDENTITY_AMBIGUOUS` o `PRECONDITION_FAILED` y no lee ni escribe ningun store o target.

## Evidencia

### C16 — Resultado estructurado, no exito narrado

**Given** un actor que afirma en prosa que una operacion termino correctamente.
**When** faltan campos requeridos por el protocolo en el envelope de resultado.
**Then** el harness no acepta la afirmacion como success y clasifica la falla con evidencia del envelope incompleto.

### C17 — Fixture invalido falla antes de efectos

**Given** un ScenarioFixture que viola su schema o cuyas expectativas tienen IDs inexistentes.
**When** el harness intenta preparar la corrida.
**Then** clasifica `fixture_failure`, no invoca a Virgil y conserva target y store intactos.

### C18 — Evidencia parcial no certifica

**Given** una corrida cuyo manifest omite la traza, contiene un digest incorrecto o publica un secret.
**When** el harness evalua el EvidenceBundle.
**Then** el scenario no obtiene `passed`; la falla y el recurso afectado quedan identificados sin presentar el bundle como evidencia autoritativa.

## Documentos relacionados

- [Echo System](../quality/echo-system.md) -- pipeline donde corren los scenarios T0
- [CI/CD](ci-cd.md) -- como se ejecutan en el pipeline automatizado
- [Go Runtime](go-runtime.md) -- `test/app` y los selectors app-level

---

← Anterior: [Releases](./releases.md) · [↑ implementation](./README.md) · [↑↑ docs](../README.md)
