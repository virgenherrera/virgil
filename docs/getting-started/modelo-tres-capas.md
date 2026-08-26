# Modelo de tres capas

Virgil se organiza en tres capas concentricas. Cada capa interna gobierna a las externas. Nada en una capa exterior puede contradecir a una capa interior.

Fuente: `principia/constitution.md`, Seccion 2.

## Las tres capas

### Principia (capa interna -- inmutable)

La constitucion fundacional de Virgil. Define filosofia, actores, invariantes arquitectonicos, principios de gobierno y mecanismos de calidad.

- **Mutabilidad**: inmutable una vez consolidado. No se modifica, no se versiona incrementalmente, no se overridea.
- **Contenido**: principios de gobierno (6), invariantes de arquitectura (9), actores y modos, delegacion y PDC, Echo System, R/G/R, testing matrix, gates de certificacion.
- **Ubicacion**: `principia/constitution.md`
- **Quien lo consulta**: desarrolladores de Virgil, agentes que necesitan entender los fundamentos.

### Dogma (capa intermedia -- normativo, versionado)

La proyeccion operativa del Principia hacia documentacion consumible. Traduce los principios inmutables en guias, protocolos y contratos concretos.

- **Mutabilidad**: versionado. Puede evolucionar, pero cada cambio debe ser consistente con el Principia. Si contradice al Principia, el Principia gana.
- **Contenido**: arquitectura detallada, protocolos y contratos, politicas de calidad, definiciones de slices de entrega incremental.
- **Ubicacion**: `docs/` (este directorio)
- **Quien lo consulta**: desarrolladores y agentes que implementan o consumen Virgil.

### Runtime (capa externa -- mutable)

El binario Go que ejecuta las operaciones de Virgil. Implementa los contratos definidos por el Dogma y los invariantes del Principia.

- **Mutabilidad**: mutable. El codigo cambia con cada iteracion de desarrollo, pero siempre dentro de los limites del Dogma y el Principia.
- **Contenido**: Kernel (Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RetrievalProjection), Adapters (HostAdapter, ArtifactStoreAdapter), Method Packs (Scrum es el unico implementado).
- **Ubicacion**: codigo fuente del proyecto.
- **Quien lo ejecuta**: agentes consumidores via MCP/JSON-RPC.

## Tabla comparativa

| Aspecto | Principia | Dogma | Runtime |
|---|---|---|---|
| Mutabilidad | Inmutable | Versionado | Mutable |
| Autoridad | Constitucional | Normativa | Operativa |
| Ubicacion | `principia/` | `docs/` | Codigo fuente |
| Formato | Documento unico | Documentos multiples | Binario Go |
| Puede contradecir a la capa interior | -- | No | No |

## La regla de gobierno

```text
Principia (inmutable)
    |
    |-- gobierna -->  Dogma (versionado)
                        |
                        |-- define contratos para -->  Runtime (mutable)
```

La direccion de gobierno siempre fluye de adentro hacia afuera:

- El Principia define QUE principios son inamovibles.
- El Dogma traduce esos principios en COMO se implementan los contratos, protocolos y politicas.
- El Runtime ejecuta esos contratos como codigo.

## Implicaciones practicas

### Donde vive cada cosa

| Tipo de contenido | Capa | Ejemplo |
|---|---|---|
| Principios de gobierno | Principia | "Constraint > confianza" |
| Invariantes arquitectonicos | Principia | "Identidad antes que inferencia" |
| Contratos normativos | Dogma | Boundaries de la testing matrix, triggers del Echo System, definiciones de ceremonia del Method Pack |
| Umbrales de metricas | Dogma | Mutation score minimo por tier |
| Implementacion de gates | Runtime | Codigo que ejecuta el Echo System |
| Adapters concretos | Runtime | HostAdapter para Claude/GPT |

### Que puede cambiar y que no

- **Quieres cambiar el runner de tests?** Puedes. Es Runtime (mutable).
- **Quieres cambiar los umbrales de coverage?** Puedes, dentro de los limites del Dogma.
- **Quieres eliminar el Echo System?** No puedes. Es Principia (inmutable).
- **Quieres agregar una gate de calidad adicional?** Puedes. Un Method Pack puede definir gates adicionales, pero no reducir el minimo del Kernel.

### El Kernel y los Method Packs

El Runtime se divide en dos partes con responsabilidades distintas:

- **Kernel**: ceremonia-agnostico, calidad universal. Impone los invariantes del Principia (Echo, R/G/R, testing matrix, gates de certificacion) independientemente de la metodologia.
- **Method Packs**: definen la ceremonia. Cuantos roles participan, que gates ceremoniales se comprimen, como se itera. El Pack Scrum es el unico implementado; otros (Kanban, Waterfall, Shape Up) son provisiones arquitectonicas.

La calidad es del Kernel. La ceremonia es del Pack. Un Pack puede agregar mecanismos de calidad adicionales, pero nunca reducir el minimo que el Kernel impone.

## Siguiente lectura

Con la estructura base clara, continua con [Arquitectura](../architecture/) para conocer los 9 invariantes que rigen la construccion de Virgil.
