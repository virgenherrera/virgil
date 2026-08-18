---
name: virgil-status
description: "Trigger: /virgil-status, or need to check the current Virgil project state. Calls the virgil_status MCP tool; no parameters, safe to call anytime."
metadata:
  author: virgenherrera
  version: "2.0"
---

# /virgil-status

Show the current project state by calling the `virgil_status` MCP tool:
whether the project is initialized, document counts by kind, and task
counts by lifecycle status.

## Activation Contract

Load this skill when the user invokes `/virgil-status`, when you need to
re-orient before calling another `virgil_*` tool, or after any `blocked`
or `error` result to confirm the project's current state.

## Before Calling

None. `virgil_status` has no preconditions and is always safe to call.

## Parameters

None. The tool takes an empty object (`additionalProperties: false`, no
properties defined).

## Example Invocation

```json
{
  "name": "virgil_status",
  "arguments": {}
}
```

## After Calling

The response is a ProjectState object with:

- `initialized` — boolean, whether `virgil.json` exists.
- `project_id` — string, the project identifier (if initialized).
- `requirement_count` — number of requirement documents in `docs/requirements/`.
- `design_count` — number of design documents in `docs/design/`.
- `task_counts` — object with counts by lifecycle status:
  - `backlog` — tasks not yet refined.
  - `refined` — tasks ready to be picked up.
  - `active` — tasks currently in progress.
  - `done` — tasks completed but not released.
  - `released` — tasks shipped.

Use the response to decide the next action:

- Not initialized -> run `/virgil-init`.
- Initialized, no documents -> run `/virgil-write` to start writing.
- Has tasks -> check `task_counts` to understand project progress and
  use `/virgil-transition` to advance tasks as needed.

## References

- `../virgil-workflow/SKILL.md` — full workflow and how each tool reads state.
