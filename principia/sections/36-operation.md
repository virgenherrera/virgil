<!-- Virgil Principia
section_id: "12"
title: "Como opera (opcional)"
source: "principia/constitution.md"
source_lines: [1652, 1717]
layer: operation
constitutional: false
actors: [MIM, Agente, Virgil]
glossary_terms: []
depends_on: ["11f"]
referenced_by: []
keywords:
  - operacion
  - superficie operacional
  - operationalAssistant
  - ops-runbook
  - usage-guide
  - api-reference
  - Delivery support
  - escalacion
  - bug detectado
  - feature request
  - doc faltante
editorial_additions: [context_paragraph]
-->

> **Context:** La fase de Operation es opcional y se activa unicamente cuando el producto entregado tiene superficie operacional activa. No aplica a librerias ni a deliverables de un solo uso, cuya documentacion pertenece a Delivery/support.

## 12. Como opera (opcional)

La fase de operacion se activa SOLO si el producto tiene superficie
operacional activa (APIs, CLIs, servicios o herramientas operadas).
Una libreria por si sola no activa Operation; su API reference pertenece
a Delivery/support documentation. Tampoco aplica a deliverables de un
solo uso.

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

Dos tipos de documentacion pertenecen directamente a Operation; las librerias mantienen `api-reference` como artifact de Delivery/support, sin activar por si mismas la fase operacional.

```mermaid
flowchart LR
    OP["Operacion"]
    OP --> RUNBOOK["ops-runbook\n(servicios, APIs)"]
    OP --> USAGE["usage-guide\n(CLIs, herramientas)"]
    DELIVERY["Delivery / Support"] --> APIREF["api-reference\n(librerias)"]

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
