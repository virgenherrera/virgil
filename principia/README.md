# Virgil — Founding Principle

Anchor document. Everything Virgil is, does, and why it does it.
If anything contradicts the [constitution](constitution.md), the constitution wins.

> This README is a navigation index over the RAG-friendly chunks
> under `sections/`. The constitutional source of truth is
> [`constitution.md`](constitution.md) (sealed, immutable).

## Index

### Vocabulary and actors
- [Actor vocabulary](sections/01-vocabulary.md) — MIM, SM, TPM, PDC, compositeAgent

### 1. What Virgil is
- [What Virgil is](sections/02-identity.md) — knowledge/control plane, identity
- [Interpretive anti-drift rule](sections/03-anti-drift.md) — prevention of semantic drift

### 2. How it is (structure)
- [Three-layer structure](sections/04-structure.md) — Principia, Kernel, Method Pack

### 3. How it acts
- [Lifecycle of a project](sections/05-lifecycle.md) — state machine, FastForward, PlanningGapDetected
- [Flow of an invocation](sections/06-invocation-flow.md) — deterministic pipeline, PDC

### 4. Why it acts this way
- [Governance and architecture](sections/07-governance-architecture.md) — GP-1..GP-6 + A1..A9

### 5. What parts compose it
- [Component catalog](sections/08-components.md) — Kernel, Method Pack, Ledger, RAG

### 6. How the parts interact
- [Interaction model](sections/09-interaction-model.md) — actors, modes, separation of concerns, invariant

### 7. How it guarantees quality
- [Echo System](sections/10-echo-system.md) — 5-step pipeline
- [Deliverables vs Build Artifacts](sections/11-deliverables-vs-artifacts.md) — EchoRun, buildArtifactSet, sourceRevision
- [Macro Red/Green/Refactor](sections/12-red-green-refactor.md) — batch TDD
- [compositeAgent and mutation domains](sections/13-composite-agent.md) — execution isolation
- [Testing Matrix](sections/14-testing-matrix.md) — boundary model by tier
- [Binding Layer and traceability](sections/15-binding-layer.md) — declared, inferred, verified
- [QA / Acceptance Gates](sections/16-qa-gates.md) — certification, CRAP score
- [droppableCode](sections/17-droppable-code.md) — coverage as a tool
- [complianceByDesign](sections/18-compliance-by-design.md) — compliance as a side effect
- [versionPinning and securityAudit](sections/19-supply-chain-pinning.md) — Supply Chain Integrity
- [bumpDependencies](sections/20-supply-chain-bump.md) — controlled update cycle

### 8. Where knowledge lives
- [Where knowledge lives](sections/21-knowledge-storage.md) — ArtifactStore, namespaces
- [RAG as DBMS](sections/22-rag-dbms.md) — queryable projection
- [Watermark and re-sync](sections/23-rag-watermark.md) — projection integrity
- [devRag vs consumerRag](sections/24-rag-dual.md) — dual RAG
- [Visibility and memoization](sections/25-visibility-memoization.md) — tiered visibility
- [codebaseMemory concept](sections/26-codebase-memory-concept.md) — structural AST graph
- [codebaseMemory construction](sections/27-codebase-memory-construction.md) — build and maintenance

### 9. How context flows
- [Context flow](sections/28-context-flow.md) — ContextBrief, delegationContract, PDC

### 10. How it recovers
- [Recovery](sections/29-recovery.md) — persisted state, reconstruction

### 11. How it executes
- [Execution pipeline](sections/30-execution-pipeline.md) — contracts first, parallelism
- [Git strategy](sections/31-git-strategy.md) — isolation, traceability
- [Mechanical verification](sections/32-mechanical-verification.md) — conditional human review
- [Accept/Reject routing](sections/33-accept-reject.md) — certification by gates
- [Break-glass](sections/34-break-glass.md) — emergency lane
- [Queryable evidence](sections/35-evidence-queryable.md) — evidence as data

### 12. How it operates (optional)
- [Operation phase](sections/36-operation.md) — activation, adapters, escalation

### Authority
- [Authority and self-reference](sections/37-authority.md) — constitutional rule

### Glossary
- [Glossary](sections/38-glossary.md) — 46 canonical terms

## Integrity validation

```bash
./principia/validate-chunks.sh
```

Verifies watermark, file existence, dependency graph
integrity and glossary consistency.

## Layer taxonomy

The [manifest](manifest.yaml) classifies each chunk into one of 15 layers:
navigation, identity, structure, lifecycle, principles, components,
interaction, quality, knowledge, context, recovery, execution,
operation, authority, reference. Use for filtering and routing in the CLI.

---

**Navigation**: [Index of the original overview](sections/00-navigation.md) ·
[Manifest (CLI discovery)](manifest.yaml)
