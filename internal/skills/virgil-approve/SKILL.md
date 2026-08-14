---
name: virgil-approve
description: "Trigger: /virgil-approve, or asked to approve a pending Virgil artifact. Calls the virgil_approve MCP tool to approve the artifact revision awaiting approval."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-approve

Approve the current artifact revision that is awaiting approval by calling
the `virgil_approve` MCP tool. This advances the pipeline to the next step.

## Activation Contract

Load this skill when the user invokes `/virgil-approve` or asks you to
approve, accept, or sign off on the artifact most recently proposed via
`virgil_propose`.

## Before Calling

Call `virgil_status` first. There must be a revision awaiting approval —
if the last `virgil_propose` call did not return `needs_input`, there is
nothing to approve yet.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rationale` | string | yes | Explanation of why this artifact revision is approved. |

No other fields are accepted (`additionalProperties: false`).

## Example Invocation

```json
{
  "name": "virgil_approve",
  "arguments": {
    "rationale": "Idea is scoped correctly and matches the stated intent."
  }
}
```

## After Calling

Check `status` in the response:

- `success` — approved; `operation` reads `virgil.continue`. If
  `derived_step` is now `complete`, the pipeline is finished. Otherwise
  `message` names the next step — return to `/virgil-propose` with
  `artifact_kind` set to the new `derived_step`.
- `blocked` or `error` — read the `error` field and surface it to the user
  before retrying.

## References

- `../virgil-workflow/SKILL.md` — full pipeline and artifact order.
- `../virgil-propose/SKILL.md` — how the next artifact is proposed.
