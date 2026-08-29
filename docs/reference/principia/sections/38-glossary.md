<!-- Virgil Principia
section_id: "glossary"
title: "Glossary"
source: "principia/constitution.md"
source_lines: [1763, 1814]
layer: reference
constitutional: true
actors: []
glossary_terms: [AGENTS.md, ARCH, ArtifactRepository, ArtifactStoreAdapter, Binding Layer, Break-glass, buildArtifactSet, bumpDependencies, circuitBreaker, codebaseMemory, compositeAgent, complianceByDesign, consumerRag, ContextBrief, ContextCompiler, CRAP score, delegationContract, devRag, DogmaRef, droppableCode, Echo System, EchoRun, EvidenceIngestion, FastForward, HostAdapter, Kernel, Ledger, MIM, mutation domain, Method Pack, PDC, PlanningGapDetected, ProjectRef, RAG, re-sync, RetrievalProjection, RunContext, securityAudit, SM, sourceRevision, safeToAutoDelete, Supply Chain Integrity, TPM, TraceabilityGraph, versionPinning, watermark]
depends_on: []
referenced_by: []
keywords:
  - AGENTS.md
  - ARCH
  - ArtifactRepository
  - ArtifactStoreAdapter
  - Binding Layer
  - Break-glass
  - buildArtifactSet
  - bumpDependencies
  - circuitBreaker
  - codebaseMemory
  - compositeAgent
  - complianceByDesign
  - consumerRag
  - ContextBrief
  - ContextCompiler
  - CRAP score
  - delegationContract
  - devRag
  - DogmaRef
  - droppableCode
  - Echo System
  - EchoRun
  - EvidenceIngestion
  - FastForward
  - HostAdapter
  - Kernel
  - Ledger
  - MIM
  - mutation domain
  - Method Pack
  - PDC
  - PlanningGapDetected
  - ProjectRef
  - RAG
  - re-sync
  - RetrievalProjection
  - RunContext
  - securityAudit
  - SM
  - sourceRevision
  - safeToAutoDelete
  - Supply Chain Integrity
  - TPM
  - TraceabilityGraph
  - versionPinning
  - watermark
editorial_additions: [context_paragraph]
-->

> **Context:** This glossary collects the canonical definitions of the terms used throughout the Principia. Each entry references the section where the term is defined in depth.

## Glossary

| Term | Definition |
|---------|-----------|
| AGENTS.md | Discoverability file published by Virgil in the consuming project following the Open Agentic Standard. Contains operational rules injected for the agent (section 1) |
| ARCH | Architectural-alignment gate within the certification pipeline. Validates conformance with architecture principles (section 7e, 11d) |
| ArtifactRepository | Kernel component that manages deliverables, revisions and provenance. Not to be confused with ArtifactStoreAdapter (external adapter) nor with the informal term "ArtifactStore" (section 5) |
| ArtifactStoreAdapter | Adapter that translates persistence and retrieval between the Kernel and the external storage system (repo-docs, Jira, etc.). Not to be confused with ArtifactRepository (internal Kernel component) (section 5, 3b) |
| Binding Layer | Three trust levels for contracts: declared (defined), inferred (derived from evidence), verified (confirmed by execution) (section 7d) |
| Break-glass | Emergency lane for P1 incidents that compresses ceremony with MIM authority and mandatory post-hoc certification (section 11e) |
| buildArtifactSet | Set of build artifacts produced by an EchoRun, unambiguously linked to a sourceRevision (section 7b) |
| bumpDependencies | Three-step maintenance cycle (security fix → update check → security fix) to update exact dependencies without introducing vulnerabilities (section 7h) |
| circuitBreaker | Mechanism that stops delegations after 3 consecutive failures and escalates to the MIM (section 9c) |
| codebaseMemory | Structural code graph derived from AST. Complements the RAG with queries about relationships between code entities (section 8f) |
| compositeAgent | Sequence of independent invocations (testEngineer → Implementor → fitnessFunction) orchestrated under a common label within an isolated mutation domain; worktree is one possible implementation (section 7c) |
| complianceByDesign | Data-shape assertions integrated into development. Covers exclusively technical data controls (section 7g) |
| consumerRag | RAG projection of the consuming project in Consumption Mode. Complements devRag. See dual RAG (section 8c) |
| ContextBrief | Context package compiled by the ContextCompiler to feed a delegation. Includes selected deliverables with origin traceability (section 9a) |
| ContextCompiler | Kernel component that selects and compiles relevant deliverables into a ContextBrief. Judgment step with documented hallucination surface (section 9a) |
| CRAP score | Change Risk Anti-Patterns — metric that combines complexity and coverage to assess change risk |
| delegationContract | Contract of 6 required fields accompanying every SM delegation: identity (role, tier, constraints), scope, verifiable objective, resolved input, output schema, rules injected as text (section 9c) |
| devRag | Virgil's RAG projection in Development Mode. Complements consumerRag. See dual RAG (section 8c) |
| DogmaRef | Identity reference to the operational dogma (docs/). Resolved by the HostAdapter at the start of every invocation. Field contract defined in the protocol layer, out of scope for this Principia (section 3b) |
| droppableCode | Code with 0% coverage in appTests. Must be removed or justify its existence with a documented exception. See safeToAutoDelete for safe mechanical removal (section 7f) |
| Echo System | 5-step pipeline for the execution of each phase: Setup → Build → Static → Dynamic → E2E (section 7a) |
| EchoRun | Concrete instance of Echo System execution that produces a buildArtifactSet linked to a sourceRevision (section 7b) |
| EvidenceIngestion | Kernel component that ingests evidence produced by executions and records it in the Ledger with origin traceability (section 5) |
| FastForward | Certainty gradient (FF-1 to FF-4) that allows compressing planning ceremony when observable evidence supports it (section 3a) |
| HostAdapter | Adapter that translates discovery, invocation and envelopes between the host (Claude, GPT, etc.) and the Virgil Kernel. Declares capabilities and degradations (section 3b, 5) |
| Kernel | Virgil's ceremony-agnostic core. Contains Ledger, TraceabilityGraph, ArtifactRepository, EvidenceIngestion, ContextCompiler, RAG (section 5) |
| Ledger | Immutable record of the project's events, transitions and history |
| MIM | Mind in the Machine: human with final authority over the project. Approves, rejects, breaks ties. Its veto is non-negotiable (vocabulary) |
| Method Pack | Ceremony layer mounted on top of the Kernel. Defines roles, flows and additional gates. Scrum Pack is the only one implemented (section 5) |
| mutation domain | Isolation domain where an execution lane operates without interfering with other concurrent lanes. Must provide isolated filesystem, conflict detection at integration, and per-lane revision identity. Worktrees are the reference implementation (section 7c, 11c) |
| PDC | Post-Delegation Checkpoint: orchestration-coherence safeguard (ECHO → VERIFY → MARK → DECIDE). It is not a certification gate (section 3b) |
| PlanningGapDetected | Escalation signal when execution detects a planning defect. Triggers re-planning |
| ProjectRef | Identity reference to the target project. Resolved by the HostAdapter at the start of every invocation. Field contract defined in the protocol layer, out of scope for this Principia (section 3b) |
| RAG | Read-optimized projection over deliverables and documentation. Not a source of truth — it is reconstructible (section 8e) |
| re-sync | Process that updates a projection (RAG or codebaseMemory) to the current HEAD and advances its watermark. Can be triggered explicitly, via PR with deltas, or via post-merge hook (section 8c) |
| RetrievalProjection | Formal name of the Kernel component that implements the read projections. Technical synonym for RAG in the context of the component catalog (section 5) |
| RunContext | Execution context of the active run/change. Resolved by the HostAdapter at the start of every invocation. Field contract defined in the protocol layer, out of scope for this Principia (section 3b) |
| securityAudit | Blocking gate of Echo step 1 (Setup): vulnerability scan over the dependency tree. The Kernel enforces execution; the Method Pack defines the severity threshold (section 7h) |
| SM | Session Manager: orchestrating agent that coordinates the session. Compiles context, delegates work, runs the PDC. It is not a Scrum Master (vocabulary) |
| safeToAutoDelete | Subset of droppableCode that meets mechanical safe-removal criteria: no live dependents, no observed execution in N cycles, no transitive coverage. Enables automatic mechanical removal (section 7f) |
| sourceRevision | Commit SHA that identifies the code revision that produced a buildArtifactSet. Must be reachable from the watermark for certification to be valid (section 7b, 8c) |
| Supply Chain Integrity | Three dependency invariants: exact version pinning, security audit as a gate, and bumpDependencies as a controlled update cycle (section 7h) |
| TPM | Task Progress Monitor: lightweight agent that scans states and reports to the SM without mutating deliverables (vocabulary) |
| TraceabilityGraph | Derived projection connecting intent → decision → work → evidence. Reconstructible from the Ledger (section 5, 8e) |
| versionPinning | Invariant requiring exact versions (no ranges) for all dependencies and the dependency manager. Guarantees absolute reproducibility (section 7h) |
| watermark | Revision (commit SHA) against which a projection (RAG or codebaseMemory) was last built or synchronized. Exclusive Kernel property. Certification gate: sourceRevision must be reachable from watermark in the commit graph (section 8c) |
