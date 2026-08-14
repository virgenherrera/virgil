---
name: virgil-init
description: "Trigger: /virgil-init, or asked to initialize Virgil in a project. Calls the virgil_init MCP tool to create virgil.json and AGENTS.md."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-init

Initialize a Virgil-managed project by calling the `virgil_init` MCP tool.
This creates `virgil.json` and `AGENTS.md` at the target root.

## Activation Contract

Load this skill when the user invokes `/virgil-init` or asks to set up
Virgil in the current project.

## Before Calling

Call `virgil_status` first. If `initialized` is already `true`, do not call
`virgil_init` again — report the existing `project_id` instead of
re-initializing.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | yes | Unique identifier for the project to initialize. |

No other fields are accepted (`additionalProperties: false`).

## Example Invocation

```json
{
  "name": "virgil_init",
  "arguments": {
    "project_id": "my-project"
  }
}
```

## After Calling

Check `status` in the response:

- `success` — project initialized; `message` reads "Project initialized.
  Ready to create a change." Proceed to `/virgil-new` when the user is
  ready to start a change.
- `blocked` or `error` — read the `error` field and surface it to the
  user before retrying.

## References

- `../virgil-workflow/SKILL.md` — full pipeline this command starts.
