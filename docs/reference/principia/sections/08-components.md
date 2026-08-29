<!-- Virgil Principia
section_id: "5"
title: "What parts compose it"
source: "principia/constitution.md"
source_lines: [419, 459]
layer: components
constitutional: true
actors: []
glossary_terms: [Ledger, Provider, ProviderRegistry, CapabilityRegistry, HandoffService, HandoffStateMachine, AuditService, RefResolver, InsightEngine, PollingLoop, ContextProviderPort, SnapshotProviderPort, ObservableProviderPort]
depends_on: ["4", "1", "2"]
referenced_by: ["6", "8", "10"]
keywords:
  - components
  - core services
  - providers
  - port hierarchy
  - Ledger
  - HandoffService
  - AuditService
  - ProviderRegistry
  - CapabilityRegistry
  - RefResolver
  - InsightEngine
  - PollingLoop
  - methodology-agnostic
  - universal quality
editorial_additions: [context_paragraph, synonym_note]
-->

> **Context:** The distinction between "universal quality" (core services) and "ceremony" (methodology configuration) stems from the two layers of principles described in section 4: governance (the rules of the game) and architecture (the rules of construction). This component catalog is where both layers materialize into concrete pieces.

## 5. What parts compose it

[↑ Back to index](../README.md)

```mermaid
flowchart TD
    subgraph CORE["Core Services (methodology-agnostic, universal quality)"]
        LEDGER["LedgerService\nEvents, transitions,\nimmutable JSONL history"]
        HANDOFF["HandoffService\nCreates structured handoffs\nfor AI agents"]
        HSM["HandoffStateMachine\nLifecycle enforcement,\npreconditions, break-glass"]
        AUDIT["AuditService\nGuardrail verification,\ngap classification"]
        REF["RefResolverService\nCross-provider ref resolution\nvia SemanticRef URIs"]
    end

    subgraph PROVIDERS["Providers (interchangeable, plugin pattern)"]
        PORT["ContextProviderPort\nBase contract: kind, health, refs"]
        SNAP["SnapshotProviderPort\nPoint-in-time reads"]
        OBS["ObservableProviderPort\nEvent streaming via RxJS"]
        PREG["ProviderRegistry\nRuntime lookup by kind"]
        CREG["CapabilityRegistry\nStatus tracking"]
    end

    subgraph MODES["Operation Modes"]
        ACTIVE["Active Mode\nCLI commands"]
        REACTIVE["Reactive Mode\nPollingLoop + CursorStore\n+ EventRouter"]
        PROACTIVE["Proactive Mode\nInsightEngine\n+ Analyzers"]
    end

    CORE --> PROVIDERS
    MODES --> PREG

    style CORE fill:#47a,stroke:#333,color:#fff
    style PROVIDERS fill:#a74,stroke:#333,color:#fff
    style MODES fill:#7a4,stroke:#333,color:#fff
```

Each component has a clear responsibility. The core services impose universal
quality invariants (audit checks, state machine preconditions, ledger
recording) regardless of methodology. The handoff lifecycle is currently
methodology-agnostic by design.

> **[Architectural provision — not yet implemented]** Methodology extensions
> (analogous to the originally envisioned Method Packs) could define additional
> ceremony: how many roles participate, which ceremonial gates get compressed,
> how iteration works. Quality belongs to the core services; ceremony would
> belong to the methodology extension. An extension could define ADDITIONAL
> quality mechanisms but could not reduce the core's minimum gates.

> **[Architectural provision — not yet implemented]** RAG (RetrievalProjection)
> as a vectorized read projection over provider snapshots. Currently, providers
> deliver raw snapshots; the RAG layer would add semantic retrieval and bounded
> context compilation.
