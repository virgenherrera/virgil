---
id: planning/artifacts/schemas
title: "Schemas de Artefactos"
mode: planning
type: reference
tags: [schemas, idea, spec, design, tasks, handoff, ops-runbook, iso, documentación-operativa]
---

# Schemas de los 6 Artefactos

← [Índice principal](../../README.md) | [Planning](../README.md) | [Artifacts](README.md)

---

## Contenido

- [Los 6 Artefactos Universales](#los-6-artefactos-universales)
- [Metodología como Capa Intercambiable](#metodología-como-capa-intercambiable)
- [Resumen de Estándares Referenciados](#resumen-de-estándares-referenciados)

---

## Los 6 Artefactos Universales

Cada artefacto tiene: propósito, respaldo de estándar, contenido mínimo,
quién lo produce, quién lo consume, y reglas de ownership.

### 1. `idea.md` — Análisis de Negocio/Misión

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Business/Mission Analysis |
| **Respaldo ISO** | **ISO/IEC/IEEE 29148 sec 9.3 (BRS)** — tailoring ligero permitido por sec 9.3.1 |
| **Respaldo adicional** | IEEE 1362 (ConOps) — absorbido como Annex A/B de 29148 |
| **Propósito** | Capturar el problema, el valor esperado, las restricciones conocidas, y las preguntas pendientes |
| **Owner** | Produce: PO (formula y estructura). Co-produce: SM (formula preguntas, no escribe contenido) |
| **Consumido por** | Fase de spec |

**Mapeo a 29148 sec 9.3 (BRS)**:

| Sección 29148 BRS | Nuestro equivalente en `idea.md` |
|-------------------|--------------------------------|
| sec 9.3.2 Business purpose | Problema |
| sec 9.3.3 Business scope | Valor esperado (alcance) |
| sec 9.3.5 Major stakeholders | Usuario final, stakeholders |
| sec 9.3.7 Mission, goals, objectives | Valor esperado (objetivos) |
| sec 9.3.12 Business operational constraints | Restricciones conocidas |
| sec 9.3.16 High-level operational concept | Flujo core del producto |
| sec 9.3.19 Project constraints | Timebox, presupuesto, stack obligatorio |

**Contenido mínimo** (tailoring de 29148 sec 9.3 — permitido por sec 9.3.1:
*"Organization of the content such as the order and section structure
may be selected in accordance with the project's information management
policies"*):

```markdown
# Idea: {nombre del proyecto}

## Problema                        ← 29148 sec 9.3.2 Business purpose
Qué se necesita resolver y por qué.

## Valor esperado                  ← 29148 sec 9.3.7 Mission/goals/objectives
Para quién y qué beneficio.

## Restricciones conocidas         ← 29148 sec 9.3.12 + sec 9.3.19
Timebox, presupuesto, stack obligatorio, plataforma, etc.

## Concepto operativo de alto nivel ← 29148 sec 9.3.16 High-level operational concept
Flujo core del producto, escenarios principales.

## Decisiones tomadas
Roles activos para este proyecto, tier de activación, metodología.

## Preguntas pendientes
Lo que falta resolver antes de especificar.

## Metadata
- Fecha de creación
- Fuente del input (idea vaga, challenge, ticket, spec parcial)
- Estado: borrador | aprobado
- Iteración y metodología vigente
```

> **Corrección**: la versión anterior de este documento declaraba
> `idea.md` como "territorio libre sin estándar." Esto era **incorrecto**.
> 29148 sec 9.3 (BRS) cubre directamente este artefacto. IEEE 1362 (ConOps),
> que se creía muerto, fue absorbido como Annexes A/B de 29148 y sigue
> activo. Nuestro formato es un tailoring ligero — más conciso que el
> BRS completo, pero alineado a sus secciones normativas.

---

### 2. `spec.md` — Especificación de Requisitos

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Stakeholder Needs & Requirements Definition + System Requirements Definition |
| **Respaldo ISO** | **ISO/IEC/IEEE 29148** (Requirements Engineering) |
| **Propósito** | Definir QUÉ se construye: acceptance criteria, contratos de API, constraints, límites de alcance |
| **Owner** | PO (define valor y prioridad) → QA (valida testeabilidad) |
| **Consumido por** | Fase de diseño, fase de verificación |

**Contenido mínimo** (alineado a 29148 — StRS/SRS simplificado):

```markdown
# Spec: {nombre del proyecto}

## Requisitos funcionales
Listado con acceptance criteria (given/when/then).

## Requisitos no funcionales
Performance, seguridad, accesibilidad, compatibilidad.

## Contratos de interfaz
APIs, schemas, protocolos de comunicación.

## Restricciones y asunciones
Lo que se da por hecho, lo que NO se va a hacer.

## Priorización
MoSCoW o equivalente.

## Trazabilidad
Cada requisito traza a idea.md (qué problema resuelve).

## Metadata
- Fecha de creación
- Estado: borrador | revisado | aprobado
- Revisores: [roles que aprobaron]
```

> **29148 define 3 niveles**: StRS (stakeholder), SyRS (sistema), SRS
> (software). Para proyectos simples, los 3 se fusionan en un solo
> `spec.md`. Para proyectos complejos, se pueden separar. ISO 15289
> permite merge/split de documentos — el contenido es lo que importa.

---

### 3. `design.md` — Descripción de Arquitectura y Diseño

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Architecture Definition + Design Definition |
| **Respaldo ISO** | **ISO/IEC/IEEE 42010** (Architecture Description) + **IEEE 1016** (Software Design) |
| **Propósito** | Definir CÓMO se construye: arquitectura, patrones, tradeoffs, decisiones técnicas |
| **Owner** | Dev Lead (arquitectura y patrones) → DevSecOps (seguridad e infra) |
| **Consumido por** | Fase de tareas, fase de ejecución |

**Contenido mínimo** (alineado a 42010 viewpoints + 1016 design entities):

```markdown
# Design: {nombre del proyecto}

## Stack tecnológico
Lenguaje, framework, base de datos, servicios externos.
Justificación de cada elección.

## Arquitectura del sistema
Viewpoints (42010): lógico, de despliegue, de datos, de seguridad.
Diagramas Mermaid obligatorios.

## Decisiones de diseño (ADR)
Cada decisión con: contexto, alternativas evaluadas, decisión, consecuencias.

## Patrones aplicados
CQRS, Event Sourcing, Hexagonal, etc. Con justificación.

## Superficie de seguridad
Autenticación, autorización, secrets, OWASP top 10.

## Restricciones de infraestructura
Hosting, CI/CD, monitoreo, limits.
- Pipeline de echo: herramientas de cada paso (setup, build, static, dynamic, E2E).
  Ver [echo system](../../echo-system.md).
- Distribución de hooks: qué pasos del echo corren en pre-commit vs pre-push
- Presupuesto de tiempo para hooks (si aplica)
- Umbral de cobertura obligatorio (o métrica alternativa si coverage no aplica)
- Carpeta de artifacts: nombre, ruta, entrada en .gitignore.
  Ver [sistema de artifacts](../../artifact-system.md).
- Catálogo de tipos de artifact del proyecto
- Mapa de generación: script → destino → paso del echo
- Excepciones documentadas (artifacts no redireccionables, pasos no-op)

## Trazabilidad
Cada decisión traza a spec.md (qué requisito resuelve).

## Metadata
- Fecha de creación
- Estado: borrador | revisado | aprobado
- Revisores: [roles que aprobaron]
```

> **42010** define el concepto de *viewpoints* — perspectivas desde las
> cuales se describe la arquitectura (stakeholders, concerns, views). No
> impone un formato específico, solo exige que cada viewpoint tenga
> stakeholders identificados, concerns que aborda, y convenciones de
> modelado. Esto se alinea con nuestro concepto de "lentes" del equipo.

---

### 4. `tasks.md` — Desglose de Tareas

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Implementation (preparación) |
| **Respaldo ISO** | **ISO 21502 sec 7.6** (Schedule Management — descomposición en actividades) |
| **Respaldo adicional** | PMBOK "Define Activities" (Activity List + Activity Attributes). ISO 21511 (WBS) es un nivel ARRIBA — cubre deliverables, no tasks. |
| **Propósito** | Desglosar el diseño en unidades de trabajo ejecutables, ordenadas por dependencias |
| **Owner** | Dev Lead (desglose técnico, secuencia y dependencias) |
| **Consumido por** | Fase de handoff, modo ejecución |

**Mapeo a ISO 21502 sec 7.6 y PMBOK Define Activities**:

| Concepto del estándar | Nuestro equivalente en `tasks.md` |
|----------------------|----------------------------------|
| Activity (unidad de trabajo programable) | Tarea con ID único |
| Activity Attributes (descripción, tipo, predecessors) | Descripción + dependencias + archivos afectados |
| Activity Dependencies (FS/FF/SS/SF) | Dependencias (IDs de tareas previas) |
| Milestone (punto de verificación) | Gate implícito en el grafo de dependencias |
| Duration estimate | Estimación de complejidad (S/M/L) |

> **Distinción clave**: el WBS (PMI Practice Standard, ISO 21511)
> descompone **deliverables** — "qué se entrega". `tasks.md` descompone
> **actividades** — "qué se ejecuta". Son niveles diferentes:
>
> ```plaintext
> WBS (deliverable) → Work Package → Activity (nuestra tarea)
> ISO 21511            PMI WBS        ISO 21502 sec 7.6 / PMBOK Define Activities
> ```
>
> Nuestro `tasks.md` vive en el nivel de Activity, no de WBS.

**Contenido mínimo** (alineado a ISO 21502 sec 7.6 + PMBOK Activity List):

```markdown
# Tasks: {nombre del proyecto}

## Tareas
Cada tarea con:
- ID único                               ← Activity ID
- Título                                 ← Activity name
- Descripción (qué hacer)               ← Activity Attributes
- Dependencias (IDs de tareas previas)   ← Activity Dependencies
- Criterios de aceptación (given/when/then) ← Verification criteria
- Estimación de complejidad (S/M/L)      ← Duration estimate
- Archivos afectados (si se conocen)     ← Activity Attributes (resources)

## Orden de ejecución                    ← Schedule (dependency graph)
Grafo de dependencias resuelto.

## Metadata
- Fecha de creación
- Estado: borrador | revisado | aprobado
- Total de tareas, estimación agregada
- Iteración y metodología vigente
```

> **Corrección**: la versión anterior declaraba `tasks.md` como
> "artefacto nativo ágil sin estándar." Esto era impreciso. El artefacto
> como documento standalone no tiene estándar propio, pero el MECANISMO
> de descomposición que implementa SÍ está respaldado por ISO 21502 sec 7.6
> (Schedule Management) y PMBOK "Define Activities." La estructura de
> contenido (actividades con dependencias, atributos, estimaciones) está
> formalmente definida en ambos estándares.

---

### 5. `handoff.md` — Contrato de Transición

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Transition |
| **Respaldo ISO** | **ISO/IEC/IEEE 15289** (transition information item) + **ISO/IEC/IEEE 29119-3** (test documentation) |
| **Propósito** | Contrato autocontenido entre planificación y ejecución. Quien lo lea puede actuar sin hacer preguntas. |
| **Owner** | TPM (compila bajo instrucción del SM) |
| **Consumido por** | Modo ejecución (orquestador + subAgents) |

**Contenido mínimo** (alineado a 15289 transition + 29119-3 testPlan):

```markdown
# Handoff: {nombre del proyecto}

## Resumen ejecutivo
Qué se construye y por qué, en 3-5 oraciones.

## Stack y arquitectura
Referencia a design.md, decisiones clave resumidas.

## Tareas a ejecutar
- Referencia a tasks.md, orden de ejecución, dependencias
- DAG completo de workItems con dependencias (FS/SS/FF)
- Lanes paralelos pre-calculados (campo `lane` de cada workItem)
- Ruta crítica identificada
- Blockers conocidos
- `execution_state` por workItem (ver abajo)

## Estrategia de pruebas
Qué tipo de pruebas, cobertura esperada, herramientas.

## Criterios de aceptación globales
Qué debe ser verdad para que el proyecto se considere completo.

## Contrato de métricas
Tier activo (`strict` | `standard` | `relaxed` | `custom`), herramientas
externas esperadas por lenguaje detectado, overrides de threshold si
el tier es `custom` (ver [contrato de
métricas](../../execution/contracts.md#contrato-de-métricas)).

## Restricciones de ejecución
Convenciones del repo (AGENTS.md), reglas de commits, hooks,
compliance del echo (ver [echo system](../../echo-system.md)).

## Contexto que NO se incluye
Qué se decidió NO hacer y por qué (para evitar scope creep).

## Documentación operativa esperada (condicional)
> Solo si el proyecto tiene servicios vivos, CLI con comandos,
> integraciones externas, o cualquier superficie que un usuario
> necesite operar post-entrega.

- Qué documentación operativa debe producirse durante la ejecución
- Formato esperado (ops-runbook.md, README de uso, guía CLI, etc.)
- Audiencia (NOC/Ops, usuario final, equipo de desarrollo)
- Si no aplica: declarar explícitamente "sin documentación operativa requerida"

## Metadata
- Fecha de generación
- Artefactos fuente: [idea.md, spec.md, design.md, tasks.md]
- Estado: generado | entregado | en ejecución | completado
```

> **Nota sobre los estados**: Estos estados son específicos del ciclo de
> vida del handoff y complementan la state machine universal de
> artefactos (draft → review → approved).

### `execution_state` — claiming semantics para lanes paralelos

Cada workItem del handoff lleva un campo `execution_state` que permite
a múltiples ejecutores reclamar tareas sin pisarse entre lanes:

```markdown
## execution_state (por workItem)
- id: {workItem id}
- status: pending | claimed | done
- claimed_by: {identificador del ejecutor} (solo si status = claimed|done)
- claimed_at: {timestamp} (solo si status = claimed|done)
- lane: {nombre del lane al que pertenece}
```

| Estado | Significado | Quién lo cambia |
|--------|-------------|-----------------|
| `pending` | Sin reclamar, disponible para cualquier ejecutor cuyas dependencias (`depends_on`) estén satisfechas | Default al generar el handoff |
| `claimed` | Un ejecutor la tomó y está trabajando en ella | El ejecutor, al iniciar |
| `done` | Completada y verificada | El ejecutor, al finalizar (o el gate de verificación) |

Un workItem con `depends_on` no resuelto NUNCA puede pasar a `claimed`,
sin importar el estado de su lane. Dos ejecutores no pueden reclamar el
mismo workItem — el segundo intento de claim sobre un item ya
`claimed`/`done` es rechazado por la herramienta de ejecución.

### `metrics_tier` — contrato de calidad activo

Cada handoff declara el tier de métricas que rige el proyecto (ver
[contrato de métricas](../../execution/contracts.md#contrato-de-métricas)),
resolviendo el gap de que el tier se mencionaba como parte del
contrato del handoff sin tener un campo propio:

```markdown
## metrics_tier
- tier: strict | standard | relaxed | custom
- tools: {lenguaje detectado: herramienta esperada por métrica}
  (ej: TypeScript → Stryker + ESLint complexity + madge;
       Python → mutmut + radon + import-linter)
- overrides: thresholds específicos que reemplazan los defaults del
  tier (solo si tier = custom)
```

| Campo | Obligatorio | Qué garantiza |
|-------|-------------|----------------|
| `tier` | Sí | Qué fila de la tabla de [contracts.md](../../execution/contracts.md#contrato-de-métricas) aplica (mutation score, CRAP, complejidad, tamaño de módulo) |
| `tools` | Sí | Qué herramienta externa por lenguaje detectado ejecuta cada métrica (ver [Orquestación de Métricas](../../echo-system.md#orquestación-de-métricas-virgil)) |
| `overrides` | Solo si `tier: custom` | Thresholds específicos que reemplazan los defaults del tier — requiere aprobación del MIM |

### Reglas de validación de `virgil handoff lint`

`virgil handoff lint` es el gate mecánico que corre antes de la
confirmación del MIM (ver [Fase 5](../behavior/phases.md#fase-5--generar-handoff)).
Valida, sin juicio subjetivo:

| Regla | Falla si |
|-------|----------|
| ACs con ID | Algún AC referenciado en `tareas a ejecutar` no tiene ID único trazable a `spec.md` |
| Tareas con deps | Un workItem declara `depends_on` a un ID que no existe en el DAG |
| Sin ciclos | El grafo de dependencias contiene un ciclo |
| Refs a spec/design | El handoff referencia una decisión de `design.md` o un AC de `spec.md` que no existe en esos artefactos |
| `execution_state` inicial | Algún workItem no tiene `execution_state` con `status: pending` al generarse (todo workItem nuevo nace `pending`, nunca `claimed`/`done`) |
| Lanes consistentes | Un workItem declara un `lane` que no aparece en la lista de lanes del handoff |
| `metrics_tier` declarado | El handoff no declara `metrics_tier` con un `tier` válido (`strict`, `standard`, `relaxed` o `custom`) |

Si `virgil handoff lint` falla, el SM no presenta el handoff al MIM —
regresa al TPM con la lista de errores para corrección antes de reintentar.

> **Nota**: La sección de documentación operativa conecta el handoff con
> operation. Si el handoff declara documentación esperada,
> la Fase Accept de execution DEBE verificar que existe antes de certificar.
> Proyectos sin superficie operativa (librerías, paquetes, entregables
> únicos) declaran "sin documentación operativa requerida" y Accept omite
> esta verificación.

---

> **El handoff es el CONTRATO entre modos**. Cuando el modo ejecución lo
> recibe, debe poder operar sin consultar otros artefactos de planificación
> excepto como referencia de detalle. La autocontención es la propiedad
> clave — validable mecánicamente por el TPM.

---

### 6. `ops-runbook.md` — Guía Operativa (Handoff a NOC/Ops)

| Atributo | Valor |
|----------|-------|
| **Proceso 15288** | Operation + Maintenance |
| **Respaldo ISO** | **ISO/IEC 20000-1/2** (IT Service Management) + **ITIL 4** (Service Transition) |
| **Propósito** | Todo lo que un equipo de operaciones necesita para mantener el sistema vivo sin recurrir a los desarrolladores |
| **Owner** | DevSecOps (infraestructura y monitoreo) → Dev Lead (troubleshooting técnico) |
| **Consumido por** | Equipo de operaciones, NOC, on-call |

**Contenido mínimo** (alineado a ITIL 4 Service Transition + Google SRE PRR):

```markdown
# Ops Runbook: {nombre del proyecto}

## Descripción del servicio
Qué hace, quién lo usa, SLA esperado.

## Arquitectura de despliegue
Infraestructura, servicios, dependencias externas.
Diagrama de despliegue (Mermaid obligatorio).

## Monitoreo y alertas
Métricas clave, dashboards, umbrales de alerta.

## Procedimientos operativos
- Deploy / rollback
- Escalamiento horizontal/vertical
- Backup / restore
- Rotación de secrets

## Troubleshooting
Problemas conocidos y soluciones (known-error database).

## Contactos y escalación
Quién es responsable, cadena de escalación.

## Metadata
- Fecha de generación
- Versión del servicio
- Estado: borrador | validado | en producción
```

> **Nota sobre los estados**: Estos estados son específicos del ciclo de
> vida del opsRunbook y complementan la state machine universal de
> artefactos (draft → review → approved).

> **Este artefacto cierra el ciclo completo**: de la idea hasta la
> operación en producción. ISO 20000 define los requisitos formales del
> sistema de gestión de servicios. ITIL 4 provee el checklist práctico
> de transición. Google SRE Production Readiness Review es la
> implementación más concreta del gate "¿está listo para producción?".

> **Nota de aplicabilidad**: El schema anterior aplica a proyectos con
> servicios desplegados. Para otros tipos de proyecto: CLI →
> documentación de flags, exit codes y ejemplos de uso; librería →
> referencia de API, guía de migración y changelog. El estándar de
> respaldo para estos casos es IEEE 1063 (Software User Documentation).

[↑ Contenido](#contenido)

---

## Metodología como Capa Intercambiable

Para el sistema de metodología intercambiable (gobierno, lock por
iteración, protocolo de cambio), ver [methodology.md](methodology.md).

[↑ Contenido](#contenido)

---

## Resumen de Estándares Referenciados

| Estándar | Nombre | Qué aporta al modelo |
|----------|--------|---------------------|
| ISO/IEC/IEEE 15288 | System Life Cycle Processes | La columna vertebral: secuencia de etapas del ciclo de vida |
| ISO/IEC/IEEE 12207 | Software Life Cycle Processes | Overlay específico para software (procesos técnicos + organizacionales) |
| ISO/IEC/IEEE 15289 | Content of Life-Cycle Information Items | El catálogo: qué documentos produce cada proceso, contenido mínimo |
| ISO/IEC/IEEE 29148 | Requirements Engineering | Contenido de `idea.md` (sec 9.3 BRS) y `spec.md` (StRS, SyRS, SRS) |
| ISO/IEC/IEEE 42010 | Architecture Description | Contenido de `design.md`: viewpoints, stakeholders, concerns |
| IEEE 1016 | Software Design Descriptions | Contenido de `design.md`: design entities, rationale |
| ISO 21502 | Project Management Guidance (sec 7.6) | Mecanismo de descomposición de `tasks.md`: actividades, dependencias, duración |
| PMBOK 7th ed. | Define Activities (process) | Respaldo de `tasks.md`: Activity List, Activity Attributes, Milestones |
| IEEE 828 | Configuration Management | Trazabilidad entre artefactos (transversal) |
| ISO/IEC/IEEE 29119-3 | Test Documentation | Contenido de pruebas en `handoff.md`: testPlan, strategy |
| IEEE 1063 | Software User Documentation | Documentación de usuario (si aplica) |
| ISO/IEC 20000-1/2 | IT Service Management | Contenido de `ops-runbook.md`: SLAs, monitoreo, procedimientos |
| ITIL 4 | Service Transition | Checklist práctico de transición a operaciones |
| Google SRE PRR | Production Readiness Review | Gate práctico: ¿listo para producción? |

### Frameworks de referencia para gobierno de metodología

| Framework | Qué valida |
|-----------|-----------|
| Disciplined Agile (PMI) | WoW variable por equipo, evolucionable via GCI. Goal constante, práctica variable. |
| Scrumban (Ladas) | Transición gradual Scrum→Kanban. Items sobreviven sin conversión. |
| SAFe | Diferentes metodologías por nivel. Artefactos cruzan boundaries sin cambio de formato. |
| PMBOK 7th ed. | Tailoring: approach seleccionable por deliverable, no solo por proyecto. |
| ISO 15288/12207 | Proceso outcomes fijos, life-cycle model tailorable. Information items independientes del modelo. |

[↑ Contenido](#contenido)
