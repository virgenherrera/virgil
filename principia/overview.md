# Virgil — Principio Fundador

Documento ancla. Todo lo que Virgil es, hace y por que lo hace.
Si algo contradice este documento, este documento gana.

## Indice

### En este documento
- [1. Que es Virgil](#1-que-es-virgil)
- [2. Como es (estructura)](#2-como-es-estructura)
- [3. Como actua](#3-como-actua)
  - [3a. Ciclo de vida de un proyecto](#3a-ciclo-de-vida-de-un-proyecto)
  - [3b. Flujo de una invocacion](#3b-flujo-de-una-invocacion)
- [4. Por que actua asi](#4-por-que-actua-asi)
  - [4a. Gobierno — COMO se gobierna](#4a-gobierno--como-se-gobierna)
  - [4b. Arquitectura — COMO se construye](#4b-arquitectura--como-se-construye)
  - [4c. Como se relacionan las dos capas](#4c-como-se-relacionan-las-dos-capas)
- [5. Que partes lo componen](#5-que-partes-lo-componen)
- [6. Como interactuan las partes](#6-como-interactuan-las-partes)
  - [6a. Actores y modos](#6a-actores-y-modos)
  - [6b. Separacion de concerns](#6b-separacion-de-concerns)
  - [6c. Invariante fundamental](#6c-invariante-fundamental)
- [7. Como garantiza calidad](#7-como-garantiza-calidad)
  - [7a. Echo System — pipeline determinista](#7a-echo-system--pipeline-determinista)
  - [7b. Deliverables vs Build Artifacts](#7b-deliverables-vs-build-artifacts)
  - [7c. Macro Red/Green/Refactor — TDD por lotes](#7c-macro-redgreenrefactor--tdd-por-lotes)
  - [7d. Testing Matrix — modelo de boundaries](#7d-testing-matrix--modelo-de-boundaries)
  - [7e. QA / Acceptance Gates — certificacion](#7e-qa--acceptance-gates--certificacion)
  - [7f. droppableCode — cobertura como herramienta](#7f-droppablecode--cobertura-como-herramienta)
  - [7g. complianceByDesign — compliance como efecto secundario](#7g-compliancebydesign--compliance-como-efecto-secundario)
  - [7h. Supply Chain Integrity — dependencias seguras](#7h-supply-chain-integrity--dependencias-seguras)
  - [Ciclo cerrado](#ciclo-cerrado)
- [8. Donde vive el conocimiento](#8-donde-vive-el-conocimiento)
  - [8a. ArtifactStore — persistencia](#8a-artifactstore--persistencia)
  - [8b. Separacion de namespaces](#8b-separacion-de-namespaces)
  - [8c. RAG dual — DBMS de contexto](#8c-rag-dual--dbms-de-contexto)
  - [8d. Visibilidad escalonada](#8d-visibilidad-escalonada)
  - [8e. Memoizacion](#8e-memoizacion)
  - [8f. codebaseMemory — grafo estructural del codigo](#8f-codebasememory--grafo-estructural-del-codigo)
- [9. Como fluye el contexto](#9-como-fluye-el-contexto)
  - [9a. ContextBrief](#9a-contextbrief)
  - [9b. Dos patrones de entrega](#9b-dos-patrones-de-entrega)
  - [9c. Delegacion: SM → sub-agente → PDC](#9c-delegacion-sm--sub-agente--pdc)
- [10. Como se recupera](#10-como-se-recupera)
- [11. Como se ejecuta](#11-como-se-ejecuta)
  - [11a. Pipeline de ejecucion](#11a-pipeline-de-ejecucion)
  - [11b. Contratos primero — habilitador de paralelismo](#11b-contratos-primero--habilitador-de-paralelismo)
  - [11c. Git strategy — worktrees y branches](#11c-git-strategy--worktrees-y-branches)
  - [11d. Verificacion mecanica — review humano condicional](#11d-verificacion-mecanica--review-humano-condicional)
  - [11e. Accept/Reject — certificacion por gates](#11e-acceptreject--certificacion-por-gates)
  - [11f. Evidencia como dato queryable](#11f-evidencia-como-dato-queryable)
- [12. Como opera (opcional)](#12-como-opera-opcional)
  - [12a. Activacion y rol](#12a-activacion-y-rol)
  - [12b. Adapters de operacion](#12b-adapters-de-operacion)
  - [12c. Escalacion](#12c-escalacion)
- [Regla de auto-referencia](#regla-de-auto-referencia)
- [Glosario](#glosario)
- [Nota de autoridad](#nota-de-autoridad)

### Documentos del Principia
- [actors-and-modes.md](actors-and-modes.md) — Roles de agentes y modos operativos
- [governance-principles.md](governance-principles.md) — Principios de gobierno
- [role-architecture.md](role-architecture.md) — Arquitectura de responsabilidades
- [delegation-pdc.md](delegation-pdc.md) — Delegacion y contratos
- [fast-forward.md](fast-forward.md) — Modo acelerado de transiciones
- [binding-layer.md](binding-layer.md) — Capa de enlace operativo
- [circuit-breaker.md](circuit-breaker.md) — Mecanismos de interrupcion

---

### Vocabulario de actores

| Actor | Que es | Cuando actua |
|-------|--------|-------------|
| MIM | Humano con autoridad final de decision | Siempre — aprueba, rechaza, desempata |
| Desarrollador | Humano + agente trabajando SOBRE Virgil | Modo Desarrollo |
| Implementador | Agente externo trabajando CON Virgil | Modo Consumo |
| Virgil | El binario — knowledge/control plane | Ambos modos |
| SM | SM (Session Manager) — Agente orquestador. El Method Pack inyecta este rol: en el Pack Scrum cumple funciones de Scrum Master; en otros Packs cumple el rol de orquestacion equivalente definido por ese Pack. Virgil (el binario) no ES el SM — el SM es un rol que opera DENTRO de Virgil. | Ejecucion — delega, verifica, decide |
| TPM | Funcion de tracking de deliverables | Ejecucion — persiste estado, reporta |
| PDC | Post-Delegation Checkpoint (ECHO → VERIFY → MARK → DECIDE) | Despues de cada delegacion del SM |

```mermaid
flowchart TD
    MIM["MIM\n(humano)\nautoridad final"]
    MIM -->|"dirige"| SM["SM\n(agente orquestador)"]
    SM -->|"delega via\ndelegationContract"| SUB["Sub-agentes"]
    SM -->|"ejecuta"| PDC["PDC\n(checkpoint\npost-delegacion)"]
    SM -->|"registra en"| TPM["TPM\n(tracking)"]

    subgraph MODOS["Modos operativos"]
        DEV["Desarrollador\ntrabaja SOBRE Virgil"]
        IMPL["Implementador\ntrabaja CON Virgil"]
    end

    MIM ---|"es el"| DEV
    MIM ---|"dirige al"| IMPL

    style MIM fill:#4a4,stroke:#333,color:#fff
    style SM fill:#47a,stroke:#333,color:#fff
    style PDC fill:#a74,stroke:#333,color:#fff
```

Detalle completo en [actors-and-modes.md](actors-and-modes.md) y
[delegation-pdc.md](delegation-pdc.md).

> **Delegacion de aprobaciones MIM.** En equipos donde el MIM es tambien el unico desarrollador, los puntos de aprobacion MIM (excepciones de cobertura, declaracion de perfil de compliance del proyecto, break-glass) pueden consolidarse mediante autorizacion permanente documentada: el MIM emite una politica de proyecto que pre-autoriza categorias especificas, reduciendo la friccion sin eliminar la trazabilidad. Nota: lo delegable es la DECLARACION del perfil regulatorio del proyecto, no la activacion del gate de review humano — esa activacion es automatica e incondicional una vez declarado el perfil (ver seccion 7g).

## 1. Que es Virgil

[↑ Volver al indice](#indice)

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

> **Pendiente de definicion**: el AGENTS.md actual documenta wire protocol y operaciones. El patron de orquestacion y la gestion de tokens se especificaran en el Method Pack correspondiente, no en este documento ancla. Este item queda fuera del alcance del Principia.

> **Alcance de este documento.** El Principia es el dogma fundacional: filosofia, arquitectura e invariantes. NO es un documento de go-to-market, guia de adopcion ni manual de usuario. El perfil de consumidor objetivo (ICP), la estrategia de MVP, el posicionamiento competitivo y las guias de onboarding son deliverables separados que se derivan DEL Principia pero no forman parte de el. El Kernel + el Method Pack Scrum (el unico implementado) constituyen el slice minimo viable; los demas Method Packs, codebaseMemory y extensiones son provisiones arquitectonicas, no requisitos de v1.

---

## 2. Como es (estructura)

[↑ Volver al indice](#indice)

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

[↑ Volver al indice](#indice)

### 3a. Ciclo de vida de un proyecto

Cada fase itera hasta consolidar su deliverable. No es una linea recta —
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

    note right of PLANNING : Virgil IMPONE convergencia<br/>mecanica via maquina de estados.<br/>SM ORQUESTA delegaciones.<br/>MIM DIRIGE decisiones de producto.
    note right of Execution : Virgil OBSERVA<br/>emite PlanningGapDetected<br/>si hay vacios
    note right of Operation : Virgil ASISTE<br/>reactivo, opcional
```

La maquina de estados del proyecto (via virgil_status) indica en que
fase esta cada feature y el proyecto en general. Un feature no avanza
hasta que su deliverable esta consolidado.

**PlanningGapDetected**: si execution descubre que un deliverable aprobado
es ambiguo, contradictorio o insuficiente, emite esta senal, bloquea
solo el scope afectado y devuelve el control a planning. Execution
nunca reescribe un deliverable aprobado.

**FastForward**: el SM no siempre ejecuta todas las fases con la misma
ceremonia. Evalua un gradiente de certeza (FF-1 a FF-4) sobre el contexto
existente y comprime las fases proporcionalmente — desde ceremonia
completa (score 0-2) hasta ejecucion directa (score 6-8). El SM computa el score sobre estado observable y verificable. La formula de scoring esta publicada en `fast-forward.md` y los inputs + resultado se registran en el Ledger, haciendolo auditable. FastForward comprime CEREMONIA de planning (fases de deliberacion), no gates de calidad del Kernel — los gates de certificacion (R/G/R, mutation testing, fitness functions) se ejecutan integros en TODOS los niveles de FastForward, desde FF-1 hasta FF-4. Detalle en [fast-forward.md](fast-forward.md).

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
    VK->>SA: persistir deliverable
    SA-->>VK: confirmacion
    VK->>VK: ingerir evidencia
    VK->>VK: registrar transicion en Ledger
    deactivate VK

    VK-->>HA: resultado + estado
    HA-->>ACT: respuesta
```

Este flujo canonico tiene pasos deterministas y pasos mediados por juicio. Las gates de certificacion (test pass/fail, mutation score, CRAP, coverage, CVE scan) son deterministas — binarias, sin subjetividad. Los pasos de planning, escalacion, compilacion de ContextBrief y verificacion de coherencia (PDC) involucran juicio del agente orquestador y no son deterministas. El Principia distingue ambos tipos explicitamente.

El PDC es un safeguard de coherencia de orquestacion que opera durante la ejecucion, pero NO es un gate de certificacion. La certificacion la determinan exclusivamente las gates mecanicas (seccion 7e, 11d). El PDC puede detener una delegacion incoherente, pero no certifica ni aprueba codigo.

> **Atomicidad**: el flujo muestra pasos secuenciales (persistir →
> ingerir evidencia → registrar transicion). Si el proceso falla entre
> pasos, el mecanismo de recovery (seccion 10) reconcilia el estado
> derivando la fase actual desde los deliverables existentes, no desde
> un puntero almacenado. El Ledger implementa idempotencia: registrar
> una transicion ya registrada es un no-op.

Detras de cada paso hay un principio deliberado que descubrimos a continuación.

---

## 4. Por que actua asi

[↑ Volver al indice](#indice)

Dos capas de principios complementarias. No se mezclan.

### 4a. Gobierno — COMO se gobierna

```mermaid
flowchart TD
    GP1["GP-1. Metodologia e2e"]
    GP2["GP-2. Trazabilidad + fortaleza"]
    GP3["GP-3. Gestion nivel superior"]
    GP4["GP-4. Constraint > confianza"]
    GP5["GP-5. Handoff paralelo"]
    GP6["GP-6. Gates deterministicos"]

    GP1 --- GP2 --- GP3
    GP4 --- GP5 --- GP6

    style GP1 fill:#47a,stroke:#333,color:#fff
    style GP2 fill:#47a,stroke:#333,color:#fff
    style GP3 fill:#47a,stroke:#333,color:#fff
    style GP4 fill:#47a,stroke:#333,color:#fff
    style GP5 fill:#47a,stroke:#333,color:#fff
    style GP6 fill:#47a,stroke:#333,color:#fff
```

| # | Principio | En una frase |
|---|-----------|-------------|
| 1 | Metodologia e2e | Idea → codigo certificado → operacion. Sin saltos. |
| 2 | Trazabilidad + fortaleza | No basta que el enlace exista; debe ser fuerte. |
| 3 | Gestion nivel superior | Dashboard de salud, no revision linea a linea. |
| 4 | Constraint > confianza | Hooks y gates, no promesas del agente. |
| 5 | Handoff paralelo | Claiming sobre un handoff, no handoffs separados. |
| 6 | Gates de certificacion deterministicos | Binario en ejecucion: pasa o no pasa. Planning y escalacion involucran juicio. |

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

[↑ Volver al indice](#indice)

```mermaid
flowchart TD
    subgraph KERNEL["Kernel (ceremonia-agnostico, calidad universal)"]
        LEDGER["Ledger\nEventos, transiciones,\nhistorial inmutable"]
        TRACER["TraceabilityGraph\nIntencion → decision →\ntrabajo → evidencia\n(proyeccion derivada,\nreconstruible desde Ledger)"]
        REPO["ArtifactRepository\nDeliverables, revisiones,\nprocedencia"]
        EVIDENCE["EvidenceIngestion\nTests, commits, builds,\ndecisiones humanas"]
        CONTEXT["ContextCompiler\nSelecciona deliverables →\nContextBrief"]
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

Cada componente tiene una responsabilidad clara. El Kernel impone invariantes de calidad universales (Echo, testing, binding layer) independientemente de la metodologia. El Method Pack define la ceremonia: cuantos roles participan, que gates se comprimen, como se itera. La calidad es del Kernel; la ceremonia es del Pack.

Los Method Packs heredan los gates de calidad (Red/Green/Refactor, mutation testing, fitness functions) como invariantes universales no negociables. Un Pack puede definir mecanismos de calidad ADICIONALES pero no puede reducir el minimo del Kernel. "Ceremonia-agnostico" significa que el Pack elige la ceremonia (sprints, kanban boards, ciclos de Shape Up); "calidad universal" significa que el pipeline de verificacion R/G/R + fitness functions aplica sin excepcion, independientemente de la ceremonia elegida.

---

## 6. Como interactuan las partes

[↑ Volver al indice](#indice)

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

## 7. Como garantiza calidad

[↑ Volver al indice](#indice)

Siete mecanismos forman un ciclo de accountability anidado. Ninguno
funciona aislado.

### 7a. Echo System — pipeline determinista

Secuencia de 5 pasos que se ejecuta en TODO ambiente (dev, CI, CD).
Los pasos son siempre los mismos y en el mismo orden. Lo que varia
es el scope (dev prioriza feedback rapido, CI prioriza completitud).

```mermaid
flowchart LR
    S1["1. Setup\nDependencias,\naudit clean"]
    S2["2. Build\nFuente →\nejecutables"]
    S3["3. Static\nLinting,\nformatting"]
    S4["4. Dynamic\nTests app-level,\ncoverage"]
    S5["5. E2E\nSolucion completa,\ncero mocks"]

    S1 --> S2 --> S3 --> S4 --> S5

    style S1 fill:#47a,stroke:#333,color:#fff
    style S2 fill:#47a,stroke:#333,color:#fff
    style S3 fill:#47a,stroke:#333,color:#fff
    style S4 fill:#47a,stroke:#333,color:#fff
    style S5 fill:#47a,stroke:#333,color:#fff
```

| Ambiente | Scope | Trigger | Enforcement |
|----------|-------|---------|-------------|
| Dev | Selectivo, feedback rapido | git hooks | Pre-commit, pre-push |
| CI | Completo | Push, PR | Pipeline stages |
| CD | Confianza absoluta | Tag, merge a main | Deployment gates |

Los hooks de pre-commit ejecutan verificaciones ESTRUCTURALES de feedback rapido (lint, type-check, formato, analisis estatico). Los tests de integracion contra stack real (tier App/Servicio) se ejecutan en pre-push o en el pipeline de CI, no en pre-commit. "Feedback rapido" en el contexto de Dev se refiere a las verificaciones estructurales, no a la suite completa de integracion.

### 7b. Deliverables vs Build Artifacts

Dos tipos de outputs que no deben confundirse. Los documentos de
planning son **deliverables** (PMBOK/ISO 21500). Los outputs del build
pipeline son **build artifacts** (DevOps/CI-CD). Virgil gestiona
deliverables; el Echo System genera build artifacts.

```mermaid
flowchart TD
    subgraph DELIVERABLES["Deliverables (planning)"]
        PA["idea.md, spec.md,\ndesign.md, tasks.md,\nhandoff.md"]
        PA_WHERE["Viven en ArtifactStore\n(repo-docs o externo)"]
        PA_WHO["Gestionados por TPM"]
    end

    subgraph BUILDART["Build Artifacts"]
        BA["Binarios, coverage,\ndist/, contenedores,\nbundle analysis,\nOpenAPI JSON/YAML"]
        BA_WHERE["Carpeta gitignoreada\ndentro del repo"]
        BA_WHO["Generados por Echo\nefimeros, regenerables"]
    end

    PA --- PA_WHERE --- PA_WHO
    BA --- BA_WHERE --- BA_WHO

    DELIVERABLES -.-|"alimentan"| EXECUTION["Execution"]
    BUILDART -.-|"consumidos por"| QA["QA / Accept"]

    style DELIVERABLES fill:#47a,stroke:#333,color:#fff
    style BUILDART fill:#a74,stroke:#333,color:#fff
```

> **Nomenclatura**: el codigo de Virgil usa "Artifact" en entidades
> como ArtifactStore, ArtifactRepository y ArtifactStoreAdapter. Estas
> entidades gestionan **deliverables**, no build artifacts. La
> nomenclatura de codigo es historica; este Principia define la
> terminologia canonica.

### 7c. Macro Red/Green/Refactor — TDD por lotes

TDD a nivel de batch, no funcion por funcion. Primero TODA la suite de
tests, luego TODA la implementacion, luego TODO el refactoring.

```mermaid
stateDiagram-v2
    [*] --> Red

    state Red {
        [*] --> testPlan : escribir plan
        testPlan --> testContract : definir contratos
        testContract --> testImpl : implementar tests
        testImpl --> [*] : todos fallan
    }

    Red --> Green : suite completa, todos fallan

    state Green {
        [*] --> Implement : codigo para pasar tests
        Implement --> [*] : todos pasan
    }

    Green --> Refactor : todos pasan

    state Refactor {
        [*] --> Metrics : mutation, CRAP, complexity
        Metrics --> Cleanup : metricas OK
        Cleanup --> [*] : tests siguen pasando
    }

    Refactor --> Accept : metricas dentro de umbral
    Accept --> [*] : certificado

    Red --> Red : gap detectado
    Green --> Red : test faltante
    Refactor --> Red : regresion
```

El dogma actual define 5 gates dentro de este ciclo:
**R0** (handoff completo) → **R1** (red valida) → **G1** (green
production-safe) → **F1** (refactor seguro) → **V1** (verify
independiente).

#### compositeAgent — ejecucion paralela de R/G/R

Cuando la ejecucion se paraleliza en multiples lanes (worktrees),
cada lane recibe un compositeAgent: un sub-agente que asume multiples
personalidades secuencialmente dentro del mismo worktree, evitando
conflictos de filesystem.

```mermaid
sequenceDiagram
    participant ORCH as Orquestador
    participant TE as testEngineer
    participant IMPL as Implementor
    participant FF as fitnessFunction
    participant WT as Worktree

    ORCH->>WT: crear worktree (lane)

    Note over TE: Invocacion 1 (stateless)
    ORCH->>TE: spec + contratos
    TE->>WT: escribir tests
    TE-->>ORCH: deliverables Red

    Note over IMPL: Invocacion 2 (stateless)
    ORCH->>IMPL: deliverables Red
    IMPL->>WT: escribir codigo
    IMPL-->>ORCH: deliverables Green

    Note over FF: Invocacion 3 (stateless)
    ORCH->>FF: deliverables Green
    FF->>WT: verificacion mecanica + residualReview
    FF-->>ORCH: resultado del lane
```

| Fase | Invocacion | Responsabilidad |
|------|-----------|-----------------|
| Red | testEngineer (sesion independiente) | Escribir tests segun spec |
| Green | Implementor (sesion independiente) | Codigo que pase los tests |
| Refactor | fitnessFunction (sesion independiente) | Mutation, CRAP, complejidad + residualReview |

Un compositeAgent NO es un agente monolitico — es una SECUENCIA de
invocaciones independientes orquestadas bajo una etiqueta comun.
Cada fase tiene su propio contrato y criterio de salida.

**Invariante de independencia**: cada fase del compositeAgent (testEngineer, Implementor, fitnessFunction) se ejecuta como invocacion independiente del agente — nueva sesion, sin historial conversacional. El Kernel implementa este reset como constraint tecnico (invocacion stateless por fase), no como instruccion al agente. Cada fase recibe unicamente los deliverables y build artifacts producidos por la fase anterior, no la historia de razonamiento. Este mecanismo satisface el Principio GP-4 (constraint > confianza): la independencia es estructural, no una promesa de comportamiento.

### 7d. Testing Matrix — modelo de boundaries

El valor de un test depende de DONDE se ubica la frontera del mock,
no de la piramide clasica.

```mermaid
flowchart TD
    subgraph PROHIBIDO["PROHIBIDO"]
        FILE["File / Unit\nMocks internos\nvalor = 0"]
    end

    subgraph DERIVADO["DERIVADO (no se desarrolla)"]
        MODULE["Module / Integration\nSe filtra desde appTests"]
        SMOKE["Regression / Smoke\nSe deriva por tags"]
    end

    subgraph EXPLICITO["DESARROLLO EXPLICITO"]
        APP["App / Servicio\nStack real, sin mocks\nTier PRIMARIO\nCoverage alta obligatoria"]
        E2E["Solution / E2E\nMulti-servicio, cero mocks\nDeploys, tags, merges"]
    end

    subgraph CONDICIONAL["CONDICIONAL"]
        PERF["Performance / Load\nSolo si design.md\ndeclara SLAs"]
    end

    FILE -.->|"reemplazado por"| APP
    MODULE -.->|"derivado de"| APP
    SMOKE -.->|"derivado de"| APP & E2E

    style PROHIBIDO fill:#c44,stroke:#333,color:#fff
    style DERIVADO fill:#777,stroke:#333,color:#fff
    style EXPLICITO fill:#4a4,stroke:#333,color:#fff
    style CONDICIONAL fill:#a74,stroke:#333,color:#fff
```

El dogma actual de Virgil define ademas T0 (protocol/app replay),
T1 (agent-in-the-loop) y T2 (host-adapter conformance) como niveles
especificos para validar el propio Virgil.

#### Patron de trazabilidad: matriz → codigo

Durante Red, los casos de prueba se definen como una matriz con
nombres estaticos. El codigo de la prueba importa esos nombres. Esto
crea un enlace RAG-searchable desde la matriz documentada hasta la
implementacion del test.

```mermaid
flowchart LR
    MATRIX["Matriz de Pruebas\n(clase/struct con\nnombres estaticos)"]
    MATRIX -->|"import"| TEST["Codigo del Test\nusa el nombre\ncomo descripcion"]
    TEST -->|"ejecuta contra"| APP["App real\n(boundary App/E2E)"]

    RAG["RAG / Search"]
    RAG -.->|"encuentra"| MATRIX
    RAG -.->|"encuentra"| TEST

    style MATRIX fill:#47a,stroke:#333,color:#fff
    style TEST fill:#4a4,stroke:#333,color:#fff
    style RAG fill:#777,stroke:#333,color:#fff
```

El patron es agnostico de tecnologia: en TypeScript es una clase con
`static readonly`, en Go seria un `const` block o struct, en Rust un
`mod` con constantes. Lo que importa es que la matriz y el test
compartan un identificador rastreable.

#### Binding Layer — confianza del enlace

El enlace entre un test y el codigo que lo satisface no es binario
(existe/no existe). Tiene tres niveles de confianza que progresan
durante el ciclo R/G/R:

| Estado | Fase | Garantiza |
|--------|------|-----------|
| declared | Red | El test existe y referencia un AC |
| inferred | Green | Un hook detecto que codigo ejercita el test |
| verified | Refactor | Mutation testing confirmo fortaleza real |

Solo `verified` certifica fortaleza — los demas solo confirman
existencia. Detalle en [binding-layer.md](binding-layer.md).

### 7e. QA / Acceptance Gates — certificacion

La certificacion combina gates mecanicas deterministas (test pass/fail, mutation score, coverage, CRAP, CVE scan, tamano de modulo) y gates de verificacion estructurada (alineacion arquitectonica). Las gates mecanicas son binarias: pasan o no pasan. Las gates de verificacion estructurada (ARCH: implementacion alineada con design.md) utilizan comparacion semantica documentada y trazable, sujeta al mismo deslinde de la seccion 3b.

```mermaid
flowchart TD
    ECHO["Echo completo\n5 pasos green"] --> FUNC
    FUNC["Verificacion funcional\nCada AC tiene test\nque pasa"] --> CONTRACT
    CONTRACT["Verificacion de contratos\nAPIs, schemas, interfaces\nrespetan definiciones"] --> COV
    COV["Coverage gate\nSin regresion\nnuevo codigo cubierto"] --> METRICS
    METRICS["Metricas de calidad\nMutation score\nCRAP, complejidad\ndependencias"] --> SEC
    SEC["Seguridad\nScanners report\ncero criticos"] --> ARCH
    ARCH["Alineacion arquitectonica\n(verificacion estructurada)\nImplementacion = design.md"] --> CERT

    CERT["CERTIFICADO"]
    CERT -->|"aprobado"| DELIVER["Deliver"]
    CERT -->|"rechazado"| ESCALATE["Escalar a fase\ncorrespondiente"]

    style CERT fill:#4a4,stroke:#333,color:#fff
    style ESCALATE fill:#c44,stroke:#333,color:#fff
```

### 7f. droppableCode — cobertura como herramienta

Codigo con 0% de cobertura en appTests no tiene justificacion para
existir. La cobertura no es metrica de vanidad — es detector de
codigo muerto.

```mermaid
flowchart LR
    CODE["Codigo"] --> Q{{"Cubierto por\nappTests?"}}
    Q -->|"Si"| LIVE["Codigo vivo\nprotegido por tests"]
    Q -->|"No"| DROP["droppableCode\ncandidato a eliminar"]

    style LIVE fill:#4a4,stroke:#333,color:#fff
    style DROP fill:#c44,stroke:#333,color:#fff
```

El threshold de cobertura es obligatorio y **nunca se reduce** sin
autorizacion explicita del MIM. Se mide solo sobre archivos con
logica real (cobertura selectiva). Excepciones documentadas: codigo
defensivo para failure modes raros, paths de feature flags no activos,
boilerplate de adapters para interfaces externas aun no ejercitadas,
y codigo legado en proceso de migracion. Cada excepcion requiere un
tag explicito en el archivo y revision periodica.

El mismo mecanismo de excepcion aplica a mutation testing: el MIM puede autorizar excepciones documentadas para codigo donde mutation testing es computacionalmente prohibitivo (test suites de integracion pesada, codigo generado, adapters de terceros). Cada excepcion requiere tag explicito, justificacion y revision periodica. Los umbrales de mutation score siguen siendo no-relajables para el codigo no exceptuado.

### 7g. complianceByDesign — compliance como efecto secundario

Si cada test aserta la forma EXACTA del DTO (campos presentes, campos
ausentes, tipos), se obtiene verificacion de compliance sin suites
separadas.

```mermaid
flowchart TD
    STRICT["Aserciones estrictas\nforma completa del DTO"]
    ABUSE["abuseCases\ntesting adversarial"]
    STRUCT["Validacion estructural\nschemas, hashing,\nencryption, A11y"]

    STRICT & ABUSE & STRUCT --> COMPLIANCE["Compliance\ncomo efecto secundario"]

    COMPLIANCE --> HIPAA["HIPAA\n(capa de datos)"]
    COMPLIANCE --> PCI["PCI DSS\n(capa de datos)"]
    COMPLIANCE --> GDPR["GDPR\n(capa de datos)"]

    style COMPLIANCE fill:#4a4,stroke:#333,color:#fff
```

Alcance: cubre EXCLUSIVAMENTE la capa de controles tecnicos de datos
(minimizacion, control de acceso por campo, validacion de forma). NO
cubre controles organizacionales, fisicos, legales, procedimentales
ni segregacion de responsabilidades. Cuando el proyecto declara un perfil de compliance regulatoria (HIPAA, PCI DSS, GDPR), el Method Pack DEBE activar review humano obligatorio sobre logica de autorizacion y modelado de dominio como gate blocking. Esta activacion es automatica para perfiles regulados, no opt-in. Para proyectos sin perfil regulatorio, el review humano permanece opcional y no-blocking. El Principia define la capacidad tecnica; el perfil de compliance del proyecto determina si el review humano es requerido.

### 7h. Supply Chain Integrity — dependencias seguras

[↑ Volver al indice](#indice)

Las dependencias externas son superficie de ataque y fuente de tech debt. Virgil impone tres invariantes sobre la cadena de suministro, agnosticos de lenguaje y plataforma.

#### versionPinning — reproducibilidad absoluta

Todas las dependencias se declaran con version EXACTA (sin rangos, sin prefijos de compatibilidad). El gestor de dependencias y su version tambien se declaran de forma explicita en el proyecto.

| Invariante | Que significa | Por que |
|------------|--------------|---------|
| Version exacta | `1.2.3`, nunca `^1.2.3` ni `~1.2.3` | Elimina version drift entre ambientes. Lo que pasa en CI es lo que corre en produccion |
| Gestor de dependencias versionado | Version del gestor pinneada al proyecto | Garantiza paridad de resolucion de dependencias en todos los ambientes |
| Lock file como artefacto | El lock file se versiona y se respeta como fuente de verdad | Captura el arbol completo de dependencias transitivas |

El invariante aplica independientemente del ecosistema (npm/pnpm/yarn, Go modules, Cargo, pip/uv, Maven/Gradle, etc.). La implementacion concreta varia; el principio es universal: **cero ambiguedad en versiones**.

#### securityAudit — gate de dependencias

Antes de construir, se ejecuta un escaneo de vulnerabilidades sobre el arbol de dependencias. Esta verificacion es una gate BLOCKING del paso 1 (Setup) del Echo System (seccion 7a).

```mermaid
flowchart LR
    DEPS["Arbol de\ndependencias"] --> AUDIT["securityAudit\n(escaneo de\nvulnerabilidades)"]
    AUDIT -->|"0 vulnerabilidades\naltas/criticas"| BUILD["→ Build\n(Echo paso 2)"]
    AUDIT -->|"vulnerabilidades\ndetectadas"| BLOCK["BLOQUEADO\nResolver antes\nde continuar"]

    style BUILD fill:#4a4,stroke:#333,color:#fff
    style BLOCK fill:#c44,stroke:#333,color:#fff
```

| Ambiente | Comportamiento |
|----------|---------------|
| Dev | Pre-push hook — alerta, no bloquea |
| CI | Pipeline stage — gate blocking |
| CD | Deployment gate — bloqueo absoluto |

El umbral de severidad (high, critical, o ambos) lo define el Method Pack. El Kernel impone que el escaneo se ejecute; el Pack decide el umbral. La herramienta de escaneo es agnostica: cada ecosistema tiene su equivalente (`pnpm audit`, `go vuln check`, `cargo audit`, `pip-audit`, `mvn dependency-check`, etc.).

#### bumpDependencies — mitigacion controlada de tech debt

Las versiones exactas previenen drift pero acumulan tech debt si no se actualizan. El ciclo bumpDependencies resuelve esta tension con un proceso de tres pasos:

```mermaid
flowchart LR
    S1["1. Security Fix\nResolver\nvulnerabilidades\nconocidas"]
    S2["2. Update Check\nIdentificar y aplicar\nactualizaciones\ndisponibles"]
    S3["3. Security Fix\nRe-verificar\npost-actualizacion"]

    S1 --> S2 --> S3

    S3 -->|"clean"| ECHO["Echo completo\n(5 pasos)"]
    S3 -->|"vulnerabilidades"| ROLLBACK["Rollback +\ninvestigar"]

    style S1 fill:#47a,stroke:#333,color:#fff
    style S2 fill:#47a,stroke:#333,color:#fff
    style S3 fill:#47a,stroke:#333,color:#fff
    style ECHO fill:#4a4,stroke:#333,color:#fff
    style ROLLBACK fill:#c44,stroke:#333,color:#fff
```

1. **Security Fix**: resolver vulnerabilidades conocidas en las versiones actuales
2. **Update Check**: ejecutar un verificador de actualizaciones que identifique versiones nuevas de todas las dependencias, aplicando las actualizaciones con version exacta (sin introducir rangos)
3. **Security Fix**: re-ejecutar el escaneo de seguridad contra las versiones actualizadas — una actualizacion puede INTRODUCIR vulnerabilidades nuevas

Despues del ciclo completo, el Echo System se ejecuta integro (5 pasos). Si alguna gate falla, se revierte la actualizacion y se investiga la causa.

bumpDependencies no es un paso del Echo — es un proceso de mantenimiento que PRECEDE al Echo. Se ejecuta de forma explicita (no automatica), tipicamente en una cadencia definida por el equipo (semanal, por sprint, o pre-release). El MIM puede delegar la cadencia al Method Pack.

### Ciclo cerrado

Estos mecanismos forman un ciclo cerrado: el Echo ejecuta, los build
artifacts capturan outputs, Red/Green/Refactor estructura la ejecucion
(paralelizable via compositeAgent), la Testing Matrix define que vale
como prueba, droppableCode detecta codigo muerto, complianceByDesign
verifica cumplimiento, Supply Chain Integrity asegura dependencias
seguras y actualizadas, y QA certifica el resultado. Si QA rechaza, se
escala a la fase que corresponda.

---

## 8. Donde vive el conocimiento

[↑ Volver al indice](#indice)

Tres concerns separados: donde se PERSISTEN los deliverables
(ArtifactStore), como se CONSULTAN deliverables y documentacion (RAG),
y como se COMPRENDE la estructura del codigo (codebaseMemory). El RAG
actua como DBMS del contexto documental; el codebaseMemory actua como
grafo estructural del codigo. Ningun agente lee archivos directamente
— todo agente consulta la herramienta apropiada con queries acotadas.

### 8a. ArtifactStore — persistencia

```mermaid
flowchart TD
    VIRGIL["Virgil Kernel"]
    VIRGIL -->|"persiste via"| ASA["ArtifactStoreAdapter\n(contrato)"]

    ASA --> DEFAULT["repo-docs (default)\n{target}/docs/virgil/\nlocal, RAG-friendly,\nsin dependencias externas"]

    ASA --> EXT["Adapters externos (TBD)"]

    subgraph EXTERNOS["Opciones via contrato"]
        JIRA["Jira"]
        CONF["Confluence"]
        AZURE["Azure DevOps"]
        ASANA["Asana"]
        GH["GitHub Projects/Issues"]
        OTROS["Otros\n(via contrato de adapter)"]
    end

    EXT --> EXTERNOS

    style DEFAULT fill:#4a4,stroke:#333,color:#fff
    style EXT fill:#777,stroke:#333,color:#fff
    style EXTERNOS fill:#777,stroke:#333,color:#fff
```

### 8b. Separacion de namespaces

```mermaid
flowchart LR
    subgraph VIRGIL_DOCS["Virgil/docs/"]
        DOGMA["Dogma de Virgil\nread-only para consumidores\nnormativo y versionado"]
    end

    subgraph TARGET_DOCS["{target}/docs/"]
        MANAGED["{target}/docs/virgil/\nManaged namespace\nVIRGIL escribe aqui"]
        CORPUS["{target}/docs/**\nCorpus del proyecto\nread-only para Virgil\n(opt-in para RAG)"]
    end

    DOGMA -.-|"NO son lo mismo"| TARGET_DOCS
    MANAGED -.-|"write scope\ndelimitado"| CORPUS

    style DOGMA fill:#47a,stroke:#333,color:#fff
    style MANAGED fill:#4a4,stroke:#333,color:#fff
    style CORPUS fill:#777,stroke:#333,color:#fff
```

> **Invariante**: `Virgil/docs/` (dogma) y `{target}/docs/` (proyecto)
> comparten el nombre `docs` pero NO comparten identidad, ownership ni
> write policy.

### 8c. RAG dual — DBMS de contexto

Principio arquitectonico: **los agentes consultan en lugar de leer**.
La arquitectura favorece queries al RAG (deliverables, documentacion)
y al codebaseMemory (estructura del codigo, seccion 8f) sobre lectura
directa de archivos. Virgil inyecta esta guia via AGENTS.md, pero no
controla la ejecucion del agente — es un principio arquitectonico, no
un constraint enforceable por hook. Contextualizacion via queries, no
via prompts — ahorro directo de tokens.

```mermaid
flowchart TD
    subgraph EVITAR["EVITAR (anti-patron)"]
        A1["Agente lee archivo completo\n(miles de tokens en prompt)"]
    end

    subgraph PREFERIR["PREFERIR (patron recomendado)"]
        A2["Agente hace query al RAG\no codebaseMemory\n(tokens minimos, scope acotado)"]
    end

    EVITAR -.-|"reemplazado por"| PREFERIR

    style EVITAR fill:#c44,stroke:#333,color:#fff
    style PREFERIR fill:#4a4,stroke:#333,color:#fff
```

Virgil define dos instancias del mismo patron RAG-como-DBMS, una por
cada modo operativo.

```mermaid
flowchart TD
    subgraph DEVRAG["devRag — Modo Desarrollo"]
        DR_SRC["Fuentes:\n./principia/ (inmutable)\n./docs/ (normativo)"]
        DR_ST["Storage:\narchivos del proyecto Virgil"]
        DR_ROL["Rol: DBMS de CTX\npara desarrollar Virgil"]
    end

    subgraph CONSRAG["consumerRag — Modo Consumo"]
        CR_SRC["Fuentes:\nVirgil dogma +\nRAG propio del proyecto"]
        CR_ST["Storage default:\n{target}/docs/\noverride via adapter"]
        CR_ROL["Rol: DBMS de CTX\npara el proyecto consumidor"]
    end

    PRINCIPIA["Principia\n(inmutable)"] -->|"alimenta"| DEVRAG
    DEVRAG -->|"echo:\nmismo patron\ndiferente scope"| CONSRAG

    style DEVRAG fill:#47a,stroke:#333,color:#fff
    style CONSRAG fill:#a74,stroke:#333,color:#fff
    style PRINCIPIA fill:#2b5,stroke:#333,color:#fff
```

| Aspecto | devRag | consumerRag |
|---------|--------|-------------|
| Modo | Desarrollo | Consumo |
| Fuentes | `./principia/` + `./docs/` | Virgil dogma + RAG propio del proyecto |
| Storage | Archivos del proyecto Virgil | `{target}/docs/` (default) |
| Override | N/A (fuente fija) | Adapter interfaces: Jira, Confluence, Azure DevOps, Asana, WordPress, DBMS |
| Rol | DBMS de CTX para Virgil | DBMS de CTX para el proyecto consumidor |

El consumerRag define **interfaces** — el cliente las implementa con
el backend que necesite. Lo que se conecte, se conecta, mientras
cumpla con el contrato del adapter.

Para consultas hibridas (ejemplo: "que funciones implementan la decision de diseno X descrita en design.md"), el router ejecuta ambas queries en paralelo: Q_SEM al RAG para localizar la decision, Q_STR al codebaseMemory para las funciones. Los resultados se fusionan por el ContextCompiler con trazabilidad de origen.

### 8d. Visibilidad escalonada

El agente principal (orquestador) tiene visibilidad completa del RAG
si asi lo estima necesario. Los sub-agentes reciben un scope reducido:
solo lo necesario para su tarea.

```mermaid
flowchart TD
    RAG["RAG\n(devRag | consumerRag)"]

    RAG -->|"100% visibilidad\n(si lo estima necesario)"| ORCH["Orquestador\n(agente principal)\nve TODO el inventario"]

    RAG -->|"scope acotado"| SUB1["Sub-agente A\nve solo deliverables\nde su tarea"]
    RAG -->|"scope acotado"| SUB2["Sub-agente B\nve solo deliverables\nde su tarea"]

    ORCH -->|"define scope via\ndelegationContract"| SUB1 & SUB2

    style ORCH fill:#4a4,stroke:#333,color:#fff
    style SUB1 fill:#47a,stroke:#333,color:#fff
    style SUB2 fill:#47a,stroke:#333,color:#fff
    style RAG fill:#a74,stroke:#333,color:#fff
```

El scope del sub-agente se define en el `delegationContract` (seccion
9c). El orquestador decide que topic_keys o queries son visibles para
cada delegacion.

### 8e. Memoizacion

El RAG mantiene una capa de cache en memoria para acelerar queries
repetidas. Fallback a almacenamiento persistente cuando la cache se
invalida o la sesion se reinicia.

```mermaid
flowchart LR
    QUERY["Query"] --> CACHE{{"Cache\nen memoria?"}}
    CACHE -->|"hit"| RESULT["Resultado\n(inmediato)"]
    CACHE -->|"miss"| FALLBACK["Fallback\nalmacenamiento local\nestructurado\n(tech TBD)"]
    FALLBACK --> RESULT
    FALLBACK -->|"popular cache"| CACHE

    style CACHE fill:#4a4,stroke:#333,color:#fff
    style FALLBACK fill:#777,stroke:#333,color:#fff
```

El RAG no es la autoridad del proceso — el Ledger, el
ArtifactRepository y la evidencia son la fuente de verdad. El RAG y
el TraceabilityGraph son proyecciones derivadas, reconstruibles desde
el Ledger y los deliverables. Ninguna proyeccion es fuente de verdad;
si se desincroniza, se reconstruye desde las fuentes autoritativas.

### 8f. codebaseMemory — grafo estructural del codigo

El RAG opera sobre deliverables y documentacion — datos estructurados
que se indexan semanticamente. El codigo fuente es diferente: no se
puede (ni se debe) meterlo completo en un RAG. Para el codigo, Virgil
utiliza una herramienta complementaria: un grafo estructural
determinista que mapea relaciones sin embeddings.

```mermaid
flowchart TD
    subgraph ROUTING["Routing de consulta"]
        Q_SEM["Consulta semantica\n'que dice el spec sobre auth?'\n'cual es la decision de diseno?'"]
        Q_STR["Consulta estructural\n'quien llama a esta funcion?'\n'que se rompe si cambio X?'\n'que tests cubren este modulo?'"]
    end

    Q_SEM -->|"RAG"| RAG["devRag | consumerRag\n(deliverables, docs)"]
    Q_STR -->|"codebaseMemory"| CBM["Grafo AST\n(entidades, relaciones)"]

    style Q_SEM fill:#47a,stroke:#333,color:#fff
    style Q_STR fill:#4a4,stroke:#333,color:#fff
    style RAG fill:#47a,stroke:#333,color:#fff
    style CBM fill:#4a4,stroke:#333,color:#fff
```

#### Que indexa vs que excluye

El codebaseMemory indexa ESTRUCTURA, no contenido.

```mermaid
flowchart TD
    subgraph INDEXA["Indexa (liviano, determinista)"]
        ENT["Entidades\narchivos, modulos, clases,\nfunciones, interfaces, tipos,\ntests, rutas"]
        REL["Relaciones\ncalls, imports, herencia,\ncontiene, test-covers,\ndata-flow"]
        META["Metadata\nsignaturas, ubicacion,\nassociacion con commits"]
    end

    subgraph EXCLUYE["Excluye (mantiene liviano)"]
        EMB["Embeddings de\ncodigo fuente completo"]
        VEC["Chunks vectoriales\nlinea por linea"]
        AMB["Edges ambiguos\n(sin edge > edge dudoso)"]
    end

    INDEXA -.-|"linea clara"| EXCLUYE

    style INDEXA fill:#4a4,stroke:#333,color:#fff
    style EXCLUYE fill:#c44,stroke:#333,color:#fff
```

#### Construccion determinista

El grafo se construye por un parser AST determinista, no por inferencia
de un LLM. Esto garantiza: completitud (no se saltan archivos),
velocidad (segundos, no minutos), y cero alucinaciones en los edges.

```mermaid
flowchart LR
    SRC["Codigo fuente"] --> PARSE["Parser AST\n(determinista)"]
    PARSE --> GRAPH["Grafo de nodos\nentidades + relaciones"]
    GRAPH --> STORE["Almacenamiento local\nestructurado"]
    STORE --> QUERY["Queries\nestructurales"]

    CHANGES["Cambio en archivo"] -->|"watcher +\ncontent hash"| PARSE

    style PARSE fill:#47a,stroke:#333,color:#fff
    style GRAPH fill:#4a4,stroke:#333,color:#fff
    style STORE fill:#777,stroke:#333,color:#fff
```

La actualizacion es incremental: un file watcher detecta cambios,
compara hashes, y re-parsea solo los archivos modificados. No hay
rebuild completo en cada cambio.

#### Complemento del RAG, no reemplazo

```mermaid
flowchart TD
    VIRGIL["Virgil"]
    VIRGIL --> RAG["RAG\nDBMS de deliverables\n(semantico)"]
    VIRGIL --> CBM["codebaseMemory\nGrafo de codigo\n(estructural)"]

    RAG --> R_Q["'que dice el design\nsobre el modulo auth?'"]
    CBM --> C_Q["'que funciones dependen\nde AuthMiddleware?\nque tests las cubren?'"]

    RAG ~~~ CBM

    NOTE["Misma visibilidad escalonada:\norquestador ve todo el grafo,\nsub-agentes ven scope acotado\n(via delegationContract)"]

    style RAG fill:#47a,stroke:#333,color:#fff
    style CBM fill:#4a4,stroke:#333,color:#fff
    style NOTE fill:none,stroke:none
```

El codebaseMemory habilita la visualizacion on-demand del proyecto
como un grafo de nodos — sin cargar codigo fuente en el prompt, sin
quemar tokens, y con ownership total de la estructura. Es la
herramienta que permite a Virgil "ver" el codigo sin "leerlo".

En escenarios de lanes paralelos (seccion 11c), cada worktree mantiene su propia instancia del grafo. Los grafos divergentes se reconcilian al merge: el merge de codigo dispara reconstruccion incremental del grafo desde el AST del resultado del merge. No hay grafo compartido entre lanes divergentes.

Con el conocimiento organizado como DBMS documental (RAG), grafo
estructural (codebaseMemory) y visibilidad escalonada por rol, el
paso siguiente es entender como ese contexto fluye entre agentes
durante la ejecucion.

---

## 9. Como fluye el contexto

[↑ Volver al indice](#indice)

Regla fundamental: **nunca se pasa contexto crudo a un sub-agente**.
El contexto se entrega compilado (ContextBrief) o como referencia
(topic_key) para que el sub-agente lea del RAG.

### 9a. ContextBrief

El ContextCompiler selecciona deliverables, hechos y limites para
producir un ContextBrief acotado al objetivo del actor. La seleccion
queda trazable: que se incluyo, de donde salio, que se excluyo.

La compilacion del ContextBrief es un paso de juicio (seccion 3b) con superficie de alucinacion inherente: la seleccion/resumen puede omitir o distorsionar informacion. La trazabilidad (que se incluyo, de donde salio, que se excluyo) permite auditoria post-hoc, pero NO previene la omision en tiempo de compilacion. Este riesgo se mitiga con el PDC (coherence check post-delegacion) y con la reconstruccion del ContextBrief ante PlanningGapDetected.

### 9b. Dos patrones de entrega

```mermaid
flowchart TD
    NEED["Sub-agente necesita contexto"]
    NEED --> Q{{"Target conocido\ny deterministico?"}}

    Q -->|"Si"| PB["PatternB\nSM pasa topic_key\nsub-agente lee directo del RAG\nsignificativamente mas economico"]
    Q -->|"No"| PA["PatternA\nSM busca, cura, inyecta\ncalidad sobre costo"]

    style PB fill:#4a4,stroke:#333,color:#fff
    style PA fill:#47a,stroke:#333,color:#fff
```

| Patron | Cuando | Costo | Calidad |
|--------|--------|-------|---------|
| PatternB (default) | Target conocido, deterministico | Bajo (reutiliza ContextBrief compilado) | Buena |
| PatternA | Busqueda fuzzy, fan-out alto (8+) | Alto | Optima |

Ambos patrones operan sobre el RAG dual (seccion 8c): devRag en Modo
Desarrollo, consumerRag en Modo Consumo.

### 9c. Delegacion: SM → sub-agente → PDC

```mermaid
sequenceDiagram
    participant SM as SM
    participant SUB as Sub-agente
    participant TPM as TPM

    SM->>SUB: delegationContract<br/>(6 campos obligatorios)
    activate SUB
    SUB-->>SM: Output + Status Report
    deactivate SUB

    Note over SM: PDC obligatorio
    SM->>SM: ECHO - coherente?
    SM->>SM: VERIFY - completo?
    SM->>TPM: MARK - persistir
    SM->>SM: DECIDE - avanzar?
```

Sin Status Report en el output, el SM lo trata como FAILED.
Tres fallos consecutivos al mismo rol activan el circuitBreaker
(ver [circuit-breaker.md](circuit-breaker.md)).

Detalle completo en [delegation-pdc.md](delegation-pdc.md).

---

## 10. Como se recupera

[↑ Volver al indice](#indice)

Despues de un crash, compactacion o nueva sesion, el estado se
reconstruye — no se pierde.

```mermaid
sequenceDiagram
    participant SM as SM
    participant TPM as TPM
    participant STORE as ArtifactStore

    SM->>TPM: que deliverables existen?
    TPM->>STORE: scan estados
    STORE-->>TPM: lista + revisiones
    TPM-->>SM: deliverables + estados + historial de fallos

    SM->>SM: derivar fase actual
    SM->>SM: consultar historial<br/>(ajustar estrategia)
    SM->>SM: continuar desde<br/>fase derivada
```

- El SM deriva la fase por los deliverables existentes (no la almacena)
- El historial de fallos es per-deliverable y cross-session
- `lastVerifiedAt` evita re-verificacion innecesaria si el codigo
  no toco el scope del deliverable
- Cambios externos se clasifican: aditivos (registrar), contradictorios
  (decision del MIM), o de otro ciclo (registrar como contexto)

---

## 11. Como se ejecuta

[↑ Volver al indice](#indice)

Despues de que planning produce un handoff aprobado, la ejecucion
transforma ese handoff en codigo certificado. Virgil OBSERVA — no
dirige, no implementa. Emite PlanningGapDetected si detecta vacios.

### 11a. Pipeline de ejecucion

Cinco fases secuenciales. Cada fase tiene su gate de salida.

```mermaid
flowchart LR
    PRE["prePhase\nContratos:\nAPIs, schemas,\ninterfaces"]
    RED["Red\nToda la suite\nde tests\n(todos fallan)"]
    GREEN["Green\nCodigo que\npase tests\n(todos pasan)"]
    REFACTOR["Refactor\nVerificacion\nmecanica\n(metricas OK)"]
    ACCEPT["Accept\nCertificacion\ndeterminista\n(QA gate)"]

    PRE --> RED --> GREEN --> REFACTOR --> ACCEPT

    style PRE fill:#777,stroke:#333,color:#fff
    style RED fill:#c44,stroke:#333,color:#fff
    style GREEN fill:#4a4,stroke:#333,color:#fff
    style REFACTOR fill:#47a,stroke:#333,color:#fff
    style ACCEPT fill:#2b5,stroke:#333,color:#fff
```

| Fase | Que produce | Gate de salida |
|------|-------------|----------------|
| prePhase | Contratos (OpenAPI, schemas, interfaces) | Todos los contratos definidos |
| Red | Suite completa de tests | Todos fallan (red valido) |
| Green | Implementacion | Todos pasan |
| Refactor | Metricas dentro de umbral | Mutation, CRAP, complejidad OK |
| Accept | Certificacion | Gates mecanicas + verificacion estructurada (ver 7e) |

### 11b. Contratos primero — habilitador de paralelismo

La prePhase define contratos ANTES de implementar. Esto permite que
multiples lanes trabajen en paralelo contra la misma interfaz.

```mermaid
flowchart TD
    CONTRACTS["prePhase\nAPIs, schemas, interfaces\n(definidos y aprobados)"]

    CONTRACTS --> LANE1["Lane A\n(frontend)"]
    CONTRACTS --> LANE2["Lane B\n(backend)"]
    CONTRACTS --> LANE3["Lane C\n(infra)"]

    LANE1 & LANE2 & LANE3 -->|"merge"| INTEGRATION["Integration\n(tests cruzados)"]

    style CONTRACTS fill:#47a,stroke:#333,color:#fff
    style INTEGRATION fill:#4a4,stroke:#333,color:#fff
```

### 11c. Git strategy — worktrees y branches

```mermaid
flowchart TD
    MAIN["main\n(estable, produccion)"]
    DEV["develop\n(integracion)"]
    ITER["exec/iter-N\n(iteracion)"]

    subgraph LANES["Lanes paralelos (worktrees)"]
        L1["exec/iter-N/lane-auth"]
        L2["exec/iter-N/lane-api"]
        L3["exec/iter-N/lane-ui"]
    end

    L1 & L2 & L3 -->|"--no-ff"| ITER
    ITER -->|"--no-ff"| DEV
    DEV -->|"merge o squash\n(MIM decide)"| MAIN

    style MAIN fill:#4a4,stroke:#333,color:#fff
    style ITER fill:#47a,stroke:#333,color:#fff
    style LANES fill:#a74,stroke:#333,color:#fff
```

Cada lane se ejecuta en un worktree aislado. Un compositeAgent
(seccion 7c) opera dentro de cada worktree, cambiando de personalidad
por fase (testEngineer → Implementor → fitnessFunction).

Si una lane detecta violacion de contrato mid-flight, el SM emite PlanningGapDetected y detiene ESA lane. Las demas lanes en ejecucion que dependen del mismo contrato reciben notificacion de contrato invalidado y entran en estado de pausa pendiente de reconciliacion. Las lanes independientes (sin dependencia del contrato violado) continuan sin interrupcion.

| Fase | Prefijo de commit | Frecuencia |
|------|-------------------|------------|
| prePhase | `contract:` | 1 por tipo |
| Red | `test:` | 1 por test o grupo |
| Green | `feat:` | 1 por test que pasa |
| Refactor | `refactor:` | 1 por refactor atomico |

### 11d. Verificacion mecanica — review humano condicional

La fase Refactor utiliza verificacion mecanica basada en metricas como mecanismo primario de certificacion. Las gates mecanicas (seccion 7e) son el canal principal de calidad. Para proyectos con perfil de compliance regulatoria, el Method Pack activa adicionalmente review humano blocking sobre logica de autorizacion y modelado de dominio (ver seccion 7g). En ambos casos, la certificacion final requiere que TODAS las gates aplicables pasen — tanto las mecanicas como las de review humano cuando estan activas.

Las gates de certificacion combinan verificacion mecanica determinista (test pass/fail, mutation score, coverage, CRAP, CVE scan) y verificacion estructurada (alineacion arquitectonica — ver seccion 7e). El review humano, cuando esta activo por perfil de compliance, tambien forma parte de las gates aplicables. El PDC opera durante la ejecucion como safeguard de coherencia (seccion 3b), pero no forma parte del pipeline de certificacion — puede detener una delegacion incoherente, no certifica ni aprueba codigo.

```mermaid
flowchart TD
    subgraph MECANICO["Verificacion mecanica (obligatoria)"]
        MUT["Mutation testing\nfuerza real de tests"]
        CRAP["CRAP score\nriesgo de cambio"]
        CYCL["Complejidad ciclomatica\nfunciones simples"]
        SIZE["Tamano de modulo\nLOC acotado"]
        DEPS["Estructura de dependencias\ncero ciclos"]
        SEC["Seguridad\ncero CVEs criticos"]
    end

    subgraph RESIDUAL["Review AUTH/DDD (opcional por defecto; blocking con perfil de compliance — ver 7g)"]
        AUTH["Logica de autorizacion"]
        DDD["Modelado de dominio"]
    end

    MECANICO -->|"gate"| PASS{{"Pasa?"}}
    PASS -->|"Si"| ACCEPT["Accept"]
    PASS -->|"No"| BACK["Re-delegar a\nfase correspondiente"]

    style MECANICO fill:#47a,stroke:#333,color:#fff
    style RESIDUAL fill:#777,stroke:#333,color:#fff
    style PASS fill:#4a4,stroke:#333,color:#fff
    style BACK fill:#c44,stroke:#333,color:#fff
```

Los umbrales especificos (mutation score, CRAP maximo, complejidad)
los define el dogma por tier (strict, standard, relaxed). El
Principia define el principio: **mecanico, no subjetivo**.

### 11e. Accept/Reject — certificacion por gates

```mermaid
flowchart TD
    QA{{"QA: virgil health"}}

    QA -->|"pasa"| CERT["CERTIFICADO\ngit tag: qa/approved"]
    QA -->|"gap de implementacion"| GREEN["→ Green"]
    QA -->|"gap de testing"| RED["→ Red"]
    QA -->|"gap de contratos"| PRE["→ prePhase"]
    QA -->|"gap de planning"| PLANNING["→ Planning\n(PlanningGapDetected)"]

    style CERT fill:#4a4,stroke:#333,color:#fff
    style GREEN fill:#c44,stroke:#333,color:#fff
    style RED fill:#c44,stroke:#333,color:#fff
    style PRE fill:#c44,stroke:#333,color:#fff
    style PLANNING fill:#c44,stroke:#333,color:#fff
```

| Tipo de gap | Rechazo | Re-delegar a |
|-------------|---------|--------------|
| Codigo no satisface test | Implementacion incompleta | Green |
| Suite de tests incompleta | Tests faltantes | Red |
| Contrato violado | Interfaz rota | prePhase |
| Diseno no reflejado en codigo | Arquitectura divergente | Refactor |
| Feature faltante en planning | Deliverable insuficiente | Planning |

El rechazo es ESPECIFICO — identifica la fase exacta que debe
corregirse, no un generico "arreglar". Cada re-delegacion pasa por
el PDC completo (seccion 9c).

#### Lane de emergencia (break-glass)

Para incidentes P1 en produccion, existe un camino expedito que
comprime la ceremonia sin eliminarla:

```mermaid
flowchart LR
    P1["Incidente P1\ndetectado"]
    P1 -->|"MIM autoriza\nbreak-glass"| FIX["Fix directo\n(Red + Green\ncomprimidos)"]
    FIX -->|"deploy\ninmediato"| PROD["Produccion\nestabilizada"]
    PROD -->|"dentro de 72h\n(configurable:\nmin 24h, max 168h)"| CERT["Certificacion\ncompleta\npost-hoc"]

    style P1 fill:#c44,stroke:#333,color:#fff
    style FIX fill:#a74,stroke:#333,color:#fff
    style CERT fill:#4a4,stroke:#333,color:#fff
```

| Restriccion | Regla |
|-------------|-------|
| Autorizacion | Solo el MIM puede activar break-glass |
| Scope | Exclusivamente el fix del incidente — cero features |
| Certificacion | Certificacion completa post-hoc dentro de 72 horas (configurable por el Method Pack, minimo 24h, maximo 168h) |
| Registro | El Ledger registra la activacion como evento auditable |

El break-glass NO es un atajo — es un camino documentado con
restricciones explicitas. Un fix sin certificacion post-hoc dentro
de las 72 horas (o el plazo configurado) se trata como deuda tecnica critica.

### 11f. Evidencia como dato queryable

Todo lo que ocurre durante ejecucion se ingiere como evidencia
queryable, no como documentacion narrativa.

```mermaid
flowchart TD
    subgraph FUENTES["Fuentes de evidencia"]
        TESTS["Test results\npass/fail + AC ref"]
        COV["Coverage reports\n% por archivo"]
        METRICS["Metricas\nmutation, CRAP,\ncomplejidad"]
        COMMITS["Commits\nSHA + fase + test ref"]
        PIPELINE["Echo pipeline\nlogs, reports"]
    end

    FUENTES --> INGESTION["EvidenceIngestion\n(kernel)"]
    INGESTION --> LEDGER["Ledger\n(inmutable)"]
    INGESTION --> BINDING["Binding Layer\ndeclared → inferred → verified"]

    style INGESTION fill:#47a,stroke:#333,color:#fff
    style LEDGER fill:#4a4,stroke:#333,color:#fff
```

La evidencia alimenta el Binding Layer: cada commit con referencia
a un test mueve el enlace de `declared` a `inferred`. La verificacion
mecanica (mutation testing) lo mueve a `verified`.

---

## 12. Como opera (opcional)

[↑ Volver al indice](#indice)

La fase de operacion se activa SOLO si el proyecto tiene superficie
operacional (APIs, CLIs, servicios). No aplica para librerias ni
deliverables de un solo uso.

### 12a. Activacion y rol

```mermaid
flowchart TD
    DELIVER["Delivery\ncompleta"]
    DELIVER --> Q{{"Superficie\noperacional?"}}
    Q -->|"Si\n(API, CLI, servicio)"| ACTIVE["Operation ACTIVA\nVirgil ASISTE\n(reactivo)"]
    Q -->|"No\n(libreria, one-shot)"| INACTIVE["Operation\nNO APLICA"]

    style ACTIVE fill:#47a,stroke:#333,color:#fff
    style INACTIVE fill:#777,stroke:#333,color:#fff
```

| Actor | Rol en operacion |
|-------|-----------------|
| MIM | Usuario — consume el producto |
| Agente | operationalAssistant — ejecuta solicitudes del MIM dentro del contexto del producto |
| Virgil | Asiste al agente con contexto, NO dirige |

### 12b. Adapters de operacion

Tres tipos de documentacion operacional, segun el tipo de producto.

```mermaid
flowchart LR
    OP["Operacion"]
    OP --> RUNBOOK["ops-runbook\n(servicios, APIs)"]
    OP --> USAGE["usage-guide\n(CLIs, herramientas)"]
    OP --> APIREF["api-reference\n(librerias)"]

    style RUNBOOK fill:#47a,stroke:#333,color:#fff
    style USAGE fill:#47a,stroke:#333,color:#fff
    style APIREF fill:#47a,stroke:#333,color:#fff
```

### 12c. Escalacion

Si operacion detecta problemas, escala de vuelta al ciclo
correspondiente.

```mermaid
flowchart TD
    OP["Operacion"]
    OP -->|"bug detectado"| EXEC["→ Execution\n(ciclo Red-Green)"]
    OP -->|"feature request"| PLAN["→ Planning\n(nuevo ciclo)"]
    OP -->|"doc faltante"| DOC["→ Planning\n(producir runbook/guide)"]

    style EXEC fill:#a74,stroke:#333,color:#fff
    style PLAN fill:#47a,stroke:#333,color:#fff
    style DOC fill:#47a,stroke:#333,color:#fff
```

Operacion nunca corrige bugs inline ni agrega features sin pasar
por el ciclo completo. El principio de metodologia e2e (gobierno
principio 1) aplica igual en post-entrega.

---

## Regla de auto-referencia

[↑ Volver al indice](#indice)

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

## Glosario

[↑ Volver al indice](#indice)

| Termino | Definicion |
|---------|-----------|
| Binding Layer | Tres niveles de confianza para contratos: declared (definido), inferred (derivado de evidencia), verified (confirmado por ejecucion). Ver [binding-layer.md](binding-layer.md) |
| Break-glass | Lane de emergencia para incidentes P1 que comprime ceremonia con autorizacion MIM y certificacion post-hoc obligatoria (seccion 11f) |
| bumpDependencies | Ciclo de mantenimiento de tres pasos (security fix → update check → security fix) para actualizar dependencias exactas sin introducir vulnerabilidades (seccion 7h) |
| circuitBreaker | Mecanismo que detiene delegaciones tras 3 fallos consecutivos y escala al MIM. Ver [circuit-breaker.md](circuit-breaker.md) |
| codebaseMemory | Grafo estructural del codigo derivado de AST. Complementa al RAG con consultas de relaciones entre entidades de codigo (seccion 8f) |
| compositeAgent | Secuencia de invocaciones independientes (testEngineer → Implementor → fitnessFunction) orquestadas bajo una etiqueta comun dentro de un worktree (seccion 7c) |
| complianceByDesign | Aserciones de forma de datos integradas en el desarrollo. Cubre exclusivamente controles tecnicos de datos (seccion 7g) |
| ContextBrief | Paquete de contexto compilado por el ContextCompiler para alimentar una delegacion. Incluye deliverables seleccionados con trazabilidad de origen (seccion 9a) |
| ContextCompiler | Componente del Kernel que selecciona y compila deliverables relevantes en un ContextBrief. Paso de juicio con superficie de alucinacion documentada (seccion 9a) |
| CRAP score | Change Risk Anti-Patterns — metrica que combina complejidad y cobertura para evaluar riesgo de cambio |
| delegationContract | Contrato que acompana cada delegacion del SM: define scope, criterios de salida, recursos y restricciones. Ver [delegation-pdc.md](delegation-pdc.md) |
| droppableCode | Codigo que cumple criterios de eliminacion automatica: sin dependientes vivos, sin ejecucion en N ciclos, sin cobertura transitiva (seccion 7f) |
| Echo System | Pipeline de 5 pasos para la ejecucion de cada fase: Setup → Build → Static → Dynamic → E2E (seccion 7a) |
| FastForward | Gradiente de certeza (FF-1 a FF-4) que permite comprimir ceremonia de planning cuando la evidencia observable lo soporta (seccion 3a). Ver [fast-forward.md](fast-forward.md) |
| Kernel | Nucleo ceremonia-agnostico de Virgil. Contiene Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RAG (seccion 5) |
| Ledger | Registro inmutable de eventos, transiciones e historial del proyecto |
| Method Pack | Capa de ceremonia que se monta sobre el Kernel. Define roles, flujos y gates adicionales. Pack Scrum es el unico implementado (seccion 5) |
| PDC | Post-Delegation Checkpoint: safeguard de coherencia de orquestacion (ECHO → VERIFY → MARK → DECIDE). No es gate de certificacion (seccion 3b) |
| PlanningGapDetected | Senal de escalacion cuando la ejecucion detecta un defecto de planning. Dispara re-planificacion |
| RAG | Proyeccion de lectura optimizada sobre deliverables y documentacion. No es fuente de verdad — es reconstruible (seccion 8e) |
| securityAudit | Gate blocking del Echo paso 1 (Setup): escaneo de vulnerabilidades sobre el arbol de dependencias. El Kernel impone la ejecucion; el Method Pack define el umbral de severidad (seccion 7h) |
| Supply Chain Integrity | Tres invariantes sobre dependencias: version pinning exacto, security audit como gate, y bumpDependencies como ciclo de actualizacion controlada (seccion 7h) |
| TraceabilityGraph | Proyeccion derivada que conecta intencion → decision → trabajo → evidencia. Reconstruible desde el Ledger (seccion 5, 8e) |
| versionPinning | Invariante que requiere versiones exactas (sin rangos) para todas las dependencias y el gestor de dependencias. Garantiza reproducibilidad absoluta (seccion 7h) |

---

## Nota de autoridad

Este documento es inmutable una vez consolidado.

**Fuente de verdad**: `principia/overview.md`

Este Principia gobierna con igual fuerza el **Modo Desarrollo** (donde Virgil es el objeto sobre el cual se trabaja) y el **Modo Consumo** (donde Virgil es la herramienta con la cual se trabaja). Ambos modos heredan los mismos principios de gobierno, arquitectura, contratos y gates.
