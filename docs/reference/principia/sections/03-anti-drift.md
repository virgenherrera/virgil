<!-- Virgil Principia
section_id: "1a"
title: "Interpretive anti-drift rule"
source: "principia/constitution.md"
source_lines: [147, 191]
layer: identity
constitutional: true
actors: []
glossary_terms: [Echo System, EvidenceIngestion, Binding Layer, Ledger, TraceabilityGraph, PDC, Macro Red/Green/Refactor, build artifacts]
depends_on: [7a, 7b, 7e, 1]
referenced_by: []
keywords:
  - anti-drift
  - closed accountability cycle
  - Echo System
  - certification gates
  - canonical boundary
  - normative force
editorial_additions: [context_paragraph]
-->

> **Context:** This section establishes the interpretation rule that protects the Principia's constitutional mechanisms (defined in detail in 7a Echo System, 7b Deliverables vs Build Artifacts, and 7e QA/Acceptance Gates) against abstractions that would dilute them.

### 1a. Interpretive anti-drift rule

This document must be interpreted while preserving Virgil's **closed accountability cycle**. A reviewer — human or agent — must NOT abstract it into a generic framework of policies, observers, or interchangeable tooling if that abstraction eliminates or makes optional the mechanisms the Principia declares constitutional.

The canonical boundary is:

```text
planning deliverables
        ↓
R/G/R + Echo System
        ↓
canonical build artifacts
        ↓
EvidenceIngestion + Binding Layer
        ↓
certification gates
        ↓
Ledger / TraceabilityGraph
```

**These are NOT implementation details and are NOT overridable per project:**

- The five-step Echo System: Setup → Build → Static → Dynamic → E2E
- The order of Echo; scope can vary, the sequence cannot
- Macro Red/Green/Refactor and its independence per phase
- The existence of regenerable build artifacts as the canonical output of Echo
- The unambiguous association `EchoRun + sourceRevision + buildArtifactSet`
- EvidenceIngestion, Binding Layer and the Kernel's minimum quality gates
- The rule that certification is decided on evidence produced by the canonical path, not on the agent's claims

**These ARE substitutable/configurable as long as they preserve those contracts:**

- Concrete tools used within each Echo stage
- Commands, runners, scanners and CI/CD providers
- Triggers that fire Echo (hooks, CI, CD or other adapters)
- Git strategy, branch names, worktrees and commit conventions
- Physical location of build artifacts, as long as identity, provenance and reproducibility are preserved
- HostAdapter, ArtifactStoreAdapter, RAG backends and other extensions expressly defined by contract

**Anti-drift test:** if a reinterpretation allows Virgil to simply "observe whatever happened" and certify arbitrary evidence without going through Echo/build artifacts, that reinterpretation contradicts this Principia. Virgil is not a passive auditor: it defines the protocol by which execution acquires certifiable evidence.

**Deliberate normative force.** The Principia's absolute statements represent obligations of conformance and architectural direction, not descriptions of the current state of implementation. An AI or implementer must NOT: weaken them because a tool cannot fully enforce them today; replace them with a more generic abstraction; reinterpret foundational mechanisms as accidental details; or introduce operational caveats within the Principia when they belong to the Dogma or adapters. The current inability to enforce creates pending implementation work, not an exception to the principle.

> **Note on names:** `ECHO` within the PDC (ECHO → VERIFY → MARK → DECIDE) is the coherence-check step of the checkpoint. It is not the **Echo System** (Setup → Build → Static → Dynamic → E2E). They are distinct concepts even though they share a name.
