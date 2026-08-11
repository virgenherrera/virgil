---
id: execution/green
title: "Fase Green — Implementación"
mode: execution
type: process
tags: [implementación, commits, tdd-micro, código, escalación]
---

# Fase Green — Implementación

← [Índice principal](../README.md) | [Execution](README.md)

```mermaid
sequenceDiagram
    participant OE as executionOrchestrator
    participant IMP as Implementor
    participant WT as Working Tree
    participant CI as Tests

    OE->>IMP: Contrato: implementar código<br/>que pase los tests rojos
    activate IMP
    IMP->>WT: Escribe código
    IMP->>CI: Ejecuta tests
    CI-->>IMP: Resultados

    alt Test incorrecto detectado
        IMP-->>OE: "Test X verifica comportamiento<br/>incorrecto según AC-Y"
        OE->>OE: Decide: re-delegar a<br/>testEngineer o autorizar fix
    end

    IMP-->>OE: Status Report + commits
    deactivate IMP
```

> **Input de Red**: El Implementor recibe la Capa 3 (testImplementation)
> como entrada directa — los tests ejecutables que debe hacer pasar. Las
> Capas 1 (testPlan) y 2 (testContract) proporcionan trazabilidad pero no
> son input operativo de Green.

---

## Contenido

- [Reglas de Green](#reglas-de-green)
- [Estrategia de commits](#estrategia-de-commits)
- [Inferencia de bindings](#inferencia-de-bindings)
- [Cuando corregir tests vs corregir codigo](#cuando-corregir-tests-vs-corregir-codigo)

---

## Reglas de Green

La unica meta es hacer que los tests pasen. Nada mas.

```mermaid
flowchart TD
    START["Tests rojos"]
    WRITE["Escribir codigo\nque pase el test"]
    RUN["Ejecutar tests"]
    CHECK{{"¿Pasan?"}}
    COMMIT["Commit\n(incremento verde)"]
    NEXT{{"¿Quedan tests\nrojos?"}}
    DONE["Todos los tests pasan\n✅ GREEN"]

    START --> WRITE
    WRITE --> RUN
    RUN --> CHECK
    CHECK -->|"No"| FIX{{"¿Test incorrecto?"}}
    FIX -->|"Si"| FIX_TEST["Escalar al Orquestador\n(volver a Red)"]
    FIX -->|"No"| WRITE
    FIX_TEST --> WRITE
    CHECK -->|"Si"| COMMIT
    COMMIT --> NEXT
    NEXT -->|"Si"| WRITE
    NEXT -->|"No"| DONE
```

| Regla | Descripcion |
|-------|-------------|
| **Lo primero que funcione** | Codigo feo, duplicado, con magic numbers --- todo vale si los tests pasan |
| **Sin optimizacion prematura** | No abstraer, no generalizar, no "mejorar". Eso es la siguiente fase |
| **Cumplir contratos** | El codigo DEBE respetar los contratos definidos en la prePhase |
| **Commits frecuentes** | Cada test que pasa = un posible commit. Incrementos verdes pequenos |
| **Test incorrecto → corregir test** | Si un test verifica algo equivocado, arreglarlo ANTES de implementar |

> **Excepción: TDD micro para complejidad algorítmica**: Para tareas de
> alta complejidad algorítmica (algoritmos, parsers, cálculos financieros),
> el Implementor puede usar TDD micro (test-implement-test por función)
> como herramienta complementaria dentro de Green. Esta excepción no
> aplica a código de aplicación estándar (CRUD, endpoints, flujos de UI).

[↑ Contenido](#contenido)

---

## Estrategia de commits

```plaintext
feat: implement login endpoint (passes auth-login-success test)
feat: implement login validation (passes auth-login-invalid-credentials test)
feat: implement token refresh (passes auth-token-refresh test)
```

Cada commit referencia que test(s) pasa. Esto crea trazabilidad entre
implementacion y especificacion ejecutable.

[↑ Contenido](#contenido)

---

## Inferencia de bindings

El binding layer declarado en Red (ver
[red.md](red.md#trazabilidad-ac-testplan-testcontract-implementación-coverage))
no se actualiza a mano durante Green. Un hook post-commit analiza cada
commit verde y actualiza el binding correspondiente cuando detecta que
el código del commit efectivamente ejercita el test referenciado.

El binding transita por tres niveles de confianza:

```mermaid
flowchart LR
    D["declared\n(Fase Red:\nAC → test → código,\nsin verificar)"]
    I["inferred\n(Fase Green:\nhook post-commit detecta\nque el código ejercita el test)"]
    V["verified\n(Fase Refactor:\nmutation testing confirma\nla fuerza real del test)"]

    D --> I --> V
```

| Estado | Cuándo se alcanza | Qué garantiza |
|--------|--------------------|----------------|
| `declared` | Fase Red | El test existe y referencia un AC. No implica que el código lo cumpla. |
| `inferred` | Fase Green (hook post-commit) | El código del commit ejercita el test declarado. No implica que el test sea fuerte. |
| `verified` | Fase Refactor (`virgil metrics`) | Mutation testing confirmó que el test detecta mutantes reales — la señal es confiable. |

[↑ Contenido](#contenido)

---

## Cuando corregir tests vs corregir codigo

```mermaid
flowchart TD
    FAIL["Test falla"]
    Q1{{"¿El test verifica\nel comportamiento correcto\nsegun el AC?"}}
    Q1 -->|"Si"| FIX_CODE["Corregir el CODIGO\n(el test esta bien)"]
    Q1 -->|"No"| Q2{{"¿El AC esta mal\no el test lo\ninterpreta mal?"}}
    Q2 -->|"Test mal escrito"| FIX_TEST["Escalar al Orquestador\n(re-delegar a testEngineer\no autorizar correccion)"]
    Q2 -->|"AC ambiguo"| ESCALATE["Escalar al Orquestador\n→ re-evaluar contrato"]
```

> **Separación de responsabilidades**: El Implementor NO corrige tests directamente. Si sospecha
> que un test es incorrecto, escala al Orquestador con evidencia (qué test, qué AC contradice,
> por qué). El Orquestador decide si re-delega al testEngineer o autoriza la corrección in situ.

[↑ Contenido](#contenido)
