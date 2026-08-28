<!-- Virgil Principia
section_id: "3a"
title: "Lifecycle of a project"
source: "principia/constitution.md"
source_lines: [237, 290]
layer: lifecycle
constitutional: false
actors: [MIM, SM]
glossary_terms: [FastForward, PlanningGapDetected]
depends_on: []
referenced_by: [7c-rgr, 11a-11b, 3b]
keywords:
  - lifecycle
  - state machine
  - state machine
  - PlanningGapDetected
  - FastForward
  - planning
  - execution
  - handoff
editorial_additions: [context_paragraph]
-->

> **Context:** MIM (the human who directs product decisions) and SM (the orchestrating agent that delegates the work) are the actors that operate this state machine. The lifecycle is configurable by Method Pack — the Kernel imposes mechanical convergence, but the specific ceremony of each phase can vary depending on the active Pack.

## 3. How it acts

[↑ Back to index](../README.md)

### 3a. Lifecycle of a project

Each phase iterates until its deliverable is consolidated. It is not a
straight line — it is a loop that converges toward a well-bounded handoff.

```mermaid
stateDiagram-v2
    [*] --> Idea

    state PLANNING {
        Idea --> Requirements : consolidated
        Requirements --> Design : complete
        Design --> Tasks : approved
        Tasks --> Handoff : refined

        Idea --> Idea : question, refine
        Requirements --> Requirements : iterate with MIM
        Requirements --> Idea : gap detected
        Design --> Requirements : gap detected
        Tasks --> Design : gap detected
    }

    Handoff --> Execution : handoff approved

    state EXECUTION {
        Execution --> Verify : candidate implementation
    }

    Verify --> Deliver : certified
    Deliver --> Operation : if applicable

    note right of PLANNING : Virgil IMPOSES mechanical<br/>convergence via state machine.<br/>SM ORCHESTRATES delegations.<br/>MIM DIRECTS product decisions.
    note right of Execution : Virgil OBSERVES<br/>emits PlanningGapDetected<br/>if there are gaps
    note right of Operation : Virgil ASSISTS<br/>reactive, optional
```

The project's state machine (via virgil_status) indicates what
phase each feature and the overall project is in. A feature does not advance
until its deliverable is consolidated.

**PlanningGapDetected**: if execution discovers that an approved
deliverable is ambiguous, contradictory or insufficient, it emits this signal,
blocks only the affected scope and returns control to planning. Execution
never rewrites an approved deliverable.

**FastForward**: the SM does not always run all phases with the same
ceremony. It evaluates a certainty gradient (FF-1 to FF-4) over the
existing context and compresses the phases proportionally — from
full ceremony (score 0-2) to direct execution (score 6-8). The SM computes the score based on observable, verifiable state. The scoring formula and its inputs plus result are recorded in the Ledger, making it auditable. FastForward compresses planning CEREMONY (deliberation phases), not Kernel quality gates — certification gates (R/G/R, mutation testing, fitness functions) run in full at ALL FastForward levels, from FF-1 to FF-4.
