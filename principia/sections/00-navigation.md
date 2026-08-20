<!-- Virgil Principia
section_id: "index"
title: "Indice"
source: "principia/overview.md"
source_lines: [1, 60]
layer: navigation
constitutional: false
actors: []
glossary_terms: []
depends_on: []
referenced_by: []
keywords:
  - indice
  - tabla de contenidos
  - documentos del Principia
  - navegacion
-->

# Virgil — Principio Fundador

Documento ancla. Todo lo que Virgil es, hace y por que lo hace.
Si algo contradice este documento, este documento gana.

## Indice

### En este documento
- [1. Que es Virgil](#1-que-es-virgil)
  - [1a. Regla anti-drift interpretativa](#1a-regla-anti-drift-interpretativa)
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
  - [11c. Git strategy — aislamiento y trazabilidad](#11c-git-strategy--aislamiento-y-trazabilidad)
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

