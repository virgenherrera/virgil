---
name: virgil-new
description: "Trigger: /virgil-new, or asked to start a new Virgil change. Calls the virgil_new MCP tool to begin a planning change within an initialized project."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-new

Start a new planning change within an initialized Virgil project by calling
the `virgil_new` MCP tool.

## Activation Contract

Load this skill when the user invokes `/virgil-new` or asks to start a new
change, feature, or planning cycle in a Virgil-managed project.

## Before Calling

Call `virgil_status` first. Confirm `initialized` is `true` (if not, run
`/virgil-init` first) and that there is no `active_change` already — a
project may only have one active change at a time.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `change_id` | string | yes | Unique identifier for the change. Must be a safe relative path component — no slashes. |
| `intent` | string | yes | Human-readable description of what this change is about. |

No other fields are accepted (`additionalProperties: false`).

## Example Invocation

```json
{
  "name": "virgil_new",
  "arguments": {
    "change_id": "add-auth-flow",
    "intent": "Add OAuth-based login to the web app."
  }
}
```

## After Calling

Check `status` in the response:

- `success` — change created; `message` reads "Change created. Ready to
  propose the first artifact (idea)." `derived_step` will be `idea`.
  Proceed to `/virgil-propose` with `artifact_kind: "idea"`.
- `blocked` or `error` — read the `error` field (e.g. an active change
  already exists) and surface it to the user before retrying.

## References

- `../virgil-workflow/SKILL.md` — full pipeline this command starts.
- `../virgil-propose/SKILL.md` — next step after a change is created.
