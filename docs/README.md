# Documentacion de Virgil (Dogma)

Este directorio contiene la documentacion normativa y versionada de Virgil: la proyeccion operativa del Principia hacia guias consumibles por desarrolladores y agentes.

El Principia (`principia/constitution.md`) es la fuente de verdad constitucional e inmutable. Todo lo que existe en `docs/` se **deriva** del Principia y esta sujeto a el. Si algo en esta documentacion contradice al Principia, el Principia gana.

## Orden de lectura recomendado

1. [Que es Virgil](getting-started/que-es-virgil.md) -- identidad, limites y comunicacion
2. [Modos y roles](getting-started/modos-y-roles.md) -- actores del sistema y modos operativos
3. [Modelo de tres capas](getting-started/modelo-tres-capas.md) -- Principia, Dogma y Runtime

## Indice de secciones

| Directorio | Contenido |
|---|---|
| `getting-started/` | Introduccion a Virgil: que es, quien participa, como se estructura |
| `architecture/` | Invariantes arquitectonicos y principios de construccion |
| `lifecycle/` | Ciclo de vida del proyecto, maquina de estados y transiciones |
| `quality/` | Echo System, R/G/R, testing matrix, gates de certificacion |
| `execution/` | Pipeline de ejecucion, contratos primero, estrategia Git |
| `context-and-knowledge/` | RAG dual, codebaseMemory, ArtifactStore, flujo de contexto |
| `reference/` | Glosario, mapa de trazabilidad al Principia y referencia de configurabilidad |

## Relacion con el Principia

```text
principia/constitution.md   (inmutable, constitucional)
        |
        v
    docs/                    (normativo, versionado, derivado)
```

Cada documento en `docs/` incluye una referencia a la seccion del Principia de la cual se deriva. Ante cualquier ambiguedad, consulta la fuente original.

---

Siguiente: [Getting Started](./getting-started/README.md) →
