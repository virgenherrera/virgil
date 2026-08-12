# Visión y fundamentos

## Problema

Un agente puede ejecutar una tarea local y aun así perder el propósito global
del proyecto. El problema contrario también existe: inyectarle todo el
historial, todos los documentos y todo el código aumenta ruido, costo y riesgo
de mezclar decisiones que pertenecen a cambios distintos.

La situación empeora cuando se confunden dos árboles con el mismo nombre:
`Virgil/docs/`, que contiene el dogma operativo, y `{consumer}/docs/`, que
contiene conocimiento del proyecto consumidor. La cercanía física del segundo
es útil para retrieval local; el problema es carecer de identidad, policy y
write scope explícitos.

La metodología necesita resolver dos responsabilidades a la vez:

1. Mantener ownership global y continuidad entre sesiones, agentes y fases.
2. Entregar a cada ejecución solo el contexto mínimo suficiente para decidir y
   actuar dentro de su scope.

## Objetivo

Virgil **es el knowledge/control plane** del proyecto: agnóstico de host y
metodología, mantiene identidad, un registro trazable
del trabajo, briefs de contexto y transiciones. Debe poder acompañar un cambio
desde la idea hasta el handoff, la implementación, la verificación, la entrega
y la operación cuando corresponda.

El dogma de Virgil permanece read-only para consumidores. El conocimiento
operativo se persiste mediante un ArtifactStoreAdapter: `repo-docs` usa por
defecto un namespace administrado en `{target}/docs/virgil/`; otros adapters
pueden usar sistemas externos sin tocar el working tree.

Virgil no es Scrum Master ni reemplaza los roles de una metodología. Cada
Method Pack posee su ceremonia, sus roles, su routing y sus gates. El pack
Scrum puede definir un Scrum Master opcional; otro pack puede definir otros
roles o ninguno. Virgil aplica esos contratos sin adoptar sus identidades.

La invariante que guía el diseño es:

> **`global ownership != global context injection`**

Ownership global significa conocer qué existe, quién lo posee, en qué estado
está, de dónde proviene y cómo se relaciona. No significa cargar el contenido
completo en cada prompt.

## Principios

### 1. Identidad antes que inferencia

`DogmaRef`, `ProjectRef`, `ArtifactStoreRef` y el run/change activo DEBEN
identificarse de forma explícita. El directorio actual de la terminal no es
suficiente para inferirlos.

### 2. Autoridad separada de retrieval

Artefactos versionados, ledger y evidencia conservan la autoridad en el
ArtifactStore configurado. El corpus del consumidor puede alimentar índices
léxicos, vectoriales o de grafo, pero esos índices son proyecciones
reconstruibles para lectura.

### 3. Contexto compilado por contrato

Cada actor recibe un `ContextBrief` derivado de su objetivo, límites,
dependencias y evidencia necesaria. El brief debe explicar qué se incluyó y de
dónde salió.

### 4. Trazabilidad de extremo a extremo

El proyecto debe poder recorrer la intención hasta el resultado entregado y
volver desde una evidencia técnica hacia la decisión que la originó.

### 5. Planning y execution conservan sus responsabilidades

Planning define y aprueba intención, criterios y decisiones. Execution los
implementa y produce evidencia. Si execution descubre un defecto de planning,
NO lo corrige silenciosamente: emite `PlanningGapDetected`.

### 6. Host y ArtifactStore son adapters distintos

Un host puede tener un solo agente, subagentes, ejecución paralela, Git,
herramientas remotas o ninguna de esas capacidades. El HostAdapter expresa
discovery, invocación y envelopes; el ArtifactStoreAdapter traduce persistencia
y retrieval. El kernel no incorpora semántica de un proveedor particular.

### 7. Entrega incremental

Cada vertical slice debe ser utilizable de punta a punta antes de agregar el
siguiente. Una abstracción sin un flujo ejecutable que la pruebe permanece en
roadmap, no en el contrato normativo.

### 8. Control plane separado de ceremonia

Virgil posee las primitivas comunes de conocimiento y control. Los Method
Packs poseen la política metodológica. El kernel no contiene roles ni
transiciones con nombres de una ceremonia particular.

### 9. Dogma separado del RAG operativo

`Virgil/docs/` define cómo opera Virgil. `{consumer}/docs/` contiene fuentes y
artefactos del consumidor. Compartir el nombre `docs` no autoriza a mezclar
identidad, ownership ni write policies.

## No-objetivos iniciales

Durante los primeros slices Virgil no intenta:

- soportar simultáneamente todos los Method Packs;
- ejecutar múltiples agentes en paralelo;
- implementar GraphRAG;
- imponer una estrategia universal de Git, CI/CD o despliegue;
- definir un catálogo exhaustivo de métricas de calidad;
- reemplazar al producto, al repositorio objetivo o a sus herramientas;
- convertir toda documentación histórica en reglas vigentes.

Estas capacidades pueden incorporarse cuando un slice previo haya establecido
los contratos y la evidencia necesarios.
