---
name: virgil-status
description: "Trigger: /virgil-status, or need to check the current Virgil project state. Calls the virgil_status MCP tool; no parameters, safe to call anytime."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-status

Show the current project state by calling the `virgil_status` MCP tool:
whether the project is initialized, the active change (if any), and the
current derived step.

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

The response is the project state itself (not the standard tool-result
envelope used by the other four tools). Use it to decide the next action:

- Not initialized -> run `/virgil-init`.
- Initialized, no active change -> run `/virgil-new`.
- Active change with a `derived_step` other than `complete` -> continue the
  propose/approve cycle for that step via `/virgil-propose` or
  `/virgil-approve`.
- `derived_step` is `complete` -> the change's artifact pipeline is
  finished; no further propose/approve calls apply to it.

## References

- `../virgil-workflow/SKILL.md` — full pipeline and how each step reads status.
