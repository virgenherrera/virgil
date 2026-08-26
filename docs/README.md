# Documentacion de Virgil (Dogma)

Este directorio contiene la documentacion normativa y versionada de Virgil: la proyeccion operativa del Principia hacia guias consumibles por desarrolladores y agentes.

El Principia (`principia/constitution.md`) es la fuente de verdad constitucional e inmutable. Todo lo que existe en `docs/` se **deriva** del Principia y esta sujeto a el. Si algo en esta documentacion contradice al Principia, el Principia gana.

## Orden de lectura recomendado

1. [Getting Started](getting-started/README.md) -- que es Virgil, actores, capas
2. [Ciclo de vida](lifecycle/README.md) -- maquina de estados, transiciones, recuperacion
3. [Ejecucion](execution/README.md) -- pipeline, contratos primero, estrategia Git
4. [Garantia de Calidad](quality/README.md) -- Echo System, R/G/R, testing matrix, gates
5. [Arquitectura](architecture/README.md) -- invariantes, principios, componentes
6. [Contexto y conocimiento](context-and-knowledge/README.md) -- RAG, ArtifactStore, codebaseMemory
7. [Referencia](reference/README.md) -- glosario, configurabilidad, mapa de trazabilidad
8. [Especificacion](specification/README.md) -- contratos wire-level, protocolos, modelo de estado
9. [Implementacion](implementation/README.md) -- decisiones tecnicas concretas, Go runtime, CI/CD

## Indice de secciones

| Directorio | Contenido |
|---|---|
| `getting-started/` | Introduccion a Virgil: que es, quien participa, como se estructura |
| `lifecycle/` | Ciclo de vida del proyecto, maquina de estados y transiciones |
| `execution/` | Pipeline de ejecucion, contratos primero, estrategia Git |
| `quality/` | Echo System, R/G/R, testing matrix, gates de certificacion |
| `architecture/` | Invariantes arquitectonicos y principios de construccion |
| `context-and-knowledge/` | RAG dual, codebaseMemory, ArtifactStore, flujo de contexto |
| `reference/` | Glosario, mapa de trazabilidad al Principia y referencia de configurabilidad |
| `specification/` | Contratos wire-level: protocolo de operaciones, modelo de estado, adapter repo-docs, contratos de skills |
| `implementation/` | Decisiones tecnicas concretas: Go runtime, Echo System instanciado, artefactos de build |

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
