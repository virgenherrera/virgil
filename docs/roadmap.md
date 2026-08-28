# Implementation Roadmap

Practical roadmap for contributors and the project owner (MIM) picking up
Virgil after the clean-slate reset. This is a working plan, not a
constitutional document — it derives from `principia/constitution.md` and
`AGENTS.md` but carries no authority of its own. If it drifts from either,
they win.

## Current State

- `principia/constitution.md` is sealed with five constitutional
  clarifications (CC-1 through CC-5) already incorporated.
- `AGENTS.md` is established: it defines the two-layer architecture
  (Principia governs Runtime directly, no intermediate Dogma), the
  ecosystem map (gentle-ai / engram / Virgil), the adapter pattern, commit
  conventions, tool prohibitions, the Echo System mapping to Go commands,
  and the orchestrator-minion pattern for sub-agent delegation.
- Zero runtime code exists on this branch. `cmd/`, `internal/`, the prior
  `docs/` (Dogma layer), CI, Docker, and the Makefile were all removed in
  `chore: clean slate — principia only` (`c64c70d`).
- All of that code is intact and recoverable from `main` — nothing was lost,
  it was deliberately set aside pending re-derivation against the current
  Principia.

```mermaid
flowchart LR
    P["Principia\nsealed, 5 CCs"] --> A["AGENTS.md\nestablished"]
    A --> R["Runtime\nzero code, this branch"]
    R -.->|"recoverable"| M["main\nfull prior implementation"]

    style P fill:#2b5,stroke:#333,color:#fff
    style A fill:#47a,stroke:#333,color:#fff
    style R fill:#c44,stroke:#333,color:#fff
    style M fill:#777,stroke:#333,color:#fff
```

## Phase 1 — Core Runtime

Re-derive the minimum viable slice: the MCP server, the Kernel, the
lifecycle state machine, and the `repo-docs` adapter.

- Stand up the MCP server entrypoint (`cmd/virgil/main.go` in `main` is a
  starting reference, not a template to copy uncritically).
- Implement the Kernel pieces that the state machine and the four core MCP
  tools depend on directly: Ledger (event log), ArtifactRepository
  (deliverables/revisions/provenance), and enough of ContextCompiler and
  EvidenceIngestion to support `virgil_write` and `virgil_transition`.
- Implement the six-state lifecycle machine (Idea -> Requirements -> Design
  -> Tasks -> Handoff -> Execution -> Verify -> Deliver -> Operation) as
  described in `docs/architecture.md`, including gap-detection routing
  (`PlanningGapDetected`) back to Planning.
- Re-derive `repo-docs` as the default `ArtifactStoreAdapter`, writing to
  `{target}/docs/virgil/`. `internal/repodocs` in `main` already solves most
  of this at the function level (`Init`, `Write`, `Transition`); pull it
  forward and re-validate it against the current Principia rather than
  assuming it's correct as-is.
- Wire up `virgil_init`, `virgil_status`, `virgil_write`, `virgil_transition`
  end to end against `repo-docs`.

## Phase 2 — Adapter Interface

Formalize the plugin surface so external backends can attach without
touching the Kernel.

- Extract `repo-docs`'s package-level functions behind a formal
  `ArtifactStoreAdapter` Go interface, following the pattern already set by
  `internal/agents/adapter.go`'s `Adapter interface` (identity, detection,
  capabilities, operations) — Open/Closed, each backend an additional
  implementation, never a conditional branch.
- Define the contract methods concretely in code: persist, retrieve,
  transition (with gate validation), inventory (without requiring full
  content read), frontmatter/revision management, and namespace scoping.
  See `docs/adapter-contract.md` for the conceptual shape.
- Define the plugin loading mechanism — how `virgil.json` names an adapter
  and how the binary resolves and loads it (compiled-in registry to start;
  a true dynamic plugin loader is a later concern, not a Phase 2
  requirement).
- Verify `repo-docs` against the new interface as the reference
  implementation before building anything else against it.

## Phase 3 — First External Adapter

Prove the plugin system works end to end with a real, non-`repo-docs`
backend.

- Build a Jira adapter as the proof of concept — see the concept mapping
  sketch in `docs/adapter-contract.md` (Epic -> idea, Story -> requirement,
  Sub-task -> task).
- The adapter's `Transition` implementation is the hard part: it must
  reject a transition that violates Virgil's lifecycle gates even when
  Jira's own workflow would technically permit it.
- Treat this as validation of Phase 2's interface, not just a feature. If
  building the Jira adapter forces changes to the `ArtifactStoreAdapter`
  interface, that is expected — fix the interface, don't special-case Jira.

## Phase 4 — RAG + Codebase Bridge

Implement the retrieval and traceability layer that lets agents query
instead of reading full files, and that closes the PM-to-codebase loop.

- Implement `consumerRag` (the retrieval projection for a consumer project)
  with watermark tracking and drift detection against `HEAD`.
- Implement the story -> code traceability mapper that realizes the
  `TraceabilityGraph` (intent -> decision -> work -> evidence) described in
  CC-5 — the mechanism that makes the PM-to-codebase bridge concrete rather
  than aspirational.
- `codebaseMemory` (the AST-derived structural graph) is explicitly an
  architectural provision for this phase, not a hard requirement — see
  Non-Goals below.

## Phase 5 — Ecosystem Integration

Publish Virgil so it is consumable by the broader agent ecosystem.

- Publish as an MCP server consumable by gentle-ai and any other
  MCP-compatible host (Claude Code, Cursor, Windsurf, Kiro, OpenCode).
- Define the provider contract precisely enough that a new host requires
  only a new `HostAdapter` implementation, never Kernel or
  `ArtifactStoreAdapter` changes (this invariant already holds by
  construction if Phase 1-2 are done correctly — Phase 5 is where it gets
  tested against a real second host).
- Distribute the binary (Homebrew tap, direct binary releases, or both).

## Recovery Protocol

Recover a specific file or directory from `main` into the current working
tree without pulling in the rest of `main`'s history:

```bash
git checkout main -- <path>
```

Examples:

```bash
git checkout main -- internal/mcp/
git checkout main -- internal/repodocs/repodocs.go
git checkout main -- cmd/virgil/main.go
```

**Safe to recover as-is (with re-validation, never blind trust):**

- Interface patterns already aligned with the current architecture, such as
  `internal/agents/adapter.go`'s `Adapter interface` — read it, confirm it
  still matches the Principia, then reuse the pattern.
- Low-level utility code with no architectural assumptions baked in.

**Needs re-derivation, not blind recovery:**

- Anything that assumed the old three-layer model (Principia -> Dogma ->
  Runtime). That intermediate Dogma layer was retired; recovered code
  referencing it as authority must be reinterpreted as reference material
  for re-deriving design, never reinstalled as-is.
- `docs/architecture/` or `docs/protocol/` content from `main`'s old
  `docs/` — if recovered, treat it as inspiration for re-derivation, not as
  a document to drop back in place.
- Anything recovered must pass through Echo (build, static, dynamic) before
  being considered integrated. Recovered code is new code for this branch —
  it gets the same fresh build and full verification as anything else,
  never an exemption because "it worked before."

## Non-Goals for V1

Per the Principia's stated scope (`principia/constitution.md`, line ~168),
these are explicitly out of scope for the minimum viable slice:

- **Method Pack extensions beyond Scrum.** Waterfall, Kanban, Shape Up, and
  custom packs are TBD — not implemented, and not required for v1. The
  Kernel plus the Scrum Method Pack constitute the minimum viable slice.
- **`codebaseMemory`.** The AST-derived structural graph is an
  architectural provision the Principia makes room for (section 8f), not a
  v1 requirement. Build the RAG-over-deliverables path first; the
  structural code graph is Phase 4 material at the earliest, and can slip
  further without blocking anything else on this roadmap.

Adapter plugins for PM backends (Jira, Azure DevOps, GitLab, GitHub
Projects, Basecamp) are explicitly **not** in this non-goals list — per
constitutional clarification CC-2, they are part of the core architecture,
even though only `repo-docs` is implemented today.
