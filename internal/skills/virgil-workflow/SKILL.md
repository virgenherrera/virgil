---
name: virgil-workflow
description: "Trigger: working in a Virgil-managed project, or asked to run the Virgil planning workflow. Teaches the init -> new -> propose -> approve MCP tool pipeline and status checks."
metadata:
  author: virgenherrera
  version: "1.0"
---

# Virgil Workflow

Virgil exposes five MCP tools on the `virgil` server: `virgil_init`, `virgil_new`,
`virgil_propose`, `virgil_approve`, `virgil_status`. Together they drive a
project through a fixed, gated artifact pipeline. This skill teaches the
tool sequence; it does not replace the individual `/virgil-*` command
skills, which document each tool's parameters in isolation.

## Activation Contract

Load this skill whenever you are about to call any `virgil_*` MCP tool, or
whenever the user asks to plan, propose, or approve work in a
Virgil-managed project.

## Hard Rules

- Never invent tool parameters. Each tool's input schema is exact and
  `additionalProperties: false` — extra fields are rejected.
- Never call `virgil_propose` with an `artifact_kind` that does not match
  the current `derived_step`. Call `virgil_status` first if you are unsure
  what the current step is.
- Never call `virgil_new` while a project already has an active change.
  Finish or check the active change via `virgil_status` first.
- `virgil_status` takes no parameters and is always safe to call — use it
  liberally to re-orient.
- Never call `virgil_approve` without explicit human confirmation. Present
  the proposal summary and wait.
- After `derived_step` reaches `complete`, STOP. The pipeline is a PLANNING
  tool. Implementation requires separate, explicit instruction from the
  human.

## The Artifact Pipeline

A change moves through a fixed, ordered sequence of artifact kinds:

```
idea -> spec -> design -> tasks -> handoff -> complete
```

Each artifact kind is proposed with `virgil_propose`, then approved with
`virgil_approve`. Approval advances the pipeline to the next kind. There is
no skipping steps and no working ahead of the current `derived_step`.

## Tool Call Sequence

| # | Tool | Parameters | When |
|---|------|-----------|------|
| 1 | `virgil_init` | `project_id` (string, required) | Once per project, before anything else. |
| 2 | `virgil_new` | `change_id` (string, required), `intent` (string, required) | Start a change. Project must be initialized and have no active change. |
| 3 | `virgil_propose` | `artifact_kind` (enum: idea, spec, design, tasks, handoff, required), `content` (string, required) | Submit content for the current derived step. |
| 4 | `virgil_approve` | `rationale` (string, required) | Approve the revision currently awaiting approval. Advances the pipeline. |
| 5 | `virgil_status` | none | Check state at any point — before, between, or after any of the above. |

Repeat steps 3-4 for each artifact kind in order (idea, then spec, then
design, then tasks, then handoff) until `derived_step` reports `complete`.

## Response Shape

Every `virgil_*` call (except a failed `virgil_status`) returns a JSON
object with these fields — read them to decide the next action, do not
guess:

- `status`: one of `success`, `needs_input`, `blocked`, `error`, `unsupported`.
- `operation`: the operation that ran (e.g. `virgil.init`, `virgil.new`, `virgil.continue`).
- `derived_step`: the pipeline step the project is currently on.
- `message`: human-readable summary.
- `artifacts`: file paths written by this call, if any.
- `next_step`: what to do next, if the runtime has a recommendation.
- `error`: diagnostic detail, present only when `status` is `blocked`, `error`, or `unsupported`.

A `status` of `needs_input` after `virgil_propose` means the artifact is
awaiting approval — the next call should be `virgil_approve`, not another
`virgil_propose`.

## Execution Steps

1. Call `virgil_status` to check whether the project is initialized and
   whether a change is active.
2. If not initialized, call `virgil_init` with a `project_id`.
3. If no change is active, call `virgil_new` with a `change_id` and
   `intent`.
4. Read `derived_step` from the status/response. Call `virgil_propose`
   with `artifact_kind` set to that exact step and `content` holding the
   markdown for that artifact.
5. Call `virgil_approve` with a `rationale` explaining why the proposed
   revision is acceptable.
6. Repeat steps 4-5 until `derived_step` is `complete`.
7. Use `virgil_status` at any point to re-check state, including after an
   error or a `blocked` result.
8. When `derived_step` is `complete`, report the final state to the user and
   STOP. Do not proceed to implementation unless the user explicitly
   instructs it.

## Output Contract

After driving the pipeline, report to the user: the current `derived_step`,
the `status` of the last call, and any `artifacts` written. If `status` was
`blocked` or `error`, surface the `error` field verbatim before proposing a
fix.

## References

- `../virgil-init/SKILL.md` — `virgil_init` in isolation.
- `../virgil-new/SKILL.md` — `virgil_new` in isolation.
- `../virgil-propose/SKILL.md` — `virgil_propose` in isolation.
- `../virgil-approve/SKILL.md` — `virgil_approve` in isolation.
- `../virgil-status/SKILL.md` — `virgil_status` in isolation.
