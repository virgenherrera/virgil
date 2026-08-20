<!-- Virgil Principia
section_id: "6"
title: "Como interactuan las partes"
source: "principia/overview.md"
source_lines: [462, 534]
layer: interaction
constitutional: true
actors: [Desarrollador, Implementador]
glossary_terms: [Modo Desarrollo, Modo Consumo, Principia, Method Pack, HostAdapter, ArtifactStoreAdapter, global ownership, global context injection]
depends_on: ["5"]
referenced_by: ["7"]
keywords:
  - actores y modos
  - Modo Desarrollo
  - Modo Consumo
  - separacion de concerns
  - Method Pack
  - HostAdapter
  - ArtifactStoreAdapter
  - global ownership
  - global context injection
  - invariante fundamental
  - MCP JSON-RPC
-->

> **Context:** Method Pack, HostAdapter y ArtifactStoreAdapter son los componentes descritos en la seccion 5 (catalogo de partes); aqui se muestra como esos componentes y los dos modos operativos de Virgil interactuan entre si sin mezclar responsabilidades.

**En este chunk:**
- [6a. Actores y modos](#6a-actores-y-modos)
- [6b. Separacion de concerns](#6b-separacion-de-concerns)
- [6c. Invariante fundamental](#6c-invariante-fundamental)

## 6. Como interactuan las partes

[↑ Volver al indice](../README.md)

### 6a. Actores y modos

```mermaid
flowchart TD
    subgraph DESARROLLO["Modo Desarrollo"]
        DEV["Desarrollador\n(Humano + Agente)"]
        DEV -->|"modifica codigo,\ntests, dogma"| V_OBJ["Virgil\n(OBJETO)"]
    end

    subgraph CONSUMO["Modo Consumo"]
        IMPL["Implementador\n(Agente externo)"]
        IMPL -->|"usa via MCP\nJSON-RPC"| V_TOOL["Virgil\n(HERRAMIENTA)"]
    end

    V_OBJ -.-|"mismo binario\nmismos contratos\nmismas gates"| V_TOOL

    PRINCIPIA["Principia\n(inmutable)"]
    PRINCIPIA -->|"gobierna"| DESARROLLO
    PRINCIPIA -->|"gobierna"| CONSUMO

    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
    style DESARROLLO fill:#47a,stroke:#333,color:#fff
    style CONSUMO fill:#a74,stroke:#333,color:#fff
```

### 6b. Separacion de concerns

Cada pieza tiene un ownership claro. No se mezclan.

```mermaid
flowchart TD
    PACK["Method Pack\nCeremonia | Roles | Routing | Gates"]
    PACK -->|"inyecta politica"| VIRGIL

    VIRGIL["Virgil Kernel\nIdentidad | Trazabilidad | Contexto | Transiciones"]
    VIRGIL -->|"invoca via"| HOST
    VIRGIL -->|"persiste via"| STORE

    HOST["HostAdapter\nDiscovery | Invocacion | Capabilities"]
    STORE["ArtifactStoreAdapter\nPersistencia | Retrieval | Write Policy"]

    HOST ~~~ STORE
    NOTE["Host y Store son concerns INDEPENDIENTES\nun mismo host puede usar stores distintos\nun mismo store puede servir hosts diferentes"]

    style PACK fill:#7a4,stroke:#333,color:#fff
    style VIRGIL fill:#47a,stroke:#333,color:#fff
    style HOST fill:#a74,stroke:#333,color:#fff
    style STORE fill:#a74,stroke:#333,color:#fff
    style NOTE fill:none,stroke:none
```

### 6c. Invariante fundamental

```mermaid
flowchart TD
    OWNERSHIP["global ownership\n(Virgil conoce TODO\nel inventario)"]
    INJECTION["global context injection\n(Virgil entrega TODO\na cada actor)"]

    OWNERSHIP -->|"!="| INJECTION

    OWNERSHIP --> CORRECTO["CORRECTO:\nconocer que existe,\nquien lo posee,\nen que estado esta"]
    INJECTION --> INCORRECTO["INCORRECTO:\ncargar todo el contenido\nen cada prompt"]

    style CORRECTO fill:#4a4,stroke:#333,color:#fff
    style INCORRECTO fill:#c44,stroke:#333,color:#fff
```

Estas invariantes fundamentales — que Virgil conoce sin inflar contextos — se aplican de forma idéntica en ambos modos operativos, generando una propiedad notable: Virgil es tanto herramienta como objeto bajo las mismas reglas.
