---
name: virgil-transition
description: "Trigger: /virgil-transition, or asked to change a task's status in a Virgil-managed project. Calls the virgil_transition MCP tool to advance a task through its lifecycle."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-transition

Change the status of a task document by calling the `virgil_transition`
MCP tool. Tasks follow a lifecycle state machine:

```
backlog → refined → active → done → released
```

Backward transitions are allowed: `refined → backlog`, `active → refined`,
`done → active`. The only terminal state is `released` (no transitions out).

## Activation Contract

Load this skill when the user invokes `/virgil-transition` or asks to
change a task's status, advance a task, mark a task as done, or move a
task through its lifecycle.

## Before Calling

Call `virgil_status` first to verify the task exists and check its current
status. Do not attempt invalid transitions — they will be rejected.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task_slug` | string | yes | The slug identifying the task to transition. |
| `new_status` | enum | yes | Target status: `backlog`, `refined`, `active`, `done`, `released`. |
| `refs_update` | object | no | Updated refs to apply alongside the transition. Same shape as `refs` in `virgil_write`. |

No other fields are accepted (`additionalProperties: false`).

## Valid Transitions

| From | Allowed Targets |
|------|----------------|
| `backlog` | `refined` |
| `refined` | `active`, `backlog` |
| `active` | `done`, `refined` |
| `done` | `released`, `active` |
| `released` | (none — terminal) |

## Example Invocations

Advance a task to active:

```json
{
  "name": "virgil_transition",
  "arguments": {
    "task_slug": "implement-login",
    "new_status": "active"
  }
}
```

Mark done with updated refs:

```json
{
  "name": "virgil_transition",
  "arguments": {
    "task_slug": "implement-login",
    "new_status": "done",
    "refs_update": {
      "implements": ["src/auth/login.ts", "src/auth/login.test.ts"]
    }
  }
}
```

## After Calling

Check `status` in the response:

- `success` — transition applied; task file updated with new status.
- `blocked` or `error` — read the `error` field. Common causes: invalid
  transition (e.g. `backlog → active` skips `refined`), or task not found.

## References

- `../virgil-workflow/SKILL.md` — full workflow this tool is part of.
- `../virgil-write/SKILL.md` — to create tasks before transitioning them.
