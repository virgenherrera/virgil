---
name: virgil-write
description: "Trigger: /virgil-write, or asked to create/update a document in a Virgil-managed project. Calls the virgil_write MCP tool to write idea, requirement, design, or task documents."
metadata:
  author: virgenherrera
  version: "1.0"
---

# /virgil-write

Create or update a document in the Virgil project knowledge base by calling
the `virgil_write` MCP tool.

## Activation Contract

Load this skill when the user invokes `/virgil-write` or asks to write,
create, or update a document (idea, requirement, design, or task) in a
Virgil-managed project.

## Before Calling

Call `virgil_status` first. If the project is not initialized, run
`/virgil-init` before writing any documents.

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `doc_kind` | enum | yes | One of: `idea`, `requirement`, `design`, `task`. |
| `content` | string | yes | Markdown content for the document. |
| `slug` | string | conditional | Short identifier. Required for requirement, design, task. Not used for idea. |
| `category` | string | no | Category prefix for requirements (`functional`, `non-functional`) and design docs (`arch`, `entity`, `api-contract`, `ci`, `cd`, `dataflow`, `otel`, etc.). |
| `status` | enum | no | Initial status for tasks only: `backlog`, `refined`, `active`, `done`, `released`. Defaults to `backlog`. |
| `refs` | object | no | Task references only. Links to `requirements` (filenames), `design` (filenames), `implements` (source paths). |

No other fields are accepted (`additionalProperties: false`).

## Document Kinds

- **idea** — Single project-level idea document (`docs/idea.md`). No slug needed. Overwritten on each call.
- **requirement** — Stored in `docs/requirements/{category}-{slug}.md` (or `{slug}.md` without category).
- **design** — Stored in `docs/design/{category}-{slug}.md` (or `{slug}.md` without category).
- **task** — Stored in `docs/tasks/{slug}.md`. Supports `status` and `refs` fields.

## Example Invocations

Write an idea:

```json
{
  "name": "virgil_write",
  "arguments": {
    "doc_kind": "idea",
    "content": "# My Feature\n\nDescription of the feature..."
  }
}
```

Write a requirement with category:

```json
{
  "name": "virgil_write",
  "arguments": {
    "doc_kind": "requirement",
    "slug": "user-auth",
    "category": "functional",
    "content": "# User Authentication\n\nRequirements for auth flow..."
  }
}
```

Write a task with refs:

```json
{
  "name": "virgil_write",
  "arguments": {
    "doc_kind": "task",
    "slug": "implement-login",
    "content": "# Implement Login\n\nBuild the login form...",
    "status": "backlog",
    "refs": {
      "requirements": ["functional-user-auth.md"],
      "design": ["arch-auth-flow.md"]
    }
  }
}
```

## After Calling

Check `status` in the response:

- `success` — document written; `artifacts` lists the file path created.
- `blocked` or `error` — read the `error` field and surface it to the
  user before retrying.

## References

- `../virgil-workflow/SKILL.md` — full workflow this tool is part of.
- `../virgil-transition/SKILL.md` — to change task status after writing.
