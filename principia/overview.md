# Virgil — Principio Fundador

Documento ancla. Todo lo que Virgil es, hace y por que lo hace.
Si algo contradice este documento, este documento gana.

## Indice

### En este documento
- [1. Que es Virgil](#1-que-es-virgil)
- [2. Como es (estructura)](#2-como-es-estructura)
- [3. Como actua](#3-como-actua)
- [4. Por que actua asi](#4-por-que-actua-asi)
- [5. Que partes lo componen](#5-que-partes-lo-componen)
- [6. Como interactuan las partes](#6-como-interactuan-las-partes)
- [Regla de auto-referencia](#regla-de-auto-referencia)

### Documentos del Principia
- [actors-and-modes.md](actors-and-modes.md) — Roles de agentes y modos operativos
- [governance-principles.md](governance-principles.md) — Principios de gobierno
- [role-architecture.md](role-architecture.md) — Arquitectura de responsabilidades
- [delegation-pdc.md](delegation-pdc.md) — Delegacion y contratos
- [fast-forward.md](fast-forward.md) — Modo acelerado de transiciones
- [binding-layer.md](binding-layer.md) — Capa de enlace operativo
- [circuit-breaker.md](circuit-breaker.md) — Mecanismos de interrupcion

---

## 1. Que es Virgil

Virgil es el knowledge/control plane de un proyecto. No es un
framework, no es un Scrum Master, no ejecuta codigo. Mantiene
identidad, trazabilidad, contexto y transiciones.

Virgil se apega al **Open Agentic Standard**: publica un `AGENTS.md`
en el proyecto consumidor como convención de discoverability, y se
comunica via **Model Context Protocol (MCP)** / JSON-RPC. Cualquier
agente compatible puede consumir Virgil sin acoplamiento a un
proveedor específico.

```mermaid
flowchart TD
    subgraph ES["Virgil ES"]
        KP["Knowledge Plane\nSabe que existe, quien lo posee,\nen que estado esta"]
        CP["Control Plane\nAplica contratos, valida gates,\nregistra transiciones"]
        GI["Guia Inyectada\nPublica AGENTS.md al proyecto\ncon reglas operativas para el agente"]
    end

    subgraph NO_ES["Virgil NO ES"]
        NF["Framework de ejecucion"]
        NI["Implementador de codigo"]
        NC["Cache de conversacion"]
    end

    KP --- CP --- GI
    ES -.-|"linea clara"| NO_ES

    style ES fill:#4a4,stroke:#333,color:#fff
    style NO_ES fill:#c44,stroke:#333,color:#fff
```

Virgil no adopta roles ceremoniales (no es Scrum Master). Pero SI inyecta
guia operativa al agente consumidor via AGENTS.md. Esa guia deberia
incluir:

- Patron orquestador-minion (como delegar trabajo a sub-agentes)
- Ownership y housekeeping de tokens (como gestionar contexto)
- Planning boundary y stop conditions (cuando detenerse)

> **GAP**: el AGENTS.md actual documenta wire protocol y operaciones,
> pero no el patron de orquestacion ni la gestion de tokens. Pendiente
> de definir en Principia y codificar en el template.

---

## 2. Como es (estructura)

Tres capas concentricas. Cada capa interna gobierna a las externas.

```mermaid
flowchart TD
    subgraph PRINCIPIA["Principia (inmutable)"]
        direction LR
        GOB["Gobierno\n6 principios"]
        ACT["Actores y Modos\n3 actores, 2 modos"]
        DEL["Delegacion + PDC\nContratos, checkpoints"]
        EXEC["Ejecucion + Calidad\nEcho, R/G/R, Fitness"]
    end

    subgraph DOGMA["Dogma (docs/ — normativo, versionado)"]
        direction LR
        ARCH["Arquitectura\n9 invariantes"]
        PROTO["Protocolo\nContratos, boundaries"]
        QUAL["Quality\nValidacion, gates"]
        SLICES["Slices\nEntrega incremental"]
    end

    subgraph RUNTIME["Runtime (binario Go)"]
        direction LR
        KERNEL["Kernel\nLedger, Tracer, Context"]
        ADAPTERS["Adapters\nHost, Store"]
        PACKS["Method Packs\nCeremonia, roles, gates"]
    end

    PRINCIPIA -->|"gobierna"| DOGMA
    DOGMA -->|"define contratos para"| RUNTIME

    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
    style DOGMA fill:#47a,stroke:#333,color:#fff
    style RUNTIME fill:#a74,stroke:#333,color:#fff
```

Con esta estructura inmutable como cimiento, Virgil se manifiesta a través de ciclos de vida predecibles: una máquina de estados que rige proyectos y un flujo de invocación que garantiza trazabilidad en cada transición.

---

## 3. Como actua

### 3a. Ciclo de vida de un proyecto

Cada fase itera hasta consolidar su artefacto. No es una linea recta —
es un loop que converge hacia un handoff bien acotado.

```mermaid
stateDiagram-v2
    [*] --> Idea

    state PLANNING {
        Idea --> Requirements : consolidada
        Requirements --> Design : completos
        Design --> Tasks : aprobado
        Tasks --> Handoff : refinadas

        Idea --> Idea : cuestionar, refinar
        Requirements --> Requirements : iterar con MIM
        Requirements --> Idea : gap detectado
        Design --> Requirements : gap detectado
        Tasks --> Design : gap detectado
    }

    Handoff --> Execution : handoff aprobado

    state EXECUTION {
        Execution --> Verify : codigo certificado
    }

    Verify --> Deliver
    Deliver --> Operation : si aplica

    note right of PLANNING : Virgil DIRIGE<br/>cada fase itera<br/>hasta convergencia
    note right of Execution : Virgil OBSERVA<br/>emite PlanningGapDetected<br/>si hay vacios
    note right of Operation : Virgil ASISTE<br/>reactivo, opcional
```

La maquina de estados del proyecto (via virgil_status) indica en que
fase esta cada feature y el proyecto en general. Un feature no avanza
hasta que su artefacto esta consolidado.

### 3b. Flujo de una invocacion

```mermaid
sequenceDiagram
    participant ACT as Actor
    participant HA as HostAdapter
    participant VK as Virgil Kernel
    participant SA as ArtifactStore

    ACT->>HA: solicitud
    HA->>VK: resolver DogmaRef + ProjectRef + RunContext

    activate VK
    VK->>VK: validar source != target
    VK->>VK: compilar ContextBrief
    VK->>VK: ejecutar operacion canonica
    VK->>SA: persistir artefacto
    SA-->>VK: confirmacion
    VK->>VK: ingerir evidencia
    VK->>VK: registrar transicion en Ledger
    deactivate VK

    VK-->>HA: resultado + estado
    HA-->>ACT: respuesta
```

Este flujo canonico es determinista por diseño. Detras de cada paso hay un principio deliberado que descubrimos a continuación.

---

## 4. Por que actua asi

Dos capas de principios complementarias. No se mezclan.

### 4a. Gobierno — COMO se gobierna

```mermaid
flowchart TD
    G1["1. Metodologia e2e"]
    G2["2. Trazabilidad + fortaleza"]
    G3["3. Gestion nivel superior"]
    G4["4. Constraint > confianza"]
    G5["5. Handoff paralelo"]
    G6["6. Gates deterministicos"]

    G1 --- G2 --- G3
    G4 --- G5 --- G6

    style G1 fill:#47a,stroke:#333,color:#fff
    style G2 fill:#47a,stroke:#333,color:#fff
    style G3 fill:#47a,stroke:#333,color:#fff
    style G4 fill:#47a,stroke:#333,color:#fff
    style G5 fill:#47a,stroke:#333,color:#fff
    style G6 fill:#47a,stroke:#333,color:#fff
```

| # | Principio | En una frase |
|---|-----------|-------------|
| 1 | Metodologia e2e | Idea → codigo certificado → operacion. Sin saltos. |
| 2 | Trazabilidad + fortaleza | No basta que el enlace exista; debe ser fuerte. |
| 3 | Gestion nivel superior | Dashboard de salud, no revision linea a linea. |
| 4 | Constraint > confianza | Hooks y gates, no promesas del agente. |
| 5 | Handoff paralelo | Claiming sobre un handoff, no handoffs separados. |
| 6 | Gates deterministicos | Binario: pasa o no pasa. Sin aprobacion subjetiva. |

### 4b. Arquitectura — COMO se construye

```mermaid
flowchart TD
    A1["1. Identidad antes\nque inferencia"]
    A2["2. Autoridad separada\nde retrieval"]
    A3["3. Contexto compilado\npor contrato"]
    A4["4. Trazabilidad e2e"]
    A5["5. Planning !=\nexecution"]
    A6["6. Host y Store son\nadapters distintos"]
    A7["7. Entrega\nincremental"]
    A8["8. Control plane separado\nde ceremonia"]
    A9["9. Dogma separado\nde RAG operativo"]

    A1 --- A2 --- A3
    A4 --- A5 --- A6
    A7 --- A8 --- A9

    style A1 fill:#a74,stroke:#333,color:#fff
    style A2 fill:#a74,stroke:#333,color:#fff
    style A3 fill:#a74,stroke:#333,color:#fff
    style A4 fill:#a74,stroke:#333,color:#fff
    style A5 fill:#a74,stroke:#333,color:#fff
    style A6 fill:#a74,stroke:#333,color:#fff
    style A7 fill:#a74,stroke:#333,color:#fff
    style A8 fill:#a74,stroke:#333,color:#fff
    style A9 fill:#a74,stroke:#333,color:#fff
```

### 4c. Como se relacionan las dos capas

```mermaid
flowchart TD
    GOB["Gobierno\n6 principios\ndefine las REGLAS DEL JUEGO"]
    ARQ["Arquitectura\n9 invariantes\ndefine las REGLAS DE CONSTRUCCION"]

    GOB --> PRINCIPIA["Principia"]
    ARQ --> PRINCIPIA
    PRINCIPIA --> MD["Modo Desarrollo"]
    PRINCIPIA --> MC["Modo Consumo"]

    style GOB fill:#47a,stroke:#333,color:#fff
    style ARQ fill:#a74,stroke:#333,color:#fff
    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
```

Ambas capas de principios confluyen en el Principia. Lo que falta es conocer sus componentes: qué piezas implementan estas reglas.

---

## 5. Que partes lo componen

```mermaid
flowchart TD
    subgraph KERNEL["Kernel (metodologia-agnostico)"]
        LEDGER["Ledger\nEventos, transiciones,\nhistorial inmutable"]
        TRACER["TraceabilityGraph\nIntencion → decision →\ntrabajo → evidencia"]
        REPO["ArtifactRepository\nArtefactos, revisiones,\nprocedencia"]
        EVIDENCE["EvidenceIngestion\nTests, commits, builds,\ndecisiones humanas"]
        CONTEXT["ContextCompiler\nSelecciona artefactos →\nContextBrief"]
        RAG["RetrievalProjection\nBusqueda lexico/vectorial\n(no es autoridad)"]
    end

    subgraph ADAPTERS["Adapters (intercambiables)"]
        HA["HostAdapter\nDiscovery, invocacion,\ncapabilities del host"]
        ASA["ArtifactStoreAdapter\nPersistencia, retrieval\n(repo-docs | Jira | etc.)"]
    end

    subgraph PACKS["Method Packs (enchufables)"]
        SCRUM["Scrum\n(predeterminado)\nIMPLEMENTADO"]
        TBD["Waterfall | Kanban | Shape Up\nTBD — no implementados"]
        CUSTOM["Custom Pack\nel consumidor podria definir\nsu propia metodologia"]
    end

    KERNEL --> HA & ASA
    PACKS -->|"ceremonia, roles, gates"| KERNEL

    style KERNEL fill:#47a,stroke:#333,color:#fff
    style ADAPTERS fill:#a74,stroke:#333,color:#fff
    style PACKS fill:#7a4,stroke:#333,color:#fff
    style SCRUM fill:#4a4,stroke:#333,color:#fff
    style TBD fill:#777,stroke:#333,color:#fff
    style CUSTOM fill:#777,stroke:#333,color:#fff
```

Cada componente tiene una responsabilidad clara. Su verdadera potencia emerge en cómo colaboran bajo restricciones.

---

## 6. Como interactuan las partes

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

---

## Regla de auto-referencia

Este Principia gobierna AMBOS modos con la misma autoridad:

```mermaid
flowchart TD
    P["Principia\n(este documento)"]

    P --> MD["Modo Desarrollo\nVirgil es el OBJETO\nDesarrollador trabaja\nSOBRE Virgil"]
    P --> MC["Modo Consumo\nVirgil es la HERRAMIENTA\nImplementador trabaja\nCON Virgil"]

    MD --> MISMOS["Mismos principios\nMismos contratos\nMismas gates\nDiferente direccion\nde agencia"]
    MC --> MISMOS

    style P fill:#2b5,stroke:#333,color:#fff
    style MISMOS fill:#47a,stroke:#333,color:#fff
```

---

## Nota de autoridad

Este documento es inmutable una vez consolidado.

**Fuente de verdad**: `principia/overview.md`

Este Principia gobierna con igual fuerza el **Modo Desarrollo** (donde Virgil es el objeto sobre el cual se trabaja) y el **Modo Consumo** (donde Virgil es la herramienta con la cual se trabaja). Ambos modos heredan los mismos principios de gobierno, arquitectura, contratos y gates.
