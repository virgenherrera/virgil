---
id: planning/artifacts/schemas
title: "Artifact Schemas"
mode: planning
type: reference
tags: [schemas, idea, spec, design, tasks, handoff, ops-runbook, iso, operational-documentation]
---

# Schemas of the 6 Artifacts

← [Main Index](../../README.md) | [Planning](../README.md) | [Artifacts](README.md)

---

## Contents

- [The 6 Universal Artifacts](#the-6-universal-artifacts)
- [Methodology as an Interchangeable Layer](#methodology-as-an-interchangeable-layer)
- [Summary of Referenced Standards](#summary-of-referenced-standards)

---

## The 6 Universal Artifacts

Each artifact has: purpose, standard backing, minimum content, who
produces it, who consumes it, and ownership rules.

### 1. `idea.md` — Business/Mission Analysis

| Attribute | Value |
|----------|-------|
| **15288 Process** | Business/Mission Analysis |
| **ISO backing** | **ISO/IEC/IEEE 29148 sec 9.3 (BRS)** — light tailoring permitted by sec 9.3.1 |
| **Additional backing** | IEEE 1362 (ConOps) — absorbed as Annex A/B of 29148 |
| **Purpose** | Capture the problem, the expected value, the known constraints, and the open questions |
| **Owner** | Produces: PO (formulates and structures). Co-produces: SM (formulates questions, does not write content) |
| **Consumed by** | Spec phase |

**Mapping to 29148 sec 9.3 (BRS)**:

| 29148 BRS Section | Our equivalent in `idea.md` |
|-------------------|--------------------------------|
| sec 9.3.2 Business purpose | Problem |
| sec 9.3.3 Business scope | Expected value (scope) |
| sec 9.3.5 Major stakeholders | End user, stakeholders |
| sec 9.3.7 Mission, goals, objectives | Expected value (objectives) |
| sec 9.3.12 Business operational constraints | Known constraints |
| sec 9.3.16 High-level operational concept | Product core flow |
| sec 9.3.19 Project constraints | Timebox, budget, mandatory stack |

**Minimum content** (tailoring of 29148 sec 9.3 — permitted by sec
9.3.1: *"Organization of the content such as the order and section
structure may be selected in accordance with the project's
information management policies"*):

```markdown
# Idea: {project name}

## Problem                         ← 29148 sec 9.3.2 Business purpose
What needs to be solved and why.

## Expected value                 ← 29148 sec 9.3.7 Mission/goals/objectives
For whom and what benefit.

## Known constraints               ← 29148 sec 9.3.12 + sec 9.3.19
Timebox, budget, mandatory stack, platform, etc.

## High-level operational concept  ← 29148 sec 9.3.16 High-level operational concept
Product core flow, main scenarios.

## Decisions made
Active roles for this project, activation tier, methodology.

## Open questions
What remains to be resolved before specifying.

## Metadata
- Creation date
- Input source (vague idea, challenge, ticket, partial spec)
- Status: draft | approved
- Iteration and current methodology
```

> **Correction**: a previous version of this document declared
> `idea.md` as "free territory with no standard." This was
> **incorrect**. 29148 sec 9.3 (BRS) directly covers this artifact.
> IEEE 1362 (ConOps), thought to be dead, was absorbed as Annexes A/B
> of 29148 and remains active. Our format is a light tailoring —
> more concise than the full BRS, but aligned to its normative
> sections.

---

### 2. `spec.md` — Requirements Specification

| Attribute | Value |
|----------|-------|
| **15288 Process** | Stakeholder Needs & Requirements Definition + System Requirements Definition |
| **ISO backing** | **ISO/IEC/IEEE 29148** (Requirements Engineering) |
| **Purpose** | Define WHAT gets built: acceptance criteria, API contracts, constraints, scope boundaries |
| **Owner** | PO (defines value and priority) → QA (validates testability) |
| **Consumed by** | Design phase, verification phase |

**Minimum content** (aligned to 29148 — simplified StRS/SRS):

```markdown
# Spec: {project name}

## Functional requirements
List with acceptance criteria (given/when/then).

## Non-functional requirements
Performance, security, accessibility, compatibility.

## Interface contracts
APIs, schemas, communication protocols.

## Constraints and assumptions
What is taken for granted, what will NOT be done.

## Prioritization
MoSCoW or equivalent.

## Traceability
Each requirement traces to idea.md (which problem it solves).

## Metadata
- Creation date
- Status: draft | reviewed | approved
- Reviewers: [roles that approved]
```

> **29148 defines 3 levels**: StRS (stakeholder), SyRS (system), SRS
> (software). For simple projects, the 3 are merged into a single
> `spec.md`. For complex projects, they can be split. ISO 15289
> allows merging/splitting documents — the content is what matters.

---

### 3. `design.md` — Architecture and Design Description

| Attribute | Value |
|----------|-------|
| **15288 Process** | Architecture Definition + Design Definition |
| **ISO backing** | **ISO/IEC/IEEE 42010** (Architecture Description) + **IEEE 1016** (Software Design) |
| **Purpose** | Define HOW it gets built: architecture, patterns, tradeoffs, technical decisions |
| **Owner** | Dev Lead (architecture and patterns) → DevSecOps (security and infra) |
| **Consumed by** | Tasks phase, execution phase |

**Minimum content** (aligned to 42010 viewpoints + 1016 design
entities):

```markdown
# Design: {project name}

## Technology stack
Language, framework, database, external services.
Justification for each choice.

## System architecture
Viewpoints (42010): logical, deployment, data, security.
Mermaid diagrams mandatory.

## Design decisions (ADR)
Each decision with: context, alternatives evaluated, decision, consequences.

## Applied patterns
CQRS, Event Sourcing, Hexagonal, etc. With justification.

## Security surface
Authentication, authorization, secrets, OWASP top 10.

## Infrastructure constraints
Hosting, CI/CD, monitoring, limits.
- Echo pipeline: tools for each step (setup, build, static, dynamic, E2E).
  See [echo system](../../echo-system.md).
- Hook distribution: which echo steps run in pre-commit vs. pre-push
- Time budget for hooks (if applicable)
- Mandatory coverage threshold (or alternative metric if coverage does not apply)
- Artifacts folder: name, path, entry in .gitignore.
  See [artifact system](../../artifact-system.md).
- Project artifact type catalog
- Generation map: script → destination → echo step
- Documented exceptions (non-redirectable artifacts, no-op steps)

## Traceability
Each decision traces to spec.md (which requirement it resolves).

## Metadata
- Creation date
- Status: draft | reviewed | approved
- Reviewers: [roles that approved]
```

> **42010** defines the concept of *viewpoints* — perspectives from
> which the architecture is described (stakeholders, concerns,
> views). It does not impose a specific format, it only requires that
> each viewpoint have identified stakeholders, concerns it addresses,
> and modeling conventions. This aligns with our concept of team
> "lenses."

---

### 4. `tasks.md` — Task Breakdown

| Attribute | Value |
|----------|-------|
| **15288 Process** | Implementation (preparation) |
| **ISO backing** | **ISO 21502 sec 7.6** (Schedule Management — decomposition into activities) |
| **Additional backing** | PMBOK "Define Activities" (Activity List + Activity Attributes). ISO 21511 (WBS) is one level ABOVE — it covers deliverables, not tasks. |
| **Purpose** | Break down the design into executable units of work, ordered by dependencies |
| **Owner** | Dev Lead (technical breakdown, sequencing, and dependencies) |
| **Consumed by** | Handoff phase, execution mode |

**Mapping to ISO 21502 sec 7.6 and PMBOK Define Activities**:

| Standard concept | Our equivalent in `tasks.md` |
|----------------------|----------------------------------|
| Activity (schedulable unit of work) | Task with a unique ID |
| Activity Attributes (description, type, predecessors) | Description + dependencies + affected files |
| Activity Dependencies (FS/FF/SS/SF) | Dependencies (IDs of prior tasks) |
| Milestone (checkpoint) | Implicit gate in the dependency graph |
| Duration estimate | Complexity estimate (S/M/L) |

> **Key distinction**: the WBS (PMI Practice Standard, ISO 21511)
> decomposes **deliverables** — "what gets delivered." `tasks.md`
> decomposes **activities** — "what gets executed." They are
> different levels:
>
> ```plaintext
> WBS (deliverable) → Work Package → Activity (our task)
> ISO 21511            PMI WBS        ISO 21502 sec 7.6 / PMBOK Define Activities
> ```
>
> Our `tasks.md` lives at the Activity level, not the WBS level.

**Minimum content** (aligned to ISO 21502 sec 7.6 + PMBOK Activity
List):

```markdown
# Tasks: {project name}

## Tasks
Each task with:
- Unique ID                              ← Activity ID
- Title                                  ← Activity name
- Description (what to do)               ← Activity Attributes
- Dependencies (IDs of prior tasks)      ← Activity Dependencies
- Acceptance criteria (given/when/then)  ← Verification criteria
- Complexity estimate (S/M/L)            ← Duration estimate
- Affected files (if known)              ← Activity Attributes (resources)

## Execution order                       ← Schedule (dependency graph)
Resolved dependency graph.

## Metadata
- Creation date
- Status: draft | reviewed | approved
- Total tasks, aggregate estimate
- Iteration and current methodology
```

> **Correction**: a previous version declared `tasks.md` as a "native
> agile artifact with no standard." This was imprecise. The artifact
> as a standalone document has no standard of its own, but the
> decomposition MECHANISM it implements IS backed by ISO 21502 sec
> 7.6 (Schedule Management) and PMBOK "Define Activities." The
> content structure (activities with dependencies, attributes,
> estimates) is formally defined in both standards.

---

### 5. `handoff.md` — Transition Contract

| Attribute | Value |
|----------|-------|
| **15288 Process** | Transition |
| **ISO backing** | **ISO/IEC/IEEE 15289** (transition information item) + **ISO/IEC/IEEE 29119-3** (test documentation) |
| **Purpose** | Self-contained contract between planning and execution. Whoever reads it can act without asking questions. |
| **Owner** | TPM (compiles under SM instruction) |
| **Consumed by** | Execution mode (orchestrator + subAgents) |

**Minimum content** (aligned to 15289 transition + 29119-3 testPlan):

```markdown
# Handoff: {project name}

## Executive summary
What is being built and why, in 3-5 sentences.

## Stack and architecture
Reference to design.md, summarized key decisions.

## Tasks to execute
- Reference to tasks.md, execution order, dependencies
- Complete workItem DAG with dependencies (FS/SS/FF)
- Pre-calculated parallel lanes (each workItem's `lane` field)
- Identified critical path
- Known blockers
- `execution_state` per workItem (see below)

## Testing strategy
What type of tests, expected coverage, tools.

## Global acceptance criteria
What must be true for the project to be considered complete.

## Metrics contract
Active tier (`strict` | `standard` | `relaxed` | `custom`), expected
external tools per detected language, threshold overrides if the
tier is `custom` (see [metrics
contract](../../execution/contracts.md#metrics-contract)).

## Execution constraints
Repo conventions (AGENTS.md), commit rules, hooks, echo compliance
(see [echo system](../../echo-system.md)).

## Context that is NOT included
What was decided NOT to do and why (to avoid scope creep).

## Expected operational documentation (conditional)
> Only if the project has live services, a CLI with commands,
> external integrations, or any surface a user needs to operate
> post-delivery.

- What operational documentation must be produced during execution
- Expected format (ops-runbook.md, usage README, CLI guide, etc.)
- Audience (NOC/Ops, end user, development team)
- If not applicable: explicitly declare "no operational documentation required"

## Metadata
- Generation date
- Source artifacts: [idea.md, spec.md, design.md, tasks.md]
- Status: generated | delivered | in execution | completed
```

> **Note on states**: These states are specific to the handoff's
> lifecycle and complement the universal artifact state machine
> (draft → review → approved).

### `execution_state` — Claiming Semantics for Parallel Lanes

Each workItem in the handoff carries an `execution_state` field that
allows multiple executors to claim tasks without stepping on each
other across lanes:

```markdown
## execution_state (per workItem)
- id: {workItem id}
- status: pending | claimed | done
- claimed_by: {executor identifier} (only if status = claimed|done)
- claimed_at: {timestamp} (only if status = claimed|done)
- lane: {name of the lane it belongs to}
```

| Status | Meaning | Who changes it |
|--------|-------------|-----------------|
| `pending` | Unclaimed, available to any executor whose dependencies (`depends_on`) are satisfied | Default when the handoff is generated |
| `claimed` | An executor has taken it and is working on it | The executor, when starting |
| `done` | Completed and verified | The executor, when finishing (or the verification gate) |

A workItem with an unresolved `depends_on` can NEVER move to
`claimed`, regardless of its lane's status. Two executors cannot claim
the same workItem — the second claim attempt on an item that is
already `claimed`/`done` is rejected by the execution tool.

### `metrics_tier` — Active Quality Contract

Each handoff declares the metrics tier governing the project (see
[metrics
contract](../../execution/contracts.md#metrics-contract)),
resolving the gap where the tier used to be mentioned as part of the
handoff contract without having its own field:

```markdown
## metrics_tier
- tier: strict | standard | relaxed | custom
- tools: {detected language: expected tool per metric}
  (e.g. TypeScript → Stryker + ESLint complexity + madge;
       Python → mutmut + radon + import-linter)
- overrides: specific thresholds that replace the tier's defaults
  (only if tier = custom)
```

| Field | Mandatory | What it guarantees |
|-------|-------------|----------------|
| `tier` | Yes | Which row of the [contracts.md](../../execution/contracts.md#metrics-contract) table applies (mutation score, CRAP, complexity, module size) |
| `tools` | Yes | Which external tool per detected language runs each metric (see [Metrics Orchestration](../../echo-system.md#metrics-orchestration-virgil)) |
| `overrides` | Only if `tier: custom` | Specific thresholds that replace the tier's defaults — requires MIM approval |

### `virgil handoff lint` Validation Rules

`virgil handoff lint` is the mechanical gate that runs before MIM
confirmation (see [Phase
5](../behavior/phases.md#phase-5--generate-handoff)). It validates,
without subjective judgment:

| Rule | Fails if |
|-------|-------|
| ACs with ID | Any AC referenced in `tasks to execute` does not have a unique ID traceable to `spec.md` |
| Tasks with deps | A workItem declares `depends_on` referencing an ID that does not exist in the DAG |
| No cycles | The dependency graph contains a cycle |
| Refs to spec/design | The handoff references a `design.md` decision or a `spec.md` AC that does not exist in those artifacts |
| Initial `execution_state` | Any workItem does not have `execution_state` with `status: pending` when generated (every new workItem is born `pending`, never `claimed`/`done`) |
| Consistent lanes | A workItem declares a `lane` that does not appear in the handoff's lane list |
| `metrics_tier` declared | The handoff does not declare `metrics_tier` with a valid `tier` (`strict`, `standard`, `relaxed`, or `custom`) |

If `virgil handoff lint` fails, the SM does not present the handoff to
the MIM — it goes back to the TPM with the list of errors for
correction before retrying.

> **Note**: The operational documentation section connects the
> handoff with operation. If the handoff declares expected
> documentation, the Accept Phase of execution MUST verify it exists
> before certifying. Projects without an operational surface
> (libraries, packages, one-off deliverables) declare "no operational
> documentation required" and Accept skips this verification.

---

> **The handoff is the CONTRACT between modes**. When execution mode
> receives it, it must be able to operate without consulting other
> planning artifacts except as a detail reference. Self-containment
> is the key property — mechanically validatable by the TPM.

---

### 6. `ops-runbook.md` — Operations Guide (Handoff to NOC/Ops)

| Attribute | Value |
|----------|-------|
| **15288 Process** | Operation + Maintenance |
| **ISO backing** | **ISO/IEC 20000-1/2** (IT Service Management) + **ITIL 4** (Service Transition) |
| **Purpose** | Everything an operations team needs to keep the system alive without resorting to the developers |
| **Owner** | DevSecOps (infrastructure and monitoring) → Dev Lead (technical troubleshooting) |
| **Consumed by** | Operations team, NOC, on-call |

**Minimum content** (aligned to ITIL 4 Service Transition + Google
SRE PRR):

```markdown
# Ops Runbook: {project name}

## Service description
What it does, who uses it, expected SLA.

## Deployment architecture
Infrastructure, services, external dependencies.
Deployment diagram (Mermaid mandatory).

## Monitoring and alerts
Key metrics, dashboards, alert thresholds.

## Operational procedures
- Deploy / rollback
- Horizontal/vertical scaling
- Backup / restore
- Secrets rotation

## Troubleshooting
Known problems and solutions (known-error database).

## Contacts and escalation
Who is responsible, escalation chain.

## Metadata
- Generation date
- Service version
- Status: draft | validated | in production
```

> **Note on states**: These states are specific to the opsRunbook's
> lifecycle and complement the universal artifact state machine
> (draft → review → approved).

> **This artifact closes the full cycle**: from the idea to
> production operation. ISO 20000 defines the formal requirements of
> the service management system. ITIL 4 provides the practical
> transition checklist. Google's Production Readiness Review is the
> most concrete implementation of the "is it ready for production?"
> gate.

> **Applicability note**: The schema above applies to projects with
> deployed services. For other project types: CLI → flags, exit
> codes, and usage examples documentation; library → API reference,
> migration guide, and changelog. The backing standard for these
> cases is IEEE 1063 (Software User Documentation).

[↑ Contents](#contents)

---

## Methodology as an Interchangeable Layer

For the interchangeable methodology system (governance, per-iteration
lock, change protocol), see [methodology.md](methodology.md).

[↑ Contents](#contents)

---

## Summary of Referenced Standards

| Standard | Name | What it contributes to the model |
|----------|--------|---------------------|
| ISO/IEC/IEEE 15288 | System Life Cycle Processes | The backbone: sequence of life cycle stages |
| ISO/IEC/IEEE 12207 | Software Life Cycle Processes | Software-specific overlay (technical + organizational processes) |
| ISO/IEC/IEEE 15289 | Content of Life-Cycle Information Items | The catalog: which documents each process produces, minimum content |
| ISO/IEC/IEEE 29148 | Requirements Engineering | Content of `idea.md` (sec 9.3 BRS) and `spec.md` (StRS, SyRS, SRS) |
| ISO/IEC/IEEE 42010 | Architecture Description | Content of `design.md`: viewpoints, stakeholders, concerns |
| IEEE 1016 | Software Design Descriptions | Content of `design.md`: design entities, rationale |
| ISO 21502 | Project Management Guidance (sec 7.6) | Decomposition mechanism of `tasks.md`: activities, dependencies, duration |
| PMBOK 7th ed. | Define Activities (process) | Backing for `tasks.md`: Activity List, Activity Attributes, Milestones |
| IEEE 828 | Configuration Management | Traceability between artifacts (cross-cutting) |
| ISO/IEC/IEEE 29119-3 | Test Documentation | Test content in `handoff.md`: testPlan, strategy |
| IEEE 1063 | Software User Documentation | User documentation (if applicable) |
| ISO/IEC 20000-1/2 | IT Service Management | Content of `ops-runbook.md`: SLAs, monitoring, procedures |
| ITIL 4 | Service Transition | Practical checklist for transition to operations |
| Google SRE PRR | Production Readiness Review | Practical gate: ready for production? |

### Reference Frameworks for Methodology Governance

| Framework | What it validates |
|-----------|-----------|
| Disciplined Agile (PMI) | WoW variable per team, evolvable via GCI. Constant goal, variable practice. |
| Scrumban (Ladas) | Gradual Scrum→Kanban transition. Items survive without conversion. |
| SAFe | Different methodologies per level. Artifacts cross boundaries without format change. |
| PMBOK 7th ed. | Tailoring: selectable approach per deliverable, not just per project. |
| ISO 15288/12207 | Fixed process outcomes, tailorable life-cycle model. Information items independent of the model. |

[↑ Contents](#contents)
