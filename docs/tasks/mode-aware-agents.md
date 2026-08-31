<!-- virgil:meta
{
  "schema": "virgil.dev/doc/v1alpha1",
  "doc_kind": "task",
  "slug": "mode-aware-agents",
  "status": "refined",
  "category": null,
  "refs": { "requirements": [], "design": [], "implements": [] },
  "created_at": "2026-08-31T18:00:00Z",
  "updated_at": "2026-08-31T18:00:00Z"
}
-->

# Mode-Aware AGENTS.md

## Objective

Unify Virgil's dual-audience AGENTS.md into a single file that serves both
consumption contexts (using Virgil as a tool on another project) and
development contexts (working on Virgil itself), eliminating branch-divergence
merge conflicts while remaining parseable by any AI agent regardless of vendor.

## Design Decision

### Rejected Alternatives

1. **Two branches with different files.** The current approach with `AGENTS.md`
   (main) and `AGENTS-DEV.md` (development override). Fails because PRs from
   development to main either overwrite the production file or require manual
   merge choreography. The override pattern also splits context: an agent must
   read two files and mentally compose them, which is fragile.

2. **Conditional includes or preprocessing.** No agent runtime supports
   `#ifdef`-style directives in markdown. This would require a build step
   that contradicts the Open Agentic Standard's principle that AGENTS.md is a
   plain-text file readable without tooling.

3. **Symlinks or git attributes.** Platform-dependent, invisible to agents,
   and adds operational complexity with no parsing benefit.

### Chosen Approach: Single File with Mode Sections

One `AGENTS.md` containing:

- **Shared content (~80%)**: mission, architecture map, toolchain, commit
  conventions, judgment boundaries, invariants, agent prohibitions, FORMO
  rules, Echo System, anti-rationalization protocol, model assignment,
  orchestrator-minion pattern, orchestration protocol. These apply in ALL
  contexts.

- **Two mode sections (~20%)**: clearly demarcated blocks at the end of the
  file. Each block contains ONLY the instructions specific to that mode.
  An agent reads both and activates the one matching its operational context.

This approach works because:

- It is one file on one branch. No merge conflicts between branches.
- Both modes share the same governance, which is the correct semantic: FORMO
  rules, anti-rationalization, and the principia hierarchy apply regardless
  of whether you are using or developing Virgil.
- Markdown section headings are universally parsed by every agent runtime.
- The mode sections are additive, not contradictory: activating one mode
  does not require negating the other.

## Mode Detection Mechanism

### The Core Problem

An agent cannot inspect its own process to determine "am I developing Virgil
or consuming it?" Mode detection must be based on observable, agent-agnostic
signals present in the file itself and the agent's operational context.

### Detection Heuristic (Agent-Agnostic)

The AGENTS.md file includes a short decision block inside each mode section
header that agents use to self-select. The heuristic is based on two
observable signals:

1. **Working directory identity.** If the agent's working directory IS the
   Virgil repository (the same repo containing this AGENTS.md), the agent is
   in Development Mode.

2. **Task intent.** If the agent was instructed to use Virgil as a tool
   (invoke `virgil` CLI commands against a target project), the agent is in
   Consumption Mode.

The AGENTS.md expresses this as a plain-language decision rule at the top of
the mode sections:

```markdown
## Modes

This file serves two contexts. Read both mode sections; activate the one
matching your situation. When in doubt, the default is Consumption Mode.

**Development Mode** applies when you are modifying files in THIS repository
(the Virgil codebase itself). Signals: your working directory is this repo,
your task involves changing Virgil's source code, tests, or documentation.

**Consumption Mode** applies when you are using Virgil as a tool to manage
ANOTHER project. Signals: you invoke `virgil` CLI commands, your working
directory is a different project, your task involves creating handoffs or
resolving context for a target project.
```

### Why This Is Robust

- **No vendor-specific features.** Every agent (Claude, GPT, Gemini, Codex,
  Cursor, Windsurf, Kiro) can read plain-language conditional instructions
  in markdown. No special parsing required.

- **Observable signals.** Working directory and task intent are things every
  agent knows about its own execution context. No introspection API needed.

- **Explicit default.** When signals are ambiguous (e.g., running Virgil
  tests as part of a CI pipeline), the default is Consumption Mode, which
  is the safer and more constrained interpretation.

- **No mutual exclusion problem.** The shared sections apply regardless.
  Mode sections only ADD context-specific instructions; they never
  contradict the shared governance.

### Edge Case: Virgil-on-Virgil

When using Virgil to manage Virgil itself (dogfooding), BOTH modes apply
simultaneously. This is explicitly stated in the Modes preamble:

```markdown
**Both modes active**: If you are developing Virgil AND using Virgil CLI
commands to manage the development process (dogfooding), both modes apply.
Development Mode governs your code changes; Consumption Mode governs your
Virgil CLI invocations.
```

This is not a contradiction because the two modes govern different
activities, not conflicting rules for the same activity.

## AGENTS.md Structure

The proposed section layout. Line counts are approximate targets for content
density, not hard limits.

```
# Virgil

## Mission                              [shared, ~8 lines]

## Architecture Map                     [shared, ~12 lines]
  Principia > Dogma > Runtime precedence table.

## Orientation                          [shared, ~4 lines]
  `virgil status` as first action.

## Toolchain                            [shared, ~30 lines]
  Full 17-command table. Both modes need to know commands exist.

## Artifacts                            [shared, ~12 lines]
  `.virgil/` directory layout.

## Commit Conventions                   [shared, ~20 lines]

## Judgment Boundaries                  [shared, ~20 lines]
  NEVER / ASK / ALWAYS tiers.

## Invariants                           [shared, ~8 lines]
  Global ownership, planning boundary, MIM principle.

## Agent Prohibitions                   [shared, ~15 lines]
  FORMO-CODE tools, prohibited patterns, Echo Guard.

## Anti-Rationalization Protocol        [shared, ~30 lines]

## Model Assignment Policy              [shared, ~12 lines]

## Orchestrator-Minion Pattern          [shared, ~60 lines]
  Principles, briefing contract, result contract, anti-patterns, refs.

## Orchestration Protocol               [shared, ~50 lines]
  Pure orchestrator, circuit breaker, PDC, escalation.

## Compact Rules for Sub-Agent Injection [shared, ~40 lines]
  FORMO-CODE, FORMO-TEST, FORMO-ANTI-DRIFT blocks.

## Echo System                          [shared, ~30 lines]
  Canonical pipeline, invariants, execution contexts, commands.

---

## Modes                                [~5 lines preamble]
  Decision rule: how to determine which mode applies.
  Explicit "both modes active" clause for dogfooding.

### Mode: Consumption                   [~30 lines]
  - When this mode applies (using Virgil as tool on another project)
  - Interaction model (configure providers, invoke CLI, receive handoffs)
  - Target project relationship (Virgil never modifies target project)
  - Provider configuration guidance (.virgilrc.yaml, env vars)
  - Artifact lifecycle in target project (.virgil/ is gitignored)

### Mode: Development                   [~40 lines]
  - When this mode applies (working on Virgil source code)
  - Context override table (dogma=docs/, tickets=GitHub, etc.)
  - Principia as sealed reference
  - Testing rules (app-level, zero mocks, vitest)
  - Development commit rules (direct to repo, .virgil/ gitignored)
  - Architecture reference pointers (docs/architecture.md)
  - Additional NEVER/ASK boundaries specific to development
```

### Key Structural Decisions

1. **Mode sections at the end.** Shared governance comes first because it is
   more important and applies universally. Mode-specific instructions are
   narrower addenda. This also means an agent that stops reading early (due
   to context limits) still gets the governance rules.

2. **Horizontal rule separator.** The `---` before the Modes section creates
   a visual and semantic break that every markdown parser recognizes. It
   signals "everything above is universal; everything below is conditional."

3. **Mode sections as H3 under Modes H2.** This nesting makes the
   containment relationship explicit: modes are children of the Modes section,
   not peers of the shared sections. Agents that parse heading hierarchy will
   correctly scope mode-specific instructions.

4. **No content duplication.** `AGENTS-DEV.md` currently duplicates testing
   rules and NEVER/ASK boundaries already in `AGENTS.md`. The unified file
   eliminates this. Development Mode only adds what is genuinely different:
   the context override table, principia pointer, and development-specific
   boundaries.

## Implementation Steps

1. **Draft the unified AGENTS.md.** Merge the shared content from the current
   `AGENTS.md` (lines 1-431) with the Modes preamble and mode sections.
   Development Mode content comes from `AGENTS-DEV.md` (lines 1-45),
   deduplicated against the shared sections. Consumption Mode content is
   extracted from the current shared sections that are actually
   consumption-specific (interaction model, provider configuration, artifact
   lifecycle in target projects).

2. **Validate shared content.** Confirm that every shared section is genuinely
   mode-agnostic. Audit each section with the question: "Does this instruction
   change meaning or applicability depending on whether I am developing or
   consuming Virgil?" If yes, it belongs in a mode section.

3. **Write the mode-detection preamble.** Plain-language decision block in the
   Modes section. Include the dogfooding "both modes active" clause.

4. **Write Mode: Consumption section.** Content: when this mode applies,
   interaction model summary (from COURSE-CORRECTION.md), provider
   configuration guidance, target project artifact lifecycle.

5. **Write Mode: Development section.** Content: when this mode applies,
   context override table (from AGENTS-DEV.md), principia pointer, testing
   rules (deduplicated — reference FORMO-TEST, add only dev-specific
   guidance), development commit rules, additional NEVER/ASK boundaries.

6. **Delete AGENTS-DEV.md.** Its content is now inside AGENTS.md. The
   separate file is no longer needed.

7. **Update any references.** Search the codebase for references to
   `AGENTS-DEV.md` and update them to point to the Development Mode section
   of AGENTS.md. Check: CLAUDE.md, skill files, documentation.

8. **Validate with multiple agent personas.** Mentally simulate (or test)
   reading the unified file as Claude, GPT, Cursor, and Codex. Confirm that
   mode detection works without vendor-specific features.

## Acceptance Criteria

- [ ] Single `AGENTS.md` file contains all governance, both mode sections,
      and the mode-detection preamble.
- [ ] `AGENTS-DEV.md` is deleted.
- [ ] No content duplication between shared sections and mode sections.
- [ ] Mode-detection mechanism uses only plain-language instructions and
      observable signals (working directory, task intent). No vendor-specific
      features.
- [ ] The dogfooding edge case (both modes active) is explicitly addressed.
- [ ] Shared sections do not reference modes. They are fully mode-agnostic.
- [ ] Mode sections do not repeat shared governance. They only add
      mode-specific instructions.
- [ ] All references to `AGENTS-DEV.md` in the codebase are updated or
      removed.
- [ ] The file is parseable as standard markdown. No custom syntax,
      directives, or preprocessing required.
- [ ] Running `virgil status` on the resulting file produces no warnings
      (if applicable).

## Open Questions

1. **Principia compliance.** Does the principia have any explicit stance on
   AGENTS.md structure or mode-awareness? The constitution should be checked
   before implementation to ensure the unified file does not violate any
   sealed principle. This requires MIM review of the relevant principia
   sections.

2. **Consumption Mode depth.** How much operational guidance should the
   Consumption Mode section include? The current AGENTS.md already has the
   toolchain table and interaction model in the shared sections. The
   Consumption Mode section could be very thin (just "when this applies" +
   provider config) or could include a condensed quickstart. MIM decision
   on verbosity level needed.

3. **Branch strategy post-merge.** Once the unified AGENTS.md is on main,
   the development branch should be rebased to pick it up. Should there be
   a one-time branch reconciliation step documented, or is this handled by
   normal git workflow?

4. **Skill file references.** The `virgil-init`, `virgil-write`,
   `virgil-transition`, and `virgil-status` skills may reference AGENTS.md
   or AGENTS-DEV.md. These need auditing, but the scope depends on whether
   those skills are still active after the MCP removal (COURSE-CORRECTION
   Phase 2). MIM decision on sequencing with MCP cleanup.
