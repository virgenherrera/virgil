---
name: virgil-propose
description: "Trigger: /virgil-propose, or asked to submit an artifact draft in Virgil. Calls the virgil_propose MCP tool to submit idea, spec, design, tasks, or handoff content."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-propose

Submit a content proposal for the current artifact step by calling the
`virgil_propose` MCP tool. The proposal is written as a seed file and
submitted for approval.

## Activation Contract

Load this skill when the user invokes `/virgil-propose` or asks you to
draft, write, or submit an idea, spec, design, tasks, or handoff artifact
for the active Virgil change.

## Before Calling

Call `virgil_status` first and read `derived_step`. `artifact_kind` MUST
equal `derived_step` exactly — proposing for any other kind is rejected.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `artifact_kind` | string enum | yes | One of `idea`, `spec`, `design`, `tasks`, `handoff`. Must match the current derived step. |
| `content` | string | yes | Markdown content for the artifact proposal. |

No other fields are accepted (`additionalProperties: false`).

## Example Invocation

```json
{
  "name": "virgil_propose",
  "arguments": {
    "artifact_kind": "idea",
    "content": "# Idea\n\nAdd OAuth-based login to the web app...\n"
  }
}
```

## After Calling

Check `status` in the response:

- `needs_input` — artifact is now awaiting approval. `message` reads
  "Artifact {derived_step} is awaiting approval." Proceed to
  `/virgil-approve`.
- `blocked` or `error` — read the `error` field (e.g. `artifact_kind`
  mismatch with the current derived step) and correct before retrying.

## References

- `../virgil-workflow/SKILL.md` — full pipeline and artifact order.
- `../virgil-approve/SKILL.md` — required next step after a proposal.
