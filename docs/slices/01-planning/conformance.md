# Slice 1 — Conformidad black-box

## Propósito

Estos escenarios describen comportamiento observable de cualquier
implementación de Slice 1. No prescriben lenguaje, framework ni interfaz de
usuario.

## C1 — Source y target distintos

**Given** `method_source` y `target` resuelven a la misma ruta canónica, incluso
mediante symlink.
**When** se ejecuta `virgil-init`.
**Then** responde `blocked`, explica el guard `method_source != target` y no
escribe ni en target ni en store.

## C2 — Proyectos aislados con el mismo `change_id`

**Given** dos `ProjectRef` distintos y el mismo `change_id`.
**When** cada proyecto ejecuta `virgil-new`.
**Then** revisiones, briefs y eventos quedan bajo namespaces de proyecto
distintos; consultar uno no retorna datos del otro.

## C3 — Recovery en sesión fresca

**Given** una sesión produjo revisiones aprobadas efectivas de `idea` y `spec`
y terminó.
**When** una sesión sin historial conversacional ejecuta `virgil-continue` con
el mismo ProjectRef y cambio.
**Then** reconstruye el estado solo desde el store, deriva `design` como paso
actual y produce el mismo siguiente paso que habría producido la sesión
anterior.

## C4 — Siguiente fase determinística

**Given** cualquier combinación válida de revisiones y eventos.
**When** dos procesos de lectura calculan el paso actual.
**Then** ambos seleccionan el primer tipo requerido sin revisión aprobada
efectiva; no consultan un campo `phase` persistido.

## C5 — Planning nunca escribe el target

**Given** un target observable y un cambio que recorre idea → handoff.
**When** se ejecutan `virgil-init`, `virgil-new` y todas las continuaciones de
Slice 1.
**Then** la operación no crea, modifica ni borra entradas del target, ni cambia
contenido, permisos o tiempos de modificación. Solo cambia el store externo.

## C6 — Revisión aprobada inmutable

**Given** una revisión aprobada con identidad y contenido conocidos.
**When** se solicita corregir ese artefacto.
**Then** la revisión original conserva identidad y bytes; se crea una revisión
nueva y, solo cuando esta se aprueba, la anterior recibe una transición
`superseded` en el ledger.

## C7 — `ContextBrief` mínimo y auditable

**Given** un cambio en el paso `design`, otro cambio del mismo proyecto y otro
proyecto en el store.
**When** Virgil compila el brief usando el allowlist de fuentes requerido por
el contrato del pack.
**Then** incluye solo objetivo, límites y revisiones upstream requeridas de ese
cambio; no incluye datos del otro cambio/proyecto ni un crawl completo del
target, y cada elemento incluido referencia su fuente.

## C8 — Capacidad no soportada no se simula

**Given** un RuntimeAdapter que declara no soportar persistencia durable o las
escrituras atómicas requeridas por el store local.
**When** se ejecuta una operación que necesita esa capacidad.
**Then** responde `unsupported`, identifica la capacidad faltante y no usa
memoria temporal ni last-write-wins como sustituto silencioso.
