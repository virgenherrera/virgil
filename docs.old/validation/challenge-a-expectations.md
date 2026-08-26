# Challenge-A: expected Virgil behavior

Pre-release validation for v0.3.0-rc.1. A pure TypeScript project
(`~/projects/challenge-a`) serves as consumer. The human installs Virgil,
opens an agent (Claude Code or Codex), and drives the full pipeline.

## Prerequisites

```bash
cd ~/projects/challenge-a
npm install
virgil install    # installs v0.3.0-rc.1 via install.sh or go install
```

After install, restart the agent.

## Step 1: "initialize this project with Virgil"

Expected agent behavior:

1. Agent calls `virgil_status` (system prompt instructs this on first interaction)
2. Agent calls `virgil_init` with project_id (e.g. `challenge-a`)

Expected filesystem effects:

```
challenge-a/
  virgil.json       <- project config (schema_version, protocol_version, project_id, managed_root: "docs/")
  AGENTS.md         <- generated template
```

No `docs/` directory yet. No `active_change` in virgil.json.

## Step 2: "read the challenge and let's begin with Virgil"

Agent reads `CHALLENGE.md`, then drives the pipeline.

### 2a. virgil_new

Agent calls `virgil_new` with:
- `change_id`: something like `atm-dispenser` or `implement-dispense`
- `intent`: describes implementing the ATM cash dispenser function

Expected: `active_change` set in virgil.json. `derived_step` = `idea`.

### 2b. idea stage

Agent calls `virgil_propose` with `artifact_kind: "idea"` and content
summarizing the challenge objective.

Expected files:
- `seed/{change_id}/idea-proposal.md`
- `docs/{change_id}/00-idea.md` (status: draft)

Human reviews. Agent calls `virgil_approve` with rationale.

Expected: `00-idea.md` status → approved. `derived_step` → `spec`.

### 2c. spec stage

Agent calls `virgil_propose` with `artifact_kind: "spec"` and content covering:
- Function signature and types (DispenseResult, DEFAULT_DENOMINATIONS)
- Input validation rules (zero, negative, non-dispensable)
- Minimum bills requirement (DP, not greedy)
- Custom denominations support
- Test scenarios reference

Human approves. `derived_step` → `design`.

### 2d. design stage

Agent proposes design covering:
- Algorithm choice (dynamic programming for correctness with arbitrary denominations)
- Why greedy fails (the [4,3,1] case for amount 6)
- Data structure for result (Map<number, number>)
- Error handling strategy

Human approves. `derived_step` → `tasks`.

### 2e. tasks stage

Agent proposes task breakdown, likely:
1. Input validation (zero, negative)
2. DP algorithm for minimum bills
3. Backtrack to reconstruct bill selection
4. Handle non-dispensable amounts
5. Wire DEFAULT_DENOMINATIONS

Human approves. `derived_step` → `handoff`.

### 2f. handoff stage

Agent proposes handoff with implementation plan, referencing the approved
spec, design, and tasks. Includes quality profile and definition of green.

Human approves. `derived_step` → `complete`. `active_change` cleared from
virgil.json.

### Final state

```
challenge-a/
  virgil.json                         <- active_change: null
  AGENTS.md
  docs/{change_id}/
    00-idea.md      (approved)
    01-spec.md      (approved)
    02-design.md    (approved)
    03-tasks.md     (approved)
    04-handoff.md   (approved)
  seed/{change_id}/
    idea-proposal.md
    spec-proposal.md
    design-proposal.md
    tasks-proposal.md
    handoff-proposal.md
```

## Step 3: implementation

After pipeline completion, the human asks the agent to implement the solution
based on the approved handoff. This is OUTSIDE Virgil's pipeline — Virgil
manages planning, the agent codes.

Expected: agent implements `src/dispense.ts`, `npm test` passes all 14 test
cases including the DP-required `dispense(6, [4,3,1])` case.

## What this validates

| # | Concern | Pass condition |
|---|---------|---------------|
| 1 | MCP discovery | Agent finds virgil_* tools after install + restart |
| 2 | System prompt | Agent calls virgil_status on first interaction |
| 3 | virgil_init | virgil.json + AGENTS.md created correctly |
| 4 | virgil_new | active_change set, derived_step = idea |
| 5 | virgil_propose | Seed + artifact files created with correct naming |
| 6 | virgil_approve | Status transitions, derived_step advances |
| 7 | Pipeline completion | All 5 artifacts approved, complete reached, active_change cleared |
| 8 | Handoff quality | Agent can implement working code from the approved handoff |
| 9 | End-to-end | npm test passes, CLI works |

## Failure modes

| Symptom | Likely cause |
|---------|-------------|
| Agent cannot find virgil_* tools | MCP config wrong — check agent settings for virgil serve entry |
| virgil_init fails with INVALID_ENVELOPE | Binary version mismatch or envelope schema error |
| Agent skips stages | Agent not reading virgil_status response about derived_step |
| Artifacts in wrong path | managed_root misconfigured in virgil.json |
| Tests fail on dispense(6,[4,3,1]) | Agent used greedy instead of DP — handoff should specify this |
| Agent never calls virgil_approve | Agent not completing the approval loop |
