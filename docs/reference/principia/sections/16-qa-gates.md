<!-- Virgil Principia
section_id: "7e"
title: "QA / Acceptance Gates — certification"
source: "principia/constitution.md"
source_lines: [793, 814]
layer: quality
constitutional: true
actors: [QA]
glossary_terms: [mechanical gate, structured verification gate, ARCH, CERTIFIED]
depends_on: [7a, 7d-tiers, 3b, 4]
referenced_by: [11e-routing, 1a, 11a-11b, 11d]
keywords:
  - QA
  - acceptance gates
  - certification
  - mutation score
  - CRAP
  - CVE scan
  - coverage gate
  - architectural alignment
  - semantic comparison
  - escalate to phase
editorial_additions: [context_paragraph]
-->

> **Context:** Belongs to chapter 7 ("How it guarantees quality"). It describes the final gate that certifies the result by combining deterministic mechanical verifications (produced by the Echo System from 7a) with structured verification of architectural alignment, subject to the same epistemic demarcation described in section 3b of the Principia.

### 7e. QA / Acceptance Gates — certification

Certification combines deterministic mechanical gates (test pass/fail, mutation score, coverage, CRAP, CVE scan, module size) and structured verification gates (architectural alignment). Mechanical gates are binary: they pass or they do not. Structured verification gates (ARCH: implementation aligned with design.md) use documented, traceable semantic comparison, subject to the same demarcation as section 3b.

```mermaid
flowchart TD
    ECHO["Complete Echo\n5 green steps"] --> FUNC
    FUNC["Functional verification\nEvery AC has a\npassing test"] --> CONTRACT
    CONTRACT["Contract verification\nAPIs, schemas, interfaces\nhonor definitions"] --> COV
    COV["Coverage gate\nNo regression\nnew code covered"] --> METRICS
    METRICS["Quality metrics\nMutation score\nCRAP, complexity\ndependencies"] --> SEC
    SEC["Security\nScanner report\nzero criticals"] --> ARCH
    ARCH["Architectural alignment\n(structured verification)\nImplementation = design.md"] --> CERT

    CERT["CERTIFIED"]
    CERT -->|"approved"| DELIVER["Deliver"]
    CERT -->|"rejected"| ESCALATE["Escalate to\ncorresponding phase"]

    style CERT fill:#4a4,stroke:#333,color:#fff
    style ESCALATE fill:#c44,stroke:#333,color:#fff
```
