<!-- Virgil Principia
section_id: "8"
title: "Where knowledge lives"
source: "principia/constitution.md"
source_lines: [951, 1024]
layer: knowledge
constitutional: true
actors: []
glossary_terms: [ArtifactStore, RAG, codebaseMemory, watermark, re-sync, ArtifactStoreAdapter]
depends_on: ["5", "7b"]
referenced_by: ["8c-dbms", "8c-watermark", "8c-dual", "8d-8e", "8f-concept", "8f-construction"]
keywords:
  - ArtifactStore
  - RAG
  - codebaseMemory
  - watermark
  - re-sync
  - namespaces
  - persistence
  - context DBMS
  - structural graph
editorial_additions: [context_paragraph]
-->

> **Context:** Introduces the three knowledge-management concerns in Virgil — persistence (ArtifactStore), documentary query (RAG) and structural understanding of code (codebaseMemory) — which are developed in detail in the following subsections (8c-8f).

## 8. Where knowledge lives

Three separate concerns: where deliverables are PERSISTED
(ArtifactStore), how deliverables and documentation are QUERIED (RAG),
and how the code's structure is UNDERSTOOD (codebaseMemory). RAG
acts as the documentary context's DBMS; codebaseMemory acts as the
code's structural graph. Both projections are **versioned**:
they declare a watermark (the revision against which they are synchronized)
and can detect drift relative to the repository's current state.

The canonical contextualization path is to query the appropriate
tool with bounded queries, not to load complete files into the
prompt. Reading files directly is not prohibited but has
a cost: it consumes tokens unnecessarily and operates outside
Virgil's traceability. Any modification that generates new commits
outside Virgil's flow moves HEAD beyond the watermark and
requires a **re-sync** that updates the projection. No
certification is valid if the RAG projection is not synchronized
with the revision being certified.

### 8a. ArtifactStore — persistence

```mermaid
flowchart TD
    VIRGIL["Virgil Kernel"]
    VIRGIL -->|"persists via"| ASA["ArtifactStoreAdapter\n(contract)"]

    ASA --> DEFAULT["repo-docs (default)\n{target}/docs/virgil/\nlocal, RAG-friendly,\nno external dependencies"]

    ASA --> EXT["External adapters (TBD)"]

    subgraph EXTERNOS["Options via contract"]
        JIRA["Jira"]
        CONF["Confluence"]
        AZURE["Azure DevOps"]
        ASANA["Asana"]
        GH["GitHub Projects/Issues"]
        OTROS["Others\n(via adapter contract)"]
    end

    EXT --> EXTERNOS

    style DEFAULT fill:#4a4,stroke:#333,color:#fff
    style EXT fill:#777,stroke:#333,color:#fff
    style EXTERNOS fill:#777,stroke:#333,color:#fff
```

### 8b. Namespace separation

```mermaid
flowchart LR
    subgraph VIRGIL_DOCS["Virgil/docs/"]
        DOGMA["Virgil Dogma\nread-only for consumers\nnormative and versioned"]
    end

    subgraph TARGET_DOCS["{target}/docs/"]
        MANAGED["{target}/docs/virgil/\nManaged namespace\nVIRGIL writes here"]
        CORPUS["{target}/docs/**\nProject corpus\nread-only for Virgil\n(opt-in for RAG)"]
    end

    DOGMA -.-|"are NOT the same"| TARGET_DOCS
    MANAGED -.-|"bounded\nwrite scope"| CORPUS

    style DOGMA fill:#47a,stroke:#333,color:#fff
    style MANAGED fill:#4a4,stroke:#333,color:#fff
    style CORPUS fill:#777,stroke:#333,color:#fff
```

> **Invariant**: `Virgil/docs/` (dogma) and `{target}/docs/` (project)
> share the name `docs` but do NOT share identity, ownership or
> write policy.
