# Slice 1 — Conformidad black-box

## Propósito

Estos scenarios describen comportamiento observable de cualquier
implementación de Slice 1. No prescriben lenguaje, framework, host ni
ArtifactStoreAdapter.

## C1 — Dogma y target distintos

**Given** `method_source` y `target` resuelven a la misma ruta canónica,
incluso mediante symlink.
**When** se ejecuta `virgil-init`.
**Then** responde `blocked`, explica `method_source != target` y no escribe
en dogma, target ni store.

## C2 — Proyectos aislados con el mismo `change_id`

**Given** dos ProjectRef distintos, ArtifactStoreRef explícitos y el mismo
`change_id`.
**When** cada proyecto ejecuta `virgil-new`.
**Then** revisiones, briefs y eventos quedan bajo namespaces de proyecto
distintos; consultar uno no retorna datos del otro.

## C3 — Recovery en sesión fresca

**Given** una sesión produjo revisiones aprobadas efectivas de `idea` y `spec`
y terminó.
**When** una sesión sin historial conversacional ejecuta `virgil-continue` con
las mismas referencias.
**Then** reconstruye desde el ArtifactStore, deriva `design` y produce el mismo
siguiente paso que la sesión anterior.

## C4 — Siguiente fase determinística

**Given** cualquier combinación válida de revisiones y eventos.
**When** dos procesos de lectura calculan el paso actual.
**Then** ambos seleccionan el primer tipo requerido sin revisión aprobada
efectiva; no consultan un campo `phase` persistido.

## C5 — Diff permitido con `repo-docs`

**Given** `corpus_root = {target}/docs/`, `managed_root =
{target}/docs/virgil/` y policy predeterminada.
**When** un cambio recorre idea → handoff.
**Then** el target diff contiene únicamente paths bajo `managed_root`, y cada
cambio está respaldado exactamente por eventos, briefs o artefactos registrados
por el adapter.

## C6 — Adapter externo no modifica el target

**Given** un ArtifactStoreAdapter externo y un target observable.
**When** el mismo flujo de planning termina.
**Then** el target diff es vacío y los efectos persistidos solo aparecen en los
recursos externos registrados.

## C7 — Código, configuración y docs no autorizados

**Given** planning con `repo-docs` y sin opt-in adicional.
**When** un actor intenta escribir código, producto, configuración o un path de
`{target}/docs/**` fuera de `managed_root`.
**Then** Virgil bloquea el efecto, registra el intento y esos paths permanecen
sin cambios.

## C8 — Documentación existente del consumidor permanece intacta

**Given** `{target}/docs/` contiene documentos project-specific antes de
`virgil-init`.
**When** Slice 1 crea y actualiza artefactos bajo `managed_root`.
**Then** bytes, permisos y tiempos de modificación de los documentos existentes
fuera de `managed_root` permanecen iguales.

## C9 — Revisión aprobada inmutable

**Given** una revisión aprobada con identidad y contenido conocidos.
**When** se solicita corregir ese artefacto.
**Then** la revisión original conserva identidad y bytes; se crea una revisión
nueva y, solo cuando esta se aprueba, la anterior recibe `superseded`.

## C10 — `ContextBrief` mínimo y auditable

**Given** un cambio en `design`, otro cambio del mismo proyecto, otro proyecto
y documentos adicionales en `corpus_root`.
**When** Virgil compila el brief con la read allowlist del contrato.
**Then** incluye solo objetivo, límites y fuentes necesarias de ese cambio; no
incluye datos de otros cambios/proyectos ni un crawl completo del corpus, y cada
elemento referencia su fuente.

## C11 — Capability no soportada no se simula

**Given** un HostAdapter o ArtifactStoreAdapter que no ofrece durabilidad,
atomicidad o acceso requeridos.
**When** una operación necesita esa capability.
**Then** responde `unsupported`, identifica la capability faltante y no usa
memoria temporal, last-write-wins ni otro sustituto silencioso.

## C12 — Adapter, policy y efectos quedan auditados

**Given** cualquier operación de planning.
**When** la operación produce o rechaza un efecto.
**Then** la evidencia registra ArtifactStoreAdapter ID/version,
roots/recursos resueltos, allowlist efectiva, efecto solicitado, decisión y
efecto realmente observado.

## C13 — Retry idempotente no duplica estado

**Given** un request completo con `idempotency_key` y digest conocidos que
publicó eventos y una revisión.
**When** un proceso nuevo repite la misma operación, key y contenido.
**Then** devuelve el mismo resultado semántico o su replay recuperado sin crear
otra revisión ni eventos duplicados.

## C14 — Reuso incompatible de idempotency key

**Given** un `idempotency_key` ya asociado a un digest de request.
**When** un actor lo reutiliza con contenido distinto.
**Then** la operación responde `IDEMPOTENCY_CONFLICT`, no ejecuta efectos y
conserva intacto el estado anterior.

## C15 — Resultado estructurado, no éxito narrado

**Given** un actor que afirma en prosa que una operación terminó correctamente.
**When** faltan `requested_context`, eventos, EffectRecords o, después de una
resolución exitosa, `resolved_context` requeridos por el protocolo.
**Then** el harness no acepta la afirmación como success y clasifica la falla
con evidencia del envelope incompleto.

## C16 — Referencias cruzadas inconsistentes

**Given** un request válido contra JSON Schema donde ProjectRef referencia otro
DogmaRef, ArtifactStoreRef o `project_id` que los incluidos en el envelope.
**When** Virgil resuelve el request antes de efectos.
**Then** responde `IDENTITY_AMBIGUOUS` o `PRECONDITION_FAILED`, registra las
referencias conflictivas y no lee ni escribe ningún store o target.

## C17 — Fixture inválido falla antes de efectos

**Given** un ScenarioFixture que viola su schema o cuyas expectativas tienen
IDs inexistentes, orden cíclico o `min_count > max_count`.
**When** el harness intenta preparar la corrida.
**Then** clasifica `fixture_failure`, no invoca a Virgil y conserva target y
store intactos.

## C18 — Evidencia parcial o inconsistente no certifica

**Given** una corrida cuyo manifest omite la traza, contiene un digest que no
coincide, publica un secret o no fue publicado atómicamente.
**When** el harness evalúa el EvidenceBundle.
**Then** el scenario no obtiene `passed`; la falla y el recurso afectado quedan
identificados sin presentar el bundle como evidencia autoritativa.
