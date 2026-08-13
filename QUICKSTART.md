# Virgil Quickstart

## 1. Install

```bash
go install github.com/virgenherrera/virgil/cmd/virgil@latest
```

Verify:

```bash
virgil version
```

## 2. Setup

Navigate to your project and install the agent integration:

```bash
cd ~/projects/my-app
virgil install
```

This detects Claude Code (or other agents) and configures the MCP server.
Expected output:

```
Detecting AI agents...
  [ok] Claude Code detected (project-level: .claude/settings.json)
Installing Virgil MCP server...
  [ok] Claude Code: MCP server configured
Virgil installed successfully. Restart your AI agent to activate.
```

Restart Claude Code after installation.

## 3. Use

Open Claude Code in your project. Virgil's 5 tools are now available:

| Tool | What it does |
|------|-------------|
| `virgil_init` | Initialize Virgil in this project (creates `virgil.json` + `AGENTS.md`) |
| `virgil_new` | Start a new planning change |
| `virgil_propose` | Propose content for the current artifact stage |
| `virgil_approve` | Approve the current artifact, advancing the pipeline |
| `virgil_status` | Show current project state |

### Example conversation

```
You:   Initialize this project with Virgil
Agent: [calls virgil_init with project_id "my-app"]
       Project initialized. virgil.json and AGENTS.md created.

You:   I want to add JWT authentication
Agent: [calls virgil_new with change_id "add-jwt-auth"]
       Change created. Ready to propose the idea.

       [calls virgil_propose with artifact_kind "idea"]
       Idea proposed. Awaiting your approval.

You:   Looks good, approve it
Agent: [calls virgil_approve]
       Idea approved. Next step: spec.
```

The agent drives the full pipeline: idea, spec, design, tasks, handoff.
You review and approve each stage.

## 4. Artifact pipeline

Each change goes through 5 sequential stages:

```
idea -> spec -> design -> tasks -> handoff -> complete
```

Each stage is proposed (draft), then approved (advances to next).
Artifacts are stored as markdown files in `docs/{change_id}/`:

```
docs/add-jwt-auth/
  00-idea.md
  01-spec.md
  02-design.md
  03-tasks.md
  04-handoff.md
```

## 5. Wire protocol (advanced)

For direct integration without MCP (scripting, CI, custom tooling),
Virgil accepts JSON envelopes via stdin:

```bash
echo '<json-envelope>' | virgil
```

The envelope format is documented in the `AGENTS.md` that `virgil_init`
generates in your project. See `docs/protocol/core-contracts.md` for
the full specification.
