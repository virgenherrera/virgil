<!-- Virgil Principia
section_id: "index"
title: "Index"
source: "principia/constitution.md"
source_lines: [1, 60]
layer: navigation
constitutional: false
actors: []
glossary_terms: []
depends_on: []
referenced_by: []
keywords:
  - index
  - table of contents
  - Principia documents
  - navigation
editorial_additions: [context_paragraph, navigation_note]
-->

> **Navigation Note:** This index reproduces the original table of contents from constitution.md. Internal anchors point to sections of constitution.md, not to this file. For navigation between RAG chunks, use the [README](../README.md).

# Virgil — Founding Principle

Anchor document. Everything Virgil is, does, and why it does it.
If anything contradicts this document, this document wins.

## Index

### In this document
- [1. What Virgil is](#1-what-virgil-is)
  - [1a. Interpretive anti-drift rule](#1a-interpretive-anti-drift-rule)
- [2. How it is (structure)](#2-how-it-is-structure)
- [3. How it acts](#3-how-it-acts)
  - [3a. Lifecycle of a project](#3a-lifecycle-of-a-project)
  - [3b. Flow of an invocation](#3b-flow-of-an-invocation)
- [4. Why it acts this way](#4-why-it-acts-this-way)
  - [4a. Governance — HOW it is governed](#4a-governance--how-it-is-governed)
  - [4b. Architecture — HOW it is built](#4b-architecture--how-it-is-built)
  - [4c. How the two layers relate](#4c-how-the-two-layers-relate)
- [5. What parts compose it](#5-what-parts-compose-it)
- [6. How the parts interact](#6-how-the-parts-interact)
  - [6a. Actors and modes](#6a-actors-and-modes)
  - [6b. Separation of concerns](#6b-separation-of-concerns)
  - [6c. Fundamental invariant](#6c-fundamental-invariant)
- [7. How it guarantees quality](#7-how-it-guarantees-quality)
  - [7a. Echo System — deterministic pipeline](#7a-echo-system--deterministic-pipeline)
  - [7b. Deliverables vs Build Artifacts](#7b-deliverables-vs-build-artifacts)
  - [7c. Macro Red/Green/Refactor — batch TDD](#7c-macro-redgreenrefactor--batch-tdd)
  - [7d. Testing Matrix — boundary model](#7d-testing-matrix--boundary-model)
  - [7e. QA / Acceptance Gates — certification](#7e-qa--acceptance-gates--certification)
  - [7f. droppableCode — coverage as a tool](#7f-droppablecode--coverage-as-a-tool)
  - [7g. complianceByDesign — compliance as a side effect](#7g-compliancebydesign--compliance-as-a-side-effect)
  - [7h. Supply Chain Integrity — secure dependencies](#7h-supply-chain-integrity--secure-dependencies)
  - [Closed cycle](#closed-cycle)
- [8. Where knowledge lives](#8-where-knowledge-lives)
  - [8a. ArtifactStore — persistence](#8a-artifactstore--persistence)
  - [8b. Namespace separation](#8b-namespace-separation)
  - [8c. Dual RAG — context DBMS](#8c-dual-rag--context-dbms)
  - [8d. Tiered visibility](#8d-tiered-visibility)
  - [8e. Memoization](#8e-memoization)
  - [8f. codebaseMemory — structural code graph](#8f-codebasememory--structural-code-graph)
- [9. How context flows](#9-how-context-flows)
  - [9a. ContextBrief](#9a-contextbrief)
  - [9b. Two delivery patterns](#9b-two-delivery-patterns)
  - [9c. Delegation: SM → sub-agent → PDC](#9c-delegation-sm--sub-agent--pdc)
- [10. How it recovers](#10-how-it-recovers)
- [11. How it executes](#11-how-it-executes)
  - [11a. Execution pipeline](#11a-execution-pipeline)
  - [11b. Contracts first — parallelism enabler](#11b-contracts-first--parallelism-enabler)
  - [11c. Git strategy — isolation and traceability](#11c-git-strategy--isolation-and-traceability)
  - [11d. Mechanical verification — conditional human review](#11d-mechanical-verification--conditional-human-review)
  - [11e. Accept/Reject — certification by gates](#11e-acceptreject--certification-by-gates)
  - [11f. Evidence as queryable data](#11f-evidence-as-queryable-data)
- [12. How it operates (optional)](#12-how-it-operates-optional)
  - [12a. Activation and role](#12a-activation-and-role)
  - [12b. Operation adapters](#12b-operation-adapters)
  - [12c. Escalation](#12c-escalation)
- [Self-reference rule](#self-reference-rule)
- [Glossary](#glossary)
- [Authority note](#authority-note)
