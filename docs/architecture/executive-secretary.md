# Virgil: Secretaría Ejecutiva

## Rol arquitectónico

Virgil **es la Secretaría Ejecutiva**: el **knowledge plane** y el **control
plane** del proyecto. Mantiene su identidad y mapa global, aplica y registra
transiciones y prepara el contexto que cada actor necesita.

No es un rol productivo, no decide el producto y no implementa código. Tampoco
es Scrum Master: ese nombre pertenece, si el pack lo necesita, a un rol
opcional del Method Pack Scrum. El ownership de Virgil es sobre identidad,
conocimiento, procedencia, coordinación y continuidad.

## Componentes lógicos

### Ledger

Registra eventos y transiciones relevantes con actor, tiempo, run/change,
referencias y razón. El historial no se reescribe para ocultar una decisión
anterior; una corrección genera un nuevo evento.

### TraceabilityGraph

Mantiene relaciones tipadas entre intención, decisiones, trabajo y evidencia.
Permite recorrer el grafo en ambos sentidos sin depender de comentarios
embebidos en código.

### ArtifactRepository

Custodia artefactos y revisiones. Conserva identidad, ownership, procedencia y
relaciones; el formato físico puede variar por adapter.

### EvidenceIngestion

Incorpora hechos observables producidos por el target o por herramientas:
resultados de tests, commits, builds, despliegues, decisiones humanas y otras
evidencias. Ingerir no equivale a aprobar; el ledger registra después cómo se
usó esa evidencia.

### ContextCompiler

Selecciona artefactos, hechos y límites para producir un `ContextBrief`. La
selección se deriva del contrato activo y queda trazable.

### RetrievalProjection

Expone búsquedas sobre una proyección léxica, vectorial o de grafo. Puede
reconstruirse desde las fuentes autoritativas.

> **El RAG no es autoridad.** Es una optimización de lectura sobre el ledger,
> el repositorio de artefactos, el grafo y la evidencia.

## Invariante de contexto

La Secretaría conoce el inventario global, pero no entrega ese inventario
completo por defecto:

> **`global ownership != global context injection`**

Para cada ejecución debe poder responder:

- qué objetivo habilitó el brief;
- qué fuentes fueron seleccionadas;
- qué límites se excluyeron;
- qué versión o baseline se usó;
- qué evidencia nueva regresó.

## Control de transiciones

Una transición se acepta cuando el contrato aplicable y su evidencia lo
permiten. El Method Pack aporta ceremonia, roles, routing y gates; Virgil
evalúa el resultado del gate, aplica la transición permitida y la registra. El
RuntimeAdapter ejecuta los efectos soportados por el host.

Si execution encuentra que una condición aprobada es ambigua, contradictoria
o insuficiente, la Secretaría registra `PlanningGapDetected`, bloquea solo el
scope afectado y devuelve el control a planning. Execution no reescribe el
artefacto aprobado.

## Recovery

Después de una sesión perdida, el estado se reconstruye desde el ledger, las
revisiones de artefactos, el grafo y la evidencia. Una caché de conversación o
un índice RAG puede acelerar la recuperación, pero nunca reemplazarla.
