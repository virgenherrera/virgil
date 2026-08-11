---
id: overview
title: "Vista General del Framework"
mode: framework
type: reference
tags: [actores, pipeline, modos, roles, artefactos, diagrama]
---

# idea-to-mvp --- Vista General del Framework

← [Índice](README.md)

> **Identidad**: idea-to-mvp es un harness para desarrollo de software
> asistido por IA. Caso primario: 1 humano (MIM) + N agentes IA, desde
> una idea hasta un producto funcional. El framework previene drift y
> alucinaciones de los agentes mediante artefactos validados, gates de
> aprobación, y un pipeline determinista (echo). Equipos con
> desarrolladores humanos pueden adoptar las fases y artefactos — el
> modelo de delegación (SM, delegationContracts, PDC) se adapta.
>
> Este documento es el mapa de navegación. Los diagramas son la
> comunicación principal; el texto es tejido conectivo.

---

## Contenido

- [Dogma Rector](#dogma-rector)
- [Adopción Progresiva](#adopción-progresiva)
- [Actores y Roles](#actores-y-roles)
- [Modos de Funcionamiento](#modos-de-funcionamiento)
- [Pipeline Completo](#pipeline-completo)
- [Artifacts](#artifacts)
- [Máquina de Estados de Artefactos](#máquina-de-estados-de-artefactos)
- [Modelo de Delegación](#modelo-de-delegación)
- [fastForward](#fastforward)
- [artifactStore y Adapters](#artifactstore-y-adapters)
- [Qué Sigue (áreas TBD)](#qué-sigue-áreas-tbd)

---

## Dogma Rector

El framework se rige por seis principios no negociables (Dogma). Toda
decisión de diseño, herramienta o proceso nueva debe alinearse con ellos.

1. **Metodología e2e** — el framework cubre el ciclo completo idea →
   código certificado, con una transición de despliegue verificada
   mecánicamente (gate pre/post-deploy y concepto de rollback, ver
   [Detalle de Fases](planning/behavior/phases.md#despliegue--transición-entre-ejecución-y-operación))
   hacia una operación opcional. La operación es una fachada (facade)
   deliberadamente delgada — reactiva, sin fases propias — sobre el
   flujo end-to-end; no es una macro-fase obligatoria para cerrar el
   ciclo, y el framework no prescribe monitoreo continuo, alerting ni
   SRE. "Idea → operación" describe la transición mecánica cubierta,
   no que el framework opere el servicio por el usuario.
2. **Trazabilidad Y fortaleza verificadas** — no basta con verificar el
   binding (la trazabilidad entre artefactos, que confirma que un enlace
   existe). También se verifica la fortaleza real del código mediante
   herramientas externas orquestadas (mutation testing, CRAP score,
   complejidad ciclomática).
3. **Gestión desde nivel superior** — el MIM gestiona el proyecto
   mediante un dashboard de salud (`virgil health`), no mediante
   revisión manual de código línea por línea.
4. **El agente opera bajo constraint, no bajo confianza** — el
   cumplimiento se impone mediante hooks y gates determinísticos, no
   mediante la expectativa de que el agente "se porte bien".
5. **Un handoff, ejecución paralela con semántica de coordinación** —
   múltiples subAgents ejecutan sobre un mismo `handoff.md` mediante
   claiming (`pending` → `claimed` → `done`) y execution state, evitando
   colisiones sin necesitar handoffs separados por subAgent.
6. **Gates determinísticos en transiciones de fase** — cada transición
   entre fases se valida mecánicamente (`virgil handoff lint`), no por
   aprobación subjetiva.

> "I don't review code written by agents. I measure test coverage,
> dependency structure, cyclomatic complexity, module sizes, mutation
> testing. Humans need to disengage from code and manage from a higher
> level." — Robert C. Martin ("Uncle Bob"), julio 2026.

> Detalle: [Gobernanza Metodológica](planning/artifacts/methodology.md)
> (sección "Verificación de métricas: trazabilidad y fortaleza").

[↑ Contenido](#contenido)

---

## Adopción Progresiva

Las capacidades de Virgil (binding layer, `virgil scan`, `virgil health`)
son usables de forma **independiente** de la metodología completa. La
metodología de 8 fases es el default opinado del framework, no el peaje
de entrada para beneficiarse del binding layer.

| Nivel | Comando | Qué incluye |
|-------|---------|-------------|
| **Mínima** | `virgil init --minimal` | Binding graph + `virgil scan` + `virgil health`. Sin fases, sin roles, sin ceremonia. |
| **Estándar** | `virgil init` | Binding + echo hooks + handoff lint + orquestación del motor de métricas (mutation, CRAP, complejidad). |
| **Completa** | `virgil init --full` | Metodología de 8 fases completa, con los roles del equipo default y gates de aprobación. |

Cada nivel agrega valor por sí mismo; ningún nivel exige adoptar el
siguiente. Un equipo puede quedarse en adopción mínima de forma indefinida
y seguir beneficiándose de trazabilidad y verificación de fortaleza — así
como un equipo puede adoptar la metodología completa sin tocar nunca el
binding layer, aunque en ese caso pierde la mitad "fortaleza" del Dogma
(principio 2).

[↑ Contenido](#contenido)

---

## Actores y Roles

El framework opera con tres capas de actores: el humano (MIM), la
infraestructura de orquestación (SM + TPM), y los roles productivos
(equipo default + ad-hoc).

```mermaid
%% Relación entre actores del framework
flowchart TD
    MIM["MIM\n(Humano)\nDecide, aprueba,\ndesbloquea"]

    subgraph INFRA["Infraestructura"]
        SM["SM\n(Session Manager)\nFacade / Orquestador"]
        TPM["TPM\n(Technical Program Manager)\nDBMS del artifactStore"]
    end

    subgraph DEFAULT_TEAM["Equipo Default (5 roles)"]
        direction LR
        PO["PO\nValor de negocio"]
        DEV["Dev Lead\nArquitectura"]
        QA["QA\nVerificabilidad"]
        SEC["DevSecOps\nSeguridad + Infra"]
        UX["UX\nExperiencia de usuario"]
    end

    ADHOC["Roles Ad-Hoc\n(DBA, Performance Eng,\nDomain Expert, etc.)"]

    MIM -->|"toda interacción"| SM
    SM -->|"delegationContracts"| DEFAULT_TEAM
    SM -->|"contratos ad-hoc"| ADHOC
    SM -->|"instrucciones CRUD"| TPM
    TPM -->|"estado de artefactos"| SM
    DEFAULT_TEAM -->|"contenido producido"| TPM
    ADHOC -->|"contenido producido"| TPM
```

Reglas clave:

- El SM **nunca produce contenido** --- solo orquesta, convoca y valida gates.
- El TPM **es el único que escribe** en el artifactStore --- con criterio editorial.
- Los roles son subAgents con personalidad que **cambia por fase**.
- El SM puede **extender el equipo** con roles ad-hoc justificados.

> Detalle: [roles](planning/roles/README.md) (contratos por fase) y
> [comportamiento SM](planning/behavior/README.md)
> (reglas del SM).

[↑ Contenido](#contenido)

---

## Modos de Funcionamiento

El framework separa planificación de ejecución con un contrato formal
entre ambos modos: el handoff.

```mermaid
%% Dos modos del framework y su interfaz
flowchart LR
    subgraph PLAN["PLANNING"]
        direction TB
        P1["Entrada: idea, ticket,\nchallenge, spec parcial"]
        P2["Equipo como\nlentes de revisión"]
        P3["Escribe en:\nartifactStore\n(NUNCA en el repo)"]
    end

    HANDOFF["handoff.md\n(contrato entre modos)"]

    subgraph EXEC["EXECUTION"]
        direction TB
        E1["Entrada:\nhandoff + AGENTS.md"]
        E2["Orquestador\n+ subAgents"]
        E3["Escribe en:\nworking tree\n(SOLO el repo)"]
    end

    PLAN -->|"produce"| HANDOFF
    HANDOFF -->|"consume"| EXEC
    EXEC -->|"gap detectado"| PLAN
```

| Aspecto | Planning | Execution |
|---------|---------------|-----------|
| Propósito | Producir fuentes de verdad | Implementar código |
| Participantes | Equipo (lentes) | Orquestador + minions |
| Dónde escribe | artifactStore (fuera del repo) | Working tree del repo |
| Estado actual | **DEFINIDO** | **DEFINIDO** |

> **Nota (Dogma)**: el `AGENTS.md` monolítico como único vehículo de
> gobernanza por repo se reemplaza por **progressive disclosure**:
> reglas divididas en skills que se activan por contexto, hooks que
> imponen constraints determinísticos (principio 4), y MCP que expone
> herramientas bajo demanda — en vez de un único archivo que el agente
> debe leer completo en cada sesión.

> Detalle: [modelo operativo](planning/operational-model.md).

[↑ Contenido](#contenido)

---

## Pipeline Completo

El ciclo tiene 4 macro-fases, todas definidas. Las fases post-ejecución
están definidas como parte de planning; la macro-fase de operación es
operation: una fachada (facade) opcional y reactiva sobre el ciclo e2e
completo (idea → operación) — no es un requisito para cerrar el ciclo
(Dogma, principio 1).

```mermaid
%% Pipeline completo con macro-fases
flowchart TD
    subgraph MACRO_1["Idea a Handoff (DEFINIDO)"]
        direction LR
        F1["Fase 1\nDefinir Idea"]
        F2["Fase 2\nEspecificar"]
        F3["Fase 3\nDiseñar"]
        F4["Fase 4\nDesglosar\nTareas"]
        F5["Fase 5\nGenerar\nHandoff"]
        F1 --> F2 --> F3 --> F4 --> F5
    end

    subgraph MACRO_2["Handoff a Ejecución (DEFINIDO)"]
        direction LR
        EX_C["prePhase\nContratos"]
        EX_R["Fase Red\nTests"]
        EX_G["Fase Green\nImplementación"]
        EX_RF["Fase Refactor\nCalidad"]
        EX_A["Fase Accept\nCertificación QA"]
        EX_C --> EX_R --> EX_G --> EX_RF --> EX_A
    end

    subgraph POST["Post-Ejecución (DEFINIDO)"]
        direction LR
        F6["Fase 6\nVerificar"]
        F7["Fase 7\nAceptar"]
        F8["Fase 8\nRetrospectiva"]
        F6 --> F7 --> F8
    end

    subgraph MACRO_3["Ejecución a Operación (DEFINIDO)"]
        direction LR
        OPS["operation\nUsuario + agente\nasistente"]
    end

    F5 -->|"handoff.md"| EX_C
    EX_A -->|"código\ncertificado"| F6
    F8 -->|"siguiente ciclo"| F1
    F6 -->|"ops-runbook.md"| OPS
    OPS -->|"gap detectado"| F1
```

Vista alternativa: la línea de tiempo pone el foco en el **orden temporal**
de las fases dentro de cada macro-etapa, en vez de las dependencias entre
sub-fases.

```mermaid
timeline
    title Pipeline del Proyecto
    section Planificación
        Fase 1 - Idea : idea.md aprobado
        Fase 2 - Spec : spec.md aprobado
        Fase 3 - Diseño : design.md aprobado
        Fase 4 - Tareas : tasks.md aprobado
        Fase 5 - Handoff : handoff.md aprobado
    section Ejecución
        prePhase - Contratos : interfaces definidas
        Fase Red : suite de tests completa
        Fase Green : tests pasando
        Fase Refactor : calidad aprobada
        Fase Accept : certificación QA
    section Cierre
        Verificar : QA aprueba
        Aceptar : panel vota
        Retrospectiva : ciclo cerrado
```

### Roles convocados por fase

| Fase | Roles activos |
|------|---------------|
| 1. Idea | PO |
| 2. Spec | PO + QA + UX (condicional) |
| 3. Diseño | Dev Lead + DevSecOps + UX (condicional) |
| 4. Tareas | Dev Lead + DevSecOps (cond) + QA (cond) |
| 5. Handoff | TPM (compila bajo instrucción del SM) |
| 6. Verificar | QA + Dev Lead + DevSecOps (condicional) |
| 7. Aceptar | Todos los roles activos (votación paralela) |
| 8. Retro | Todos los roles activos |

> Detalle: [comportamiento SM](planning/behavior/README.md)
> (fases 1-8) y [roles](planning/roles/README.md) (contratos de cada
> rol por fase).
>
> **Validación externa (recomendada, no un gate)**: tanto Fase Accept
> (execution) como Fase 7 (planning) certifican el entregable de forma
> **interna** — el propio equipo de agentes vota o certifica. El
> framework recomienda, sin exigirlo, un checkpoint de **validación
> externa**: alguien fuera del equipo de agentes (el MIM, un
> stakeholder, un usuario real) ve el software funcionando antes de
> cerrar el ciclo. Es el equivalente al "Measure" de
> Build-Measure-Learn — sin esa señal externa, la Retrospectiva
> (Fase 8) solo aprende de la percepción del propio equipo. Ver
> [Fase Accept](execution/accept.md#validación-externa-recomendada).

[↑ Contenido](#contenido)

---

## Artifacts

El framework produce 6 artefactos universales respaldados por estándares
ISO/IEC/IEEE. Cada fase consume el output de la anterior y produce los
parámetros requeridos para la siguiente.

```mermaid
%% Cadena de artefactos con respaldo ISO
flowchart LR
    IDEA["idea.md\nISO 29148\nsec 9.3 BRS"]
    SPEC["spec.md\nISO 29148\nStRS/SRS"]
    DESIGN["design.md\nISO 42010\n+ IEEE 1016"]
    TASKS["tasks.md\nISO 21502\nsec 7.6"]
    HANDOFF["handoff.md\nISO 15289\ntransition"]
    OPS["ops-runbook.md\nISO 20000\n+ ITIL 4"]

    IDEA -->|"problema\nvalor\nrestricciones"| SPEC
    SPEC -->|"ACs\ncontratos\nconstraints"| DESIGN
    DESIGN -->|"stack\narquitectura\npatrones"| TASKS
    TASKS -->|"tareas\ndeps\nACs"| HANDOFF
    HANDOFF -->|"post-ejecución"| OPS
```

> **binding layer**: esta cadena de artefactos es, en términos del Dogma
> (principio 2), el grafo de trazabilidad que el TPM mantiene —
> vincula cada artefacto downstream con su upstream (idea → spec →
> design → tasks → handoff → ops-runbook). `verifyConsistency` opera
> sobre este grafo para detectar semanticDrift. El binding layer
> confirma que el enlace existe; la fortaleza del enlace (si el test
> realmente detecta regresiones) se verifica aparte, vía herramientas
> externas orquestadas por Virgil (mutation testing, CRAP score,
> complejidad ciclomática).

### Quién produce y quién valida

| Artefacto | Produce | Valida (gate) |
|-----------|---------|---------------|
| `idea.md` | PO | SM (estructural via TPM) |
| `spec.md` | PO | QA (testeabilidad) + UX (experiencia) |
| `design.md` | Dev Lead + DevSecOps | SM (via TPM) + DevSecOps + UX |
| `tasks.md` | Dev Lead | QA (verificabilidad) + SM (via TPM) |
| `handoff.md` | TPM (compila) | SM (autocontención) |
| `ops-runbook.md` | DevSecOps + Dev Lead | SM (gate) |

> Regla cardinal: **quién produce nunca valida su propio artefacto**.
>
> DevSecOps contribuye al assessment de seguridad en Fase 3 (input a
> `design.md`) y evalúa la postura de seguridad en Fase 7 (validación). Son
> scopes distintos: el input de Fase 3 no equivale a producción del
> artefacto completo.
>
> Detalle: [artefactos](planning/artifacts/README.md) (schemas, contenido
> mínimo, jerarquía de workItems, adapters de persistencia).

[↑ Contenido](#contenido)

---

## Máquina de Estados de Artefactos

Cada artefacto transiciona a través de una state machine configurable.
El estado `approved` es el que habilita la siguiente fase.

```mermaid
%% State machine default de artefactos
stateDiagram-v2
    [*] --> draft: Artefacto creado
    draft --> review: Productor solicita revisión
    draft --> cancelled: SM o MIM cancela

    review --> approved: Gate aprobado
    review --> rejected: Gate rechazado
    review --> draft: Devuelto para correcciones

    rejected --> draft: Productor corrige y reintenta

    approved --> draft: SM reabre (mid-planning edit)
```

La state machine del **proyecto** se deriva del estado de los artefactos
en el RAG. El SM no persiste estado --- lo reconstruye consultando al TPM:

```mermaid
%% SM deriva fase actual del estado de artefactos
flowchart LR
    TPM_Q["SM pregunta al TPM:\n¿qué artefactos existen?"]
    TPM_Q --> D1{{"idea\napproved?"}}
    D1 -->|No| PH1["Fase 1:\nDefinir Idea"]
    D1 -->|Sí| D2{{"spec\napproved?"}}
    D2 -->|No| PH2["Fase 2:\nEspecificar"]
    D2 -->|Sí| D3{{"design\napproved?"}}
    D3 -->|No| PH3["Fase 3:\nDiseñar"]
    D3 -->|Sí| D4{{"tasks\napproved?"}}
    D4 -->|No| PH4["Fase 4:\nTareas"]
    D4 -->|Sí| PH5["Fase 5:\nHandoff"]
```

> Detalle: [artefactos](planning/artifacts/README.md) (sección `transition`)
> y [comportamiento SM](planning/behavior/README.md)
> (state machine del proyecto).

[↑ Contenido](#contenido)

---

## Modelo de Delegación

El SM delega trabajo vía **contratos de delegación** con campos
obligatorios. Después de cada retorno, ejecuta el **PDC** (Post-Delegation
Checkpoint).

```mermaid
%% Ciclo de delegación SM -> subAgent -> PDC
sequenceDiagram
    participant SM as SM
    participant SUB as subAgent
    participant TPM as TPM

    SM ->> SUB: Contrato (rol, personalidad,<br/>contexto, input, output, restricciones)
    activate SUB
    SUB ->> SUB: Lee del artifactStore<br/>vía patternB (topic_keys)
    SUB -->> SM: Resultado + Status Report
    deactivate SUB

    Note over SM: PDC (4 pasos obligatorios)

    SM ->> SM: 1. ECHO: ¿coherente con contrato?
    SM ->> SM: 2. VERIFY: ¿cubre todo el scope?
    SM ->> TPM: 3. MARK: persistir resultado
    SM ->> SM: 4. DECIDE: ¿avanzar, re-delegar, escalar?
```

### patternA vs patternB (retrieval)

```mermaid
%% Dos patrones de retrieval y cuándo usar cada uno
flowchart TD
    NEED["subAgent necesita contexto"]
    NEED --> Q{{"¿Target conocido\ny determinista?"}}

    Q -->|"Sí"| PB["patternB\nSM pasa topic_key\nsubAgent lee directo\n(6x más barato)"]
    Q -->|"No (búsqueda\nfuzzy o fan-out 8+)"| PA["patternA\nSM busca, cura, inyecta\n(calidad sobre costo)"]
```

**circuitBreaker**: si 3 delegaciones consecutivas al mismo rol fallan, el SM detiene la cadena y escala al MIM.

> Detalle: [comportamiento SM](planning/behavior/README.md)
> (PDC, circuitBreaker, context resilience) y
> [roles](planning/roles/README.md) (contratos por fase).

[↑ Contenido](#contenido)

---

## fastForward

El SM no avanza siempre una fase a la vez. Evalúa un **gradiente de
certeza** con 4 factores (F1-F4) y avanza proporcionalmente.

```mermaid
%% Scoring de fastForward
flowchart LR
    subgraph SCORE["Checklist de certeza (F1-F4, 0-2 pts c/u)"]
        direction TB
        F1["F1: Artefactos existentes\n0=RAG vacío\n2=spec+design+tasks approved"]
        F2["F2: Estandarización\n0=dominio custom\n2=estándar abierto puro"]
        F3["F3: Ambigüedad\n0=infinitas interpretaciones\n2=determinista"]
        F4["F4: Referencia existente\n0=sin codebase\n2=codebase con patrones"]
    end

    subgraph RESULT["Resultado"]
        direction TB
        LOW["0-2 pts: Baja\nIdea + preguntas"]
        MED["3-5 pts: Media\nIdea + spec parcial"]
        HIGH["6-8 pts: Alta\nHasta handoff\no ejecución"]
    end

    SCORE --> RESULT
```

Ejemplos:

| Input | Score | Certeza | Acción |
|-------|-------|---------|--------|
| "Hazme el uber de lanchas" | 0 | Baja | Idea + preguntas |
| "Agrega auth JWT" (codebase Express) | 4 | Media | Idea + spec parcial |
| "Crea módulo OTEL" (codebase NestJS) | 6 | Alta | Hasta handoff |
| Epic ya groomeado (todo en RAG) | 8 | Alta | fastForward a ejecución |

El SM registra el score F1-F4 en `idea.md` para auditabilidad. El
fastForward también aplica **mid-cycle** (bugs en producción, epics
ya groomeados).

> Detalle: [comportamiento SM](planning/behavior/README.md)
> (sección fastForward contextual).

[↑ Contenido](#contenido)

---

## artifactStore y Adapters

Los artefactos se persisten vía una **universalInterface de 9
operaciones**. El adapter es pluggable --- el framework define la
interfaz, no la implementación.

```mermaid
%% universalInterface y adapters
flowchart TD
    subgraph INTERFACE["Interfaz del Adapter"]
        direction LR
        OPS_I["ingest | save | read\nsearch | list | delete\nverifyConsistency\nhistory | transition"]
    end

    subgraph ADAPTERS["Implementaciones"]
        direction LR
        LOCAL["Local (DEFAULT)\nArchivos .md en\nruta configurable"]
        ENGRAM["Engram\nCross-session\nbuscable"]
        FUTURE["Jira | DBMS | Git\n(TBD)"]
    end

    TPM_W["TPM media\ntodas las escrituras"] --> INTERFACE
    INTERFACE --> LOCAL
    INTERFACE --> ENGRAM
    INTERFACE --> FUTURE

    style FUTURE stroke-dasharray: 5 5
```

El TPM actúa como DBMS: no decide qué datos crear, pero decide cómo se
almacenan, valida integridad, y sirve consultas con criterio editorial.

> Detalle: [artefactos](planning/artifacts/README.md) (universalInterface,
> contrato de comportamiento, garantías ACID, adapters).

[↑ Contenido](#contenido)

---

## Qué Sigue (áreas TBD)

El framework cubre la macro-fase de planificación y la macro-fase de
ejecución en detalle. Las siguientes áreas están identificadas pero no
definidas:

| Área | Estado | Descripción |
|------|--------|-------------|
| Execution | **DEFINIDO** | 5 fases (Contratos → Red → Green → Refactor → Accept). Contract-first, boundaryModel (App + E2E), revisión multi-dimensional. Ver [modelo de ejecución](execution/README.md). |
| Despliegue | **DEFINIDO (nivel dogma)** | Transición entre Fase Accept (execution) y Operation. Define gate pre/post-deploy y el concepto de rollback a nivel dogma; NO prescribe mecanismo de despliegue (CI/CD, blue-green, canary) — eso queda a decisión del proyecto. Ver [Detalle de Fases](planning/behavior/phases.md#despliegue--transición-entre-ejecución-y-operación). |
| Operation | **DEFINIDO** | Opcional. Para proyectos con superficie operativa: el usuario consume el producto con asistencia del agente. Reactivo, sin fases. Ver [modelo de operación](operation/README.md). |
| Adapters avanzados | TBD | Jira, DBMS, Git repo, MS Project como adapters del artifactStore. |
| Routing no-Scrum | TBD | Routing tables para Kanban (WIP limits), Shape Up (bets), SAFe (PIs). Los artefactos son universales; la orquestación no. |
| Tiers de activación | TBD | Cómo escala hacia abajo el modo planificación para proyectos simples o challenges con timebox. |
| Transacciones del adapter | TBD | Primitivas `begin`/`commit`/`rollback` para adapters sin soporte nativo. |

[↑ Contenido](#contenido)

---

## Índice de Documentos Detallados

| Documento | Qué define |
|-----------|-----------|
| [Modelo operativo](planning/operational-model.md) | Dos modos, ownership, límites, adapter por defecto |
| [Artifacts](planning/artifacts/README.md) | 6 artefactos, TPM, interfaz de adapters, state machine, jerarquía de workItems |
| [SM Behavior](planning/behavior/README.md) | SM como facade, state machine del proyecto, fastForward, PDC, circuitBreaker |
| [Roles](planning/roles/README.md) | delegationContracts por fase, personalidades, activación condicional, roles ad-hoc |
| [Execution](execution/README.md) | Execution: Contract-first, Red-Green-Refactor macro, roles de ejecución, conexión con planning |
| [Operation](operation/README.md) | Operation: opcional y reactivo, sin fases, usuario + agente asistente, conexión con planning y execution |
| [echo system](echo-system.md) | Pipeline determinista de 5 pasos, homogeneidad de ambientes, enforcement, bumpDependencies |
| [artifact system](artifact-system.md) | Convención de ubicación predecible para outputs de build (compilados, reportes, documentación API) |
