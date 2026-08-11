---
id: execution/git-strategy
title: "Estrategia Git"
mode: execution
type: process
tags: [git, worktrees, branches, commits, merge, paralelismo, agente-compuesto, gitflow]
---

# Estrategia Git y Paralelismo

← [Índice principal](../README.md) | [Execution](README.md)

> Define cómo el executionOrchestrator usa ramas, worktrees y commits
> para ejecutar el ciclo Red-Green-Refactor con paralelismo real. Resuelve
> los TBDs de "Paralelismo en ejecución" y "Commit strategy".

> **Nota sobre WHAT vs HOW.** Este documento define los REQUISITOS que
> toda estrategia de branching debe cumplir para execution (aislamiento
> entre lanes, trazabilidad a iteraciones, merge no destructivo, soporte
> para ejecución paralela). La implementación de referencia usa Gitflow
> adaptado con worktrees, pero cualquier estrategia que satisfaga estos
> requisitos es aceptable (trunk-based con feature flags, stacked PRs,
> etc.).

---

## Contenido

- [Modelo de Ramas](#modelo-de-ramas)
- [Worktrees para Paralelismo](#worktrees-para-paralelismo)
- [Estrategia de Commits](#estrategia-de-commits)
- [Flujo Completo de una Iteración](#flujo-completo-de-una-iteración)
- [Manejo de Conflictos Post-Merge](#manejo-de-conflictos-post-merge)
- [Manejo de Fallos Mid-Lane](#manejo-de-fallos-mid-lane)
- [Diagrama de Decisión del Orquestador](#diagrama-de-decisión-del-orquestador)

---

## Modelo de Ramas

execution adapta Gitflow al contexto de ejecución por fases. Cada
iteración del ciclo (un batch de tasks del DAG) opera sobre un branch
dedicado. Los lanes paralelos se ejecutan en worktrees aislados.

```mermaid
gitGraph
    commit id: "main (estable)"
    branch develop
    commit id: "develop (integración)"
    branch exec/iter-1
    commit id: "contracts: API + DB schema"
    branch exec/iter-1/lane-a
    commit id: "red: auth tests"
    commit id: "green: login endpoint"
    commit id: "green: token refresh"
    commit id: "refactor: SOLID + DI"
    checkout exec/iter-1
    branch exec/iter-1/lane-b
    commit id: "red: UI tests"
    commit id: "green: login component"
    commit id: "refactor: a11y"
    checkout exec/iter-1
    merge exec/iter-1/lane-a id: "merge lane-a"
    merge exec/iter-1/lane-b id: "merge lane-b"
    commit id: "integration tests pass"
    checkout develop
    merge exec/iter-1 id: "iter-1 done"
    branch exec/iter-2
    commit id: "contracts: events + cache"
    commit id: "..."
    checkout develop
    merge exec/iter-2 id: "iter-2 done"
    checkout main
    merge develop id: "release"
```

### Anatomía de las ramas

| Rama | Propósito | Quién la crea | Cuándo se mergea |
|------|-----------|---------------|------------------|
| `main` | Código estable, listo para operación | — | Cuando develop pasa aceptación |
| `develop` | Integración continua entre iteraciones | Orquestador (una vez) | Hacia main en release |
| `exec/iter-N` | Una iteración del ciclo Red-Green-Refactor | Orquestador (por iteración) | Hacia develop cuando todos los lanes convergen |
| `exec/iter-N/lane-X` | Un lane paralelo del DAG | Orquestador (por lane) | Hacia exec/iter-N cuando completa Refactor |

### Regla de naming

```text
exec/iter-{N}/lane-{nombre-descriptivo}

Ejemplos:
  exec/iter-1/lane-auth
  exec/iter-1/lane-ui-login
  exec/iter-1/lane-infra-redis
  exec/iter-2/lane-payments
```

[↑ Contenido](#contenido)

---

## Worktrees para Paralelismo

Cuando el DAG de `tasks.md` tiene lanes independientes (sin dependencias
FS entre sí), el Orquestador lanza subAgents en **worktrees aislados**.
Cada agente opera su propio directorio de trabajo sin conflictos de
archivos.

```mermaid
flowchart TD
    subgraph OE["executionOrchestrator"]
        DAG["Lee DAG de tasks.md"]
        DETECT["Detecta 3 lanes\nindependientes"]
    end

    DAG --> DETECT

    subgraph WT["Worktrees (filesystem aislado)"]
        direction LR
        WT_A["worktree A\nexec/iter-1/lane-auth\n📁 /tmp/wt-lane-auth"]
        WT_B["worktree B\nexec/iter-1/lane-ui\n📁 /tmp/wt-lane-ui"]
        WT_C["worktree C\nexec/iter-1/lane-infra\n📁 /tmp/wt-lane-infra"]
    end

    DETECT -->|"git worktree add"| WT_A
    DETECT -->|"git worktree add"| WT_B
    DETECT -->|"git worktree add"| WT_C

    subgraph AGENTS["subAgents (paralelo)"]
        direction LR
        AG_A["Agente A\nRed → Green → Refactor\n(auth)"]
        AG_B["Agente B\nRed → Green → Refactor\n(UI)"]
        AG_C["Agente C\nRed → Green → Refactor\n(infra)"]
    end

    WT_A --> AG_A
    WT_B --> AG_B
    WT_C --> AG_C

    AG_A -->|"push lane-auth"| MERGE["Orquestador mergea\nal branch de iteración"]
    AG_B -->|"push lane-ui"| MERGE
    AG_C -->|"push lane-infra"| MERGE

    MERGE --> INTEGRATION["Tests de integración\n(branch iter-1 completo)"]
```

### Modelo de roles dentro de un worktree

> **Reconciliación roles ↔ worktrees**: En ejecución secuencial (1 lane),
> el Orquestador lanza roles separados por fase — testEngineer (Red),
> Implementor (Green), fitness functions + revisión residual (Refactor)
> — como subAgents distintos con personalidades diferenciadas.
>
> En ejecución paralela con worktrees, cada lane se asigna a un
> **compositeAgent** que asume las personalidades secuencialmente dentro
> del mismo worktree. La razón: lanzar múltiples subAgents por lane
> dentro del mismo worktree crearía conflictos de acceso al filesystem.
> El compositeAgent cambia de personalidad entre fases:
>
> 1. **Personalidad testEngineer** → escribe la suite de tests (Red)
> 2. **Personalidad Implementor** → escribe código que pase los tests (Green)
> 3. **Verificación mecánica** → ejecuta fitness functions (mutation,
>    CRAP, complexity, dependencies, module size, security scanners).
>    La revisión residual (autorización, DDD) se documenta y escala
>    sin bloquear el gate.
>
> El Orquestador valida cada transición de personalidad con un miniPDC
> entre fases.

### Ciclo de vida de un worktree

```mermaid
sequenceDiagram
    participant OE as Orquestador
    participant GIT as Git
    participant AG as compositeAgent
    participant CI as Tests

    OE->>GIT: git worktree add /tmp/wt-lane-auth exec/iter-1/lane-auth
    OE->>AG: Contrato: ejecutar Red-Green-Refactor para lane auth
    activate AG

    AG->>AG: Personalidad testEngineer<br/>Red: escribe tests (commits)
    Note over AG: miniPDC: transición Red → Green
    AG->>AG: Personalidad Implementor<br/>Green: implementa (commits)
    Note over AG: miniPDC: transición Green → Refactor
    AG->>AG: Verificación mecánica<br/>Refactor: fitness functions (commits)
    AG->>CI: Ejecuta tests del lane
    CI-->>AG: ✅ PASS

    AG-->>OE: Status Report + push al remote
    deactivate AG

    OE->>GIT: git worktree remove /tmp/wt-lane-auth
    OE->>GIT: git merge exec/iter-1/lane-auth --no-ff
    OE->>CI: Ejecuta tests de integración (branch iter-1)
    CI-->>OE: ✅ PASS → lane mergeado
```

> **Nota**: Este diagrama cubre el ciclo de vida de un worktree individual
> (Red-Green-Refactor). La fase Accept (Certificación QA) NO ocurre por
> worktree — se ejecuta una única vez por iteración, después de que TODOS
> los lanes convergen en `exec/iter-N` y los tests de integración pasan,
> y ANTES del merge de `exec/iter-N` hacia `develop`. Ver el diagrama
> "Flujo Completo de una Iteración" más abajo.

### Cuándo usar worktrees vs secuencial

| Condición | Estrategia | Razón |
|-----------|-----------|-------|
| 2+ lanes sin dependencias FS entre sí | Worktrees paralelos | Sin conflictos de archivos — máximo throughput |
| Lanes con dependencia SS (start-start) | Worktrees con merge parcial | Lane B empieza cuando A empieza, pero necesita el setup de A |
| Lanes con dependencia FS (finish-start) | Secuencial | B necesita el output completo de A |
| Lane único o tasks < 5 | Secuencial en branch | Overhead de worktree no se justifica |
| Conflicto de archivos detectado entre lanes | Secuencial forzado | Worktrees paralelos producirían merge conflicts |

### Detección de conflictos pre-worktree

Antes de lanzar worktrees paralelos, el Orquestador verifica que los
lanes no toquen los mismos archivos:

```mermaid
flowchart TD
    LANES["Lanes independientes\n(sin deps FS)"]
    ANALYZE{{"¿Los archivos\nque tocará cada lane\nse solapan?"}}

    LANES --> ANALYZE
    ANALYZE -->|"No"| PARALLEL["Worktrees paralelos\n(máximo throughput)"]
    ANALYZE -->|"Sí, parcial"| ORDERED["Ordenar lanes\npor archivo compartido\n(serializar los que colisionan)"]
    ANALYZE -->|"Sí, total"| SEQUENTIAL["Secuencial\n(un lane a la vez)"]
```

El análisis se basa en los archivos listados en cada workItem de
`tasks.md` (campo `files` del schema de workItem). Si el campo no
existe, el Orquestador asume solapamiento y serializa.

[↑ Contenido](#contenido)

---

## Estrategia de Commits

### Convención por fase

| Fase | Prefijo | Ejemplo | Frecuencia |
|------|---------|---------|------------|
| Contratos | `contract:` | `contract: define auth API (OpenAPI 3.1)` | 1 por tipo de contrato |
| Red | `test:` | `test: auth-login-success (AC-01)` | 1 por test o grupo pequeño |
| Green | `feat:` | `feat: implement login endpoint (passes auth-login-success)` | 1 por test que pasa |
| Refactor | `refactor:` | `refactor: extract AuthService (SOLID-SRP)` | 1 por refactor atómico |

### Trazabilidad AC → test → commit

Cada commit en Green referencia qué test(s) pasa. Cada commit en Red
referencia qué AC cubre. La cadena completa es:

```text
AC-01 (spec.md)
  → test: auth-login-success (AC-01)        [Red]
    → feat: implement login (passes auth-login-success)  [Green]
      → refactor: extract AuthService (SOLID-SRP)        [Refactor]
```

### Squash policy

| Momento | Estrategia | Razón |
|---------|-----------|-------|
| Dentro de un lane | Commits granulares | Trazabilidad Red→Green→Refactor |
| Merge lane → iter-N | `--no-ff` (merge commit) | Preserva historia del lane |
| Merge iter-N → develop | `--no-ff` (merge commit) | Preserva historia de iteración |
| Merge develop → main | Squash opcional | El MIM decide: historia limpia vs completa |

[↑ Contenido](#contenido)

---

## Flujo Completo de una Iteración

```mermaid
flowchart TD
    START["Orquestador lee handoff.md\n+ DAG de tasks.md"]

    subgraph PREFASE["prePhase: Contratos (branch exec/iter-N)"]
        C1["Contract Architect define\ncontratos en branch iter-N"]
        C2["MIM aprueba contratos\n(si decisión de negocio)"]
    end

    subgraph PARALLEL["Ejecución paralela (worktrees)"]
        direction TB

        subgraph LA["Worktree: lane-auth"]
            LA_R["Red: tests auth"]
            LA_G["Green: impl auth"]
            LA_RF["Refactor: review auth"]
            LA_R --> LA_G --> LA_RF
        end

        subgraph LB["Worktree: lane-ui"]
            LB_R["Red: tests UI"]
            LB_G["Green: impl UI"]
            LB_RF["Refactor: review UI"]
            LB_R --> LB_G --> LB_RF
        end

        subgraph LC["Worktree: lane-infra"]
            LC_R["Red: tests infra"]
            LC_G["Green: impl infra"]
            LC_RF["Refactor: review infra"]
            LC_R --> LC_G --> LC_RF
        end
    end

    subgraph CONVERGE["Convergencia (branch exec/iter-N)"]
        MERGE_A["Merge lane-auth"]
        MERGE_B["Merge lane-ui"]
        MERGE_C["Merge lane-infra"]
        INT_TEST["Tests de integración\n(suite completa)"]
        RESOLVE{{"¿Conflictos?"}}
    end

    subgraph ACCEPT["Certificación QA"]
        QA_CHECK["QA verifica\nproducto vs handoff"]
    end

    subgraph CLOSE["Cierre de iteración"]
        MERGE_DEV["Merge iter-N → develop"]
        NEXT{{"¿Más iteraciones?"}}
    end

    START --> C1
    C1 --> C2
    C2 --> PARALLEL

    LA_RF --> MERGE_A
    LB_RF --> MERGE_B
    LC_RF --> MERGE_C

    MERGE_A --> INT_TEST
    MERGE_B --> INT_TEST
    MERGE_C --> INT_TEST

    INT_TEST --> RESOLVE
    RESOLVE -->|"No"| QA_CHECK
    RESOLVE -->|"Sí"| FIX["Resolver conflictos\n+ re-run tests"]
    FIX --> INT_TEST

    QA_CHECK --> MERGE_DEV
    MERGE_DEV --> NEXT
    NEXT -->|"Sí"| START
    NEXT -->|"No"| RELEASE["Merge develop → main"]
```

[↑ Contenido](#contenido)

---

## Manejo de Conflictos Post-Merge

Cuando dos lanes modificaron archivos relacionados (no el mismo archivo,
pero con dependencias lógicas), los tests de integración los detectan:

| Escenario | Síntoma | Resolución |
|-----------|---------|------------|
| Dos lanes definieron el mismo endpoint | Test de integración falla (ruta duplicada) | Orquestador mergea manualmente, elimina duplicado |
| Lane A cambió una interfaz que lane B consume | Test de B falla post-merge | Orquestador ajusta B para la interfaz actualizada de A |
| Lane A y B modificaron el mismo archivo | Merge conflict de git | Orquestador resuelve, re-run tests |
| Tests pasan aislados pero fallan integrados | Interferencia de estado (DB, cache) | Orquestador aísla el problema, crea fix en branch iter-N |

[↑ Contenido](#contenido)

---

## Manejo de Fallos Mid-Lane

Cuando un subAgent falla durante la ejecución dentro de un worktree:

```mermaid
flowchart TD
    FAIL["subAgent reporta\nFAILED o BLOCKED"]
    ASSESS{{"¿Tipo de fallo?"}}

    FAIL --> ASSESS

    ASSESS -->|"Tests no pasan\n(Green bloqueado)"| REDELEGATE["Re-delegar en\nmismo worktree\n(nuevo Implementor)"]
    ASSESS -->|"Refactor rompe tests\n(regresión)"| REVERT["Revertir último refactor\n(git revert en worktree)"]
    ASSESS -->|"Bloqueo externo\n(API tercero, decisión MIM)"| PARK["Estacionar lane\n(worktree permanece,\nlane pasa a blocked)"]
    ASSESS -->|"Error irrecuperable\n(worktree corrupto)"| ABANDON["Abandonar worktree\n(git worktree remove --force)"]

    REDELEGATE --> CONTINUE["Continuar ejecución\nen worktree"]
    REVERT --> CONTINUE
    PARK --> NOTIFY["Notificar al MIM\n+ continuar otros lanes"]
    ABANDON --> RECREATE["Recrear worktree\ndesde último commit\nválido del lane"]
    RECREATE --> CONTINUE
```

### Impacto en otros lanes

| Escenario | Impacto | Acción |
|-----------|---------|--------|
| Lane fallido no tiene dependientes | Ninguno | Otros lanes continúan normalmente |
| Lane fallido es pre-requisito parcial (SS) | Lane dependiente puede continuar con lo que ya tiene | Orquestador evalúa si lo parcial es suficiente |
| Lane fallido es pre-requisito completo (FS) | Lane dependiente se bloquea | Orquestador marca lane dependiente como `blocked`, estaciona su worktree |
| Múltiples lanes fallan | Posible problema sistémico | Orquestador escala al MIM antes de re-delegar |

### Limpieza de worktrees

El Orquestador es responsable de limpiar worktrees al cierre de la iteración:

1. Lanes completados exitosamente → `git worktree remove` después del merge
2. Lanes estacionados → worktree permanece hasta que el bloqueo se resuelva
3. Lanes abandonados → `git worktree remove --force` + branch eliminado

[↑ Contenido](#contenido)

---

## Diagrama de Decisión del Orquestador

```mermaid
flowchart TD
    READ["Lee DAG de tasks.md"]
    LANES{{"¿Cuántos lanes\nindependientes?"}}

    READ --> LANES

    LANES -->|"1"| SEQ["Ejecución secuencial\n(sin worktrees)"]
    LANES -->|"2+"| CHECK{{"¿Archivos\nse solapan?"}}

    CHECK -->|"No"| WT["Worktrees paralelos\n(1 agente por lane)"]
    CHECK -->|"Parcial"| HYBRID["Híbrido:\nlanes que colisionan → secuencial\nlanes que no → paralelo"]
    CHECK -->|"Total"| SEQ

    WT --> MERGE["Merge + integration tests"]
    HYBRID --> MERGE
    SEQ --> MERGE

    MERGE --> PASS{{"¿Tests pasan?"}}
    PASS -->|"Sí"| CLOSE["Cerrar iteración\nmerge → develop"]
    PASS -->|"No"| FIX["Resolver conflictos\nre-run"]
    FIX --> PASS
```

[↑ Contenido](#contenido)
