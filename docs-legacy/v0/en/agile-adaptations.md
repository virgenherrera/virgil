---
id: agile-adaptations
title: "Agile Adaptations"
mode: framework
type: reference
tags: [agile, principles, manifesto, session-manager]
---

# Adaptations to the Agile Manifesto for AI Agents

← [Index](README.md)

> This framework borrows vocabulary from Scrum and Agile but operates
> with a prescriptive delegation model. The reason: AI agents lack
> cross-session persistence, self-organization capacity, and
> interpersonal trust. These differences require conscious adaptation
> of certain agile principles, not abandonment.

---

## Contents

- [Honesty About the Trade-off](#honesty-about-the-trade-off)
- [12 Principles Compliance Table](#12-principles-compliance-table)
- [Key Adaptations and Justification](#key-adaptations-and-justification)
- [Nomenclature Clarification](#nomenclature-clarification)
- [Framework Scope](#framework-scope)
- [Documented Exceptions](#documented-exceptions)

---

## Honesty About the Trade-off

Virgil is not Scrum. Described precisely, it is **Stage-Gate with
Scrum vocabulary**: sequential phases with mandatory approval gates,
instead of time-boxed sprints with continuous delivery to the
customer. This is a deliberate design decision, not an accidental
deviation that needs excusing.

The reason is principle 4 of the Governing Dogma (**"The agent
operates under constraint, not under trust"**, see
[overview.md](overview.md#governing-dogma)): an AI agent with no
persistent memory or accumulated reputation cannot self-organize like
a trusted human team — it needs mechanical gates that verify every
transition before advancing. Scrum assumes teams that negotiate their
own process on a foundation of mutual trust; Virgil assumes agents
that execute contracts because, between instances with no
persistence, there is nothing else to trust. Mechanical governance
replaces trust — not because it is preferable in the abstract, but
because it is the only option available.

The cost of that choice is speed. The planning pipeline (idea →
spec → design → tasks → handoff) is sequential by design and only
delivers executable code once Phase 5 closes. `fastForward` (see
[overview.md](overview.md#fastforward)) mitigates the cost by
compressing phases when certainty is high (F1-F4 score ≥ 6/8), but
does not eliminate it: even in the best case, there is still a
minimal pipeline between "idea" and "first line of code". Calling
this Scrum would be imprecise and would create cadence expectations
the framework does not meet. It is more useful — and more honest —
to recognize it as Stage-Gate adapted to an executor that needs
explicit constraints, not self-organization freedom.

[↑ Contents](#contents)

---

## 12 Principles Compliance Table

| # | Principle | Compliance | Observation |
|---|-----------|------------|-------------|
| 1 | Satisfy the customer through continuous delivery of valuable software | Partial | The planning pipeline is sequential (idea → handoff) before any executable line of code exists; `fastForward` compresses that sequence but does not eliminate it. The cadence of **external delivery** (to the MIM/customer) is one full cycle (Phase 1 through Phase 8), not continuous. |
| 2 | Welcome late changes to requirements | Partial | Mechanisms exist (`transition` to draft, re-convocation, `verifyConsistency`) but are operationally costly. |
| 3 | Deliver working software frequently | Partial (internal cadence) | There is frequent iteration **within** execution (commits, Red-Green-Refactor cycles), but that is **internal development** cadence, not customer delivery — it must not be confused with principle 1. Verifiable delivery to the MIM happens at the Accept Phase (execution) and Phase 7 (planning) gates, not on every commit. |
| 4 | Business people and developers must work together daily | Well served | The MIM interacts across all phases via the SM. There is no "wall" between business and development. |
| 5 | Build projects around motivated individuals and give them trust | Adapted | Trust is replaced by systemic verification (PDC). See justification below. |
| 6 | Face-to-face conversation as the most efficient communication method | Not applicable | AI agents have no "face". The SM as a structured intermediary is necessary. See justification below. |
| 7 | Working software is the primary measure of progress | Well served | boundaryModel (App + E2E) with a traceability chain AC → testPlan → testContract → testImplementation → Coverage. |
| 8 | Sustainable development pace | Not addressed | No explicit mention of load limits or agent throttling. |
| 9 | Continuous technical excellence and good design | Excellent | Refactor with 7 review dimensions, ADRs, ISO backing, quality gates. |
| 10 | Simplicity — maximizing the amount of work not done | Well served | fastForward avoids unnecessary phases, activation tiers scale ceremony, roles are condensed. |
| 11 | Self-organizing teams produce the best architectures | Adapted | Prescription via contract is necessary because AI agents do not share context. See justification below. |
| 12 | Regular reflection and adaptation | Excellent | Phase 8 (Retrospective) complete with stop/start/continue/agreements. Feeds the next cycle. |

> **Note on the internal vs. external cadence distinction**: an earlier
> version of this table rated principle 3 as "Well served" citing
> frequent commits, while rating principle 1 as "Partial" citing a long
> pipeline before the first delivery — an inconsistency, because both
> principles speak of delivery to the customer, not internal team
> activity. Frequent commits within an execution iteration are not
> "frequently delivered software" in the sense of the Agile Manifesto;
> they are development cadence. Both rows now reflect the **external**
> cadence (how often the MIM/customer receives something verifiable),
> which is what the Manifesto measures.

[↑ Contents](#contents)

---

## Key Adaptations and Justification

### Principle 5 — Trust replaced by verification

The original principle assumes individuals with persistent identity,
accumulated reputation, and intrinsic motivation. AI agents have none
of these properties:

- They do not remember previous interactions (no cross-session
  persistence).
- They have no reputation — every instance starts from scratch.
- They have no motivation — they fulfill contracts, not personal
  goals.

The framework replaces "trust" with the **PDC (Post-Delegation
Checkpoint)**: after every delegation, the SM verifies coherence
(ECHO), coverage (VERIFY), persists the result (MARK), and decides
the next step (DECIDE). This is not distrust — it is the functional
equivalent of trust in a context where identity does not persist.

### Principle 6 — Structured communication instead of face-to-face

The original principle favors high-bandwidth communication between
humans. AI agents do not communicate with each other — they receive
contracts and return results. The SM acts as an intermediary that:

- Translates the MIM's intent into delegationContracts with mandatory
  fields.
- Receives structured status reports from subAgents.
- Uses the PDC as the post-return verification protocol.

The "conversation" between agents is an exchange of contracts and
results, not a dialogue. This is an inherent limitation, not a design
choice.

### Principle 11 — Prescription necessary due to lack of shared context

Self-organized human teams work because they share implicit context:
team culture, prior decisions, preferences, trust relationships. AI
agents share nothing:

- Each subAgent receives context bounded by contract.
- They do not know what other subAgents are doing.
- They cannot negotiate with each other or adjust their approach in
  real time.

The command-and-control model via rigid contracts is a necessary
compensation. The SM centralizes the coordination that, in a human
team, would be distributed. This is not an ideological choice — it is
the only way to produce coherent results when the participants do
not share state.

[↑ Contents](#contents)

---

## Nomenclature Clarification

### SM is not a Scrum Master

In this framework, **SM stands for Session Manager (Orchestrator)**,
not Scrum Master as defined by the Scrum Guide. The differences are
substantial:

| Aspect | Scrum Master (Scrum Guide) | SM (this framework) |
|--------|------------------------------|----------------------|
| Function | Servant leader, facilitates the team | Facade, controls gates and delegation |
| Authority | Has no authority over the product | Decides convocation, validates outputs, blocks progress |
| Production | Does not produce artifacts | Produces no content, but controls transitions |
| Team | Serves the self-organized team | Commands subAgents with no autonomy |

The framework's SM has functions a Scrum Master does not: controlling
gates, deciding role convocation, validating outputs, and blocking
premature progress. It is closer to a **controller** than to a
facilitator.

### PO is not the classic Product Owner

The MIM is the true product decision-maker: knows what they want, and
has the vision and the budget. The PO role in this framework functions
as a **Business Analyst proxy** that:

- Formalizes the MIM's ideas into structured artifacts.
- Challenges ideas with business questions.
- Prioritizes requirements and defines ACs.
- Has no final authority — the MIM decides.

### "Contract" is not "contract negotiation"

The Agile Manifesto values "customer collaboration over contract
negotiation". This framework uses the word "contract" constantly —
`delegationContracts`, `handoff.md` as the contract between planning
and execution, the Contract-First phase in execution — which, read
quickly, seems to contradict that preference. It does not: these are
two distinct meanings of the same word.

- The Manifesto's "contract negotiation" is a **commercial** contract
  between customer and vendor: scope fixed in advance, costly
  changes, adversarial negotiation over who bears the risk.
- Virgil's "contracts" are **technical, agent-to-agent** contracts:
  specifications that prevent a subAgent without shared context from
  misinterpreting its task. They are compiled from artifacts the MIM
  has already approved — they are not negotiated with the MIM.

The MIM never negotiates a contract with the framework; they approve
artifacts, and the framework compiles technical contracts from them to
coordinate agents that do not share state. The collision is one of
vocabulary, not of intent — but it deserves to be stated explicitly so
as not to plant the reading that the framework prioritizes the
contract over collaboration with the MIM.

[↑ Contents](#contents)

---

## Framework Scope

This framework is optimized for the **"1 human (MIM) + N AI agents"**
case. The phases, artifacts, and gates are reusable for human teams,
but the delegation model (rigid contracts, the SM as the sole
interaction point, PDC as the verification mechanism) must be adapted
for contexts where participants have persistence, autonomy, and direct
communication capability.

[↑ Contents](#contents)

---

## Documented Exceptions

The framework is prescriptive by design, but it recognizes that
legitimate cases exist where a specific rule does not apply (e.g., a
pure algorithmic library where the App boundary collapses to the
public API).

The MIM can declare a documented exception to any framework rule. The
exception must specify:

| Field | Description |
|-------|-------------|
| Affected rule | Exact reference to the rule being overridden |
| Justification | Why the rule does not apply in this context |
| Scope | Which iterations, artifacts, or phases the exception covers |
| Termination condition | When the exception stops applying |

Exceptions are documented in `handoff.md` (constraints section) and
the SM honors them during execution. The exception does not remove
the rule — it suspends it for a bounded context.
