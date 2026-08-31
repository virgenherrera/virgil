# Virgil

## Mission

Virgil is a project's knowledge and control plane. It consolidates
context from multiple sources (docs, tickets, org, chat, source code)
via interchangeable providers and generates structured handoffs for
AI agents. It does not execute code.

## Architecture Map

Before any architectural decision, contract modification, or structural
change, consult sources of authority in this order:

| Layer | Document | Authority |
|-------|----------|-----------|
| Principia | `docs/reference/principia/constitution.md` | Constitutional. Sealed. Not overrideable. |
| Dogma | `docs/` | Normative. Derived from Principia. Can evolve. |
| Runtime | Source code in `src/` | Implementation. Conforms to Dogma and Principia. |

**Precedence**: Principia > Dogma > Runtime. If code contradicts the
Dogma, the code is wrong. If the Dogma contradicts the Principia, the
Dogma is wrong.

## Orientation

Before any work, run:

```
virgil status
```

This reports registered providers and their health. Use it to
understand what context sources are available.

## Toolchain

| Command | Purpose |
|---------|---------|
| `virgil status` | System health and provider connectivity |
| `virgil context [refs...]` | Resolve semantic refs across providers |
| `virgil handoff create` | Generate structured handoff from provider context |
| `virgil handoff list` | List existing handoffs |
| `virgil handoff show <id>` | Display handoff details |
| `virgil handoff transition <id> <state>` | Lifecycle state transition |
| `virgil handoff phase <id> [target]` | Advance execution sub-phase |
| `virgil audit <id>` | Run mechanical audit checks against guardrails |
| `virgil brief` | Generate or query the brief (RAG pipeline) |
| `virgil watch` | Start reactive polling loop |
| `virgil insights` | Run proactive analyzers |
| `virgil ledger [--handoff <id>]` | Query append-only event log |
| `virgil init` | Generate `.virgilrc.yaml` config template |
| `virgil doctor` | System health check (node, config, providers, tools) |
| `virgil version` | Print CLI version |

Semantic refs use the URI scheme `{kind}://{backend}/{id}`.
Five kinds: `dogma`, `ticket`, `org`, `sourcecode`, `chat`.

## Artifacts

Virgil generates artifacts under `.virgil/` in the working directory:

| Path | Content |
|------|---------|
| `.virgil/handoffs/{id}/` | Handoff files (TASK.md, CONTEXT.md, META.json, etc.) |
| `.virgil/ledger.jsonl` | Append-only event log |
| `.virgil/cursors.json` | Polling cursors for reactive mode |
| `.virgil/brief.json` | Machine-readable brief (RAG output) |
| `.virgil/brief.md` | Human-readable brief |

These artifacts persist in the **target project**, not in this
repository. They should be gitignored in the target project if
they are not meant to be shared.

## Commit Conventions

Each commit follows [Conventional Commits](https://www.conventionalcommits.org/).

```text
<type>: Title

Brief description.

- Action item 1.
- Action item n.
```

| Type | When to use |
|------|-------------|
| `feat` | New features or capabilities |
| `fix` | Bug fixes |
| `chore` | Tooling, config, dependencies, CI |
| `docs` | Documentation changes |
| `refactor` | Restructuring without behavior change |
| `test` | Test additions or corrections |

Rules:
- Subject line: imperative mood, lowercase, no trailing period, 72 chars max
- Body: brief description followed by bullet list of concrete changes
- No `Co-Authored-By` or AI attribution lines

## Judgment Boundaries

### NEVER (requires human authorization)

- Break-glass override without explicit instruction
- Transition handoff to `delivered` without audit PASS
- Delete or mutate ledger entries
- Modify principia sections without explicit instruction
- Push to main or production branches without authorization

### ASK (propose and wait)

- Create handoffs for new work
- Transition handoffs between states
- Architectural changes to provider contracts or ports
- Changes to the state machine or audit checks
- New dependencies

### ALWAYS (safe to proceed)

- Run `virgil status` to check system health
- Query ledger entries
- Resolve semantic refs
- Run insights and analyzers

## Invariants

- **Global ownership ≠ global context injection**: query narrow
  (`virgil context <ref>`), never dump inventory into prompts
- **Planning boundary**: Virgil manages planning only. After tasks
  reach `done`, stop and report. Implementation requires explicit
  human instruction.
- **Human directs, agent proposes**: never write documents without
  explicit human direction.

## Agent Prohibitions

**PROHIBITED TOOLS:**

- PROHIBITED: `cat`, `grep`, `find`, `sed`, `ls` — use `bat`, `rg`, `fd`, `sd`, `eza`
- PROHIBITED: `brew install`, `apt install` — no system-level installations
- PROHIBITED: `Co-Authored-By` or AI attribution in commits

**PROHIBITED PATTERNS:**

- PROHIBITED: unit tests with internal mocks (File/Unit tier). Primary tier is App/Service with real stack
- PROHIBITED: assuming build artifacts exist from a previous run. Fresh build before E2E

**ECHO GUARD:**

- MANDATORY: canonical pipeline is `Setup(0) → Build(1) → Static(2) → Dynamic(3) → E2E(4)`. Never reorder
- MANDATORY: a context may SKIP steps but NEVER change relative order
- PROHIBITED: running E2E without prior Build in the same session. No exception

Violation → immediate kill. No second attempt on the same violation.

## Anti-Rationalization Protocol

Rules in this document are MECHANICAL, not ADVISORY. An agent has no
authority to:

- Judge whether a rule "applies" based on task size, complexity, or urgency
- Invent exceptions not explicitly written ("too small for a branch", "just a config change", "quick fix")
- Reinterpret rule intent to justify skipping it ("the spirit of the rule doesn't require this here")
- Defer compliance ("I'll create the handoff after this quick fix")

### The Rationalization Test

Before omitting, reducing, or "scaling down" ANY protocol in this document:

1. **Cite the exact text** that authorizes the omission. Not a paraphrase — the exact sentence.
2. If no exact sentence authorizes it → the omission is not authorized. Full stop.
3. If the agent finds itself writing phrases like "this doesn't warrant", "this is just", "given the simplicity", "an exception for", or "in this case we can skip" → rationalization signal. Stop and comply as written.

### Interpretation Rules

- Ambiguity resolves in favor of MORE compliance, not less
- "Scaling to the work" means reducing content volume, never skipping structural requirements
- Silence on a topic means the default protocol applies, not that the agent has discretion
- The agent cannot grant itself exceptions. Only an explicit user directive overrides a rule, and the agent MUST repeat the override to the user for confirmation before acting

### Burden of Proof

The burden of proof for non-compliance rests on the agent, not on the
document. "The document doesn't explicitly say I must" is not valid
justification for omission. If a reasonable reading implies the
obligation, the obligation exists.

## Model Assignment Policy

Before launching a sub-agent, ask: does it need to REASON, IMPLEMENT,
or SEARCH?

| Tier | Role | Use when |
|------|------|----------|
| Search | Lightweight | Grep, read docs, lint checks, formatting, exploratory reads |
| Implement | Standard | Write code, tests, reviews, verify quality gates |
| Architect | Advanced | Design decisions, conflict resolution, multi-source synthesis |

With 6+ agents, tier discipline multiplies savings. Never burn an
architect-tier model on a grep.

The orchestrator maps tiers to whatever models are available in the
current runtime. Tier names are stable; model names are not.

## Orchestrator-Minion Pattern

Coordination pattern where a single orchestrator decomposes work into
discrete units, delegates each to stateless workers (minions), collects
and validates results, and manages workflow state. The orchestrator owns
the execution plan and global context; workers know nothing beyond their
current assignment. Formally catalogued as "Master-Slave" in POSA Vol. 1
(Buschmann et al., 1996); instantiated in MapReduce, Sagas, Process
Manager, and Temporal.io.

### Principles

1. **Centralized control, distributed execution** — the orchestrator owns the DAG; workers own only their assigned unit
2. **Stateless workers** — workers retain no memory between invocations; all context arrives in the briefing
3. **Self-contained briefings** — each delegation carries everything the worker needs; the worker never fetches its own context
4. **Idempotent execution** — workers produce the same output for the same input
5. **Orchestrator as single source of truth** — global state lives exclusively in the orchestrator or its durable store
6. **Explicit quality gates** — the orchestrator validates each result against a contract before incorporating it; "looks good" is not verification
7. **The orchestrator never executes** — it decomposes, assigns, and aggregates; executing substantive work inflates context and creates a bottleneck
8. **Inject rules as text, not as paths** — workers receive pre-digested rules in their briefing; they never read config files or registries

### Briefing Contract

Every delegation from orchestrator to worker MUST include:

| Element | Description |
|---------|-------------|
| Task ID | Unique identifier for deduplication and retry tracking |
| Input payload | All required data, fully resolved |
| Output schema | Exact structure of expected result |
| Scope boundaries | What is in scope AND what is not |
| Done criteria | Explicit stop condition |
| Constraints | Timeout, resource limits, retry policy |
| Context | Minimal relevant subset of global state |

### Result Contract

Every worker response MUST conform to:

| Element | Description |
|---------|-------------|
| Task ID | Returned for correlation with original briefing |
| Status | success / failure / partial |
| Payload | Structured output conforming to requested schema |
| Errors | Typed (transient vs permanent) with descriptive message |
| Metadata | Duration, resource consumption, confidence signals |
| Artifacts | Concrete, inspectable outputs (not vague summaries) |

### Orchestration Anti-Patterns

1. **Verbose orchestrator** — passing partial context, forcing worker to request more
2. **Stateful workers** — caching data between invocations creates hidden coupling
3. **Orchestrator as executor** — doing substantive work inflates orchestrator context
4. **Unvalidated results** — accepting output without contract verification
5. **Implicit ordering** — depending on execution timing instead of explicit DAG dependencies
6. **Bloated briefings** — sending full global state instead of minimal relevant subset
7. **Telephone-game decomposition** — splitting by problem type instead of context boundaries

### References

| Source | Contribution |
|--------|-------------|
| Buschmann et al., _POSA Vol. 1_ (1996) | First formal pattern catalogue entry (Master-Slave) |
| Garcia-Molina & Salem, SIGMOD '87 | Sagas — orchestrated compensating transactions |
| Dean & Ghemawat, OSDI '04 | MapReduce — canonical master-worker at scale |
| Hohpe & Woolf, _EIP_ (2003) | Process Manager pattern in messaging |
| Temporal.io docs | Durable execution: deterministic orchestrator + stateless workers |
| Anthropic, "Building Multi-Agent Systems" (2025) | Orchestrator-worker as central multi-agent pattern |

## Orchestration Protocol

This protocol implements the pattern defined in
[Orchestrator-Minion Pattern](#orchestrator-minion-pattern).

### Pure Orchestrator Principle

The primary agent operates exclusively as coordinator. It does not
execute tasks directly.

| Action | Inline (orchestrator) | Delegate (sub-agent) |
|--------|-----------------------|----------------------|
| Read to decide/verify (1-3 files) | YES | — |
| Read to explore/understand (4+ files) | — | YES |
| Read as preparation for writing | — | YES alongside the write |
| Write (any file) | — | YES |
| Read-only bash (git status, eza) | YES | — |
| Execution bash (tsc, vitest, npm) | — | YES |
| Architectural decisions (no artifacts) | YES | — |
| Present results to user | YES | — |

**Self-detection**: if the orchestrator finds itself editing files,
writing code, or running builds, it is in violation. It must stop,
delegate the task to a sub-agent, and resume as coordinator.

### Circuit Breaker

Sub-agent supervision is reactive, not proactive.

**Pre-launch** — the orchestrator includes in every delegation prompt:

- **Scope hint**: one line delimiting the scope
- **Verifiable objective**: one sentence evaluable as binary against the result

**Post-result** — the orchestrator evaluates a single invariant:

> Is the sub-agent's result coherent with the declared objective and scope hint?

| State | Condition | Overhead |
|-------|-----------|----------|
| Closed (normal) | Coherent results | Zero — delegate and wait |
| Open (anomaly) | Invariant failed | High — exhaustive verification justified |
| Half-open (recovery) | Next sub-agent with same scope gets reinforced prompt | Medium — if it passes, return to closed |

### Post-Delegation Checkpoint (PDC)

After receiving EACH sub-agent result, the orchestrator executes these
4 steps IN ORDER before any other action:

1. **ECHO** — Print the acceptance gates for this task. Format: `GATES: [gate1] | [gate2] | [gate3]`
2. **VERIFY** — For each gate, declare PASS or FAIL with ONE line of evidence. "Looks correct" is NOT evidence
3. **MARK** — Persist progress state NOW
4. **DECIDE** — If any gate is FAIL → do not advance, re-delegate or correct. If all gates are PASS → `CHECKPOINT CLEAR`

**Closure rule**: if step 3 was not completed, the orchestrator does NOT
have permission to launch another sub-agent.

### Escalation on Rejection

1. Gate fails → specific feedback with evidence → agent corrects
2. Same gate fails again → kill + clean relaunch with error context
3. Third failure → orchestrator diagnoses root cause and relaunches with reduced scope or escalates to user

## Compact Rules for Sub-Agent Injection

Orchestrators MUST inject these rules verbatim into every sub-agent
prompt that writes or reviews code. Do not summarize, do not paraphrase.

### FORMO-CODE

```text
- Language: TypeScript. Follow NestJS + nest-commander conventions.
- CLI tools: bat, rg, fd, sd, eza. PROHIBITED: cat, grep, find, sed, ls.
- Commits: conventional commits. No Co-Authored-By, no AI attribution.
- Imports: node built-ins first, then third-party, then internal. Separated by blank line.
- Errors: throw typed errors (ConfigurationError, ProviderError). Never swallow silently.
- Names: PascalCase for classes/interfaces, camelCase for functions/variables. Suffix services with Service, ports with Port.
- Decorators: NestJS decorators (@Injectable, @Module, @Command) on the line above the declaration.
- Strict mode: all TypeScript strict flags enabled. No `any` without justification.
```

### FORMO-TEST

```text
- PRIMARY tier: App/Service — real NestJS stack via @nestjs/testing, zero mocks.
- PROHIBITED: unit tests with internal mocks (File/Unit tier). Value = 0.
- Derived (Module/Integration, Regression/Smoke): filtered from app tests, not developed separately.
- E2E: full solution, zero mocks, multi-provider.
- Conditional (Performance/Load): only if design doc declares SLAs.
- Test runner: Vitest. Filter by name: vitest run --test-name-pattern "<pattern>".
- Each test bootstraps the full NestJS application with Test.createTestingModule().
```

**Testing Matrix:**

| Tier | Type | Status |
|------|------|--------|
| File/Unit | Internal mocks | PROHIBITED |
| Module/Integration | Filtered from app tests | DERIVED |
| App/Service | Real stack, zero mocks | PRIMARY |
| Solution/E2E | Multi-provider, zero mocks | EXPLICIT |
| Performance/Load | Only if SLAs declared | CONDITIONAL |

### FORMO-ANTI-DRIFT

```text
- Rules are MECHANICAL, not ADVISORY.
- Before omitting any protocol: cite the exact text that authorizes it. No text → no omission.
- Phrases like "this doesn't warrant", "given the simplicity", "in this case we can skip" = rationalization signal. STOP.
- Ambiguity resolves in favor of MORE compliance, not less.
- The agent cannot grant itself exceptions.
- GP-4 (Principia): constraint > confidence. Enforceable gates, not agent promises.
```

## Echo System

Deterministic 5-step pipeline. Runs in EVERY environment (dev, CI, CD).
Steps are always the same and in the same order. What varies is the
scope.

### Canonical Pipeline

```text
0. Setup    → npm install (or pnpm install)
1. Build    → tsc
2. Static   → tsc --noEmit, eslint (if configured)
3. Dynamic  → vitest run (App/Service tier)
4. E2E      → vitest run (e2e pattern, full solution)
```

### Invariants

1. **Never reorder** — a context may SKIP steps but never change relative order
2. **Prerequisites** — step 4 (E2E) REQUIRES step 1 (Build). No exception
3. **No phantom steps** — every pipeline step maps to a concrete command
4. **Fresh build** — never assume binaries or artifacts exist from a previous run

### Execution Contexts

| # | Context | Steps | Notes |
|---|---------|-------|-------|
| A | Dev Setup | 0 | Install only |
| B | Pre-commit | 2(partial)+3 | Lint + fast tests. No build (speed) |
| C | Pre-push | 1+2+3+4 | Full pipeline |
| D | CI | 0+1+2+3+4 | Full pipeline, strict canon |

### Command Mapping

| Canonical Step | Command |
|----------------|---------|
| 0. Setup | `npm install` |
| 1. Build | `npx tsc` |
| 2. Static | `npx tsc --noEmit && npx eslint .` (if configured) |
| 3. Dynamic | `npx vitest run` |
| 4. E2E | `npx vitest run --test-name-pattern "e2e"` |
