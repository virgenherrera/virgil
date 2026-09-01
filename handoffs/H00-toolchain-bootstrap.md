# H00 — Toolchain Bootstrap & Receipt-Driven Development Gate

> **Project:** Virgil
> **Artifact type:** Child handoff
> **Parent:** [`VIRGIL_HANDOFF_SEED.md`](../VIRGIL_HANDOFF_SEED.md)
> **Status:** Ready for assignment
> **Normative agent behavior:** [`AGENTS.md`](../AGENTS.md)

## Menú

- [Progress Tracker](#progress-tracker)
- [Objective](#objective)
- [Dual-Use Context](#dual-use-context)
- [Scope](#scope)
- [Out of Scope](#out-of-scope)
- [Preconditions](#preconditions)
- [Deliverables](#deliverables)
- [Verification Requirements](#verification-requirements)
- [Evidence Requirements](#evidence-requirements)
- [Risks and Constraints](#risks-and-constraints)
- [References](#references)

---

## Progress Tracker

- [ ] Assignment accepted
- [ ] Preconditions verified
- [ ] `gentle-ai` 2.5.0 confirmed available on machine
- [ ] `gentle-ai install --dry-run` output reviewed
- [ ] `gentle-ai install` executed in repository root
- [ ] `.claude/` directory created with agents, skills, and settings
- [ ] `.claude/` added to `.gitignore` as agent-local operational state
- [ ] `gentle-ai review mode enable --scope global` executed
- [ ] Receipt-driven development confirmed active (`gentle-ai review mode status` reports `on`)
- [ ] SHARED_VERIFICATION.md updated with review gate section
- [ ] AGENTS.md amendments verified present and correct (owner pre-approved)
- [ ] All Markdown follows menu/backlink rules
- [ ] All persistent artifacts use International English
- [ ] Evidence recorded
- [ ] Handoff completion report produced

[↑ Menú](#menú)

---

## Objective

Establish the development toolchain foundation that all subsequent handoffs depend on. After this handoff is complete:

1. The Virgil repository has `gentle-ai` configured as the development quality gate through its `.claude/` agent configuration surface.
2. Receipt-driven development is active for this clone, meaning every implementation change can be reviewed through the `gentle-ai review` pipeline before delivery.
3. The global machine dependency on `gentle-ai` 2.5.0 is documented and verified.
4. SHARED_VERIFICATION.md includes review gate items that child handoffs inherit automatically.

This handoff is **Wave 0** — it blocks all other handoffs including H01.

This handoff does **not** produce product code, tests, or build artifacts. It produces the toolchain contract that governs how product code is developed and verified.

[↑ Menú](#menú)

---

## Dual-Use Context

Virgil has a dual relationship with `gentle-ai`:

### As a product being developed

Virgil is currently a collection of planning documents (handoffs, AGENTS.md, seed). When implementation begins (H01 onward), the development of Virgil itself uses receipt-driven development as a quality gate. Every implementation change goes through `gentle-ai review start` before delivery.

This means:

- `gentle-ai` is a development-time dependency, like `pnpm` or `node`.
- It is not a runtime dependency — Virgil users never need `gentle-ai` installed.
- It is not an npm dependency — it is a global machine tool.
- Its configuration lives in `.claude/` which is agent-local operational state (gitignored by default per AGENTS.md Repository Hygiene rules).

### As a tool that helps agents

Virgil will generate implementation handoffs for other projects. Virgil produces tool-agnostic handoffs with registered providers and cached RAG context. The receiving agent — which preferably has `gentle-ai` installed — adapts using its own toolchain and applies its own quality gates.

This means:

- Virgil does not detect, interrogate, or condition on the target project's environment.
- Virgil does not know or assume the target project's tech stack.
- The handoff protocol (H09) generates tool-agnostic handoffs. Receiving agents with `gentle-ai` apply review gates through their own toolchain.
- The review gate pattern established in SHARED_VERIFICATION.md serves as Virgil's own development pattern, not as a template injected into generated handoffs.

H00 establishes the pattern for Virgil's own development. H09 (Handoff Protocol) defines the machine-readable handoff format independently.

[↑ Menú](#menú)

---

## Scope

### Included

1. **Global toolchain verification** — Confirm `gentle-ai` 2.5.0 is available on the development machine. Document it as a machine-level prerequisite alongside `node` and `pnpm`.
2. **Repository agent configuration** — Run `gentle-ai install` in the repository root to create the `.claude/` directory with agents, skills, and settings appropriate for the project.
3. **Agent-local state hygiene** — Ensure `.claude/` is treated as agent-local operational state per AGENTS.md Repository Hygiene rules. It must be gitignored. `AGENTS.md` remains the canonical open-standard contract.
4. **Receipt-driven development activation** — Run `gentle-ai review mode enable --scope global` to activate review mode. Individual clones can override to off with `gentle-ai review mode disable --scope clone`.
5. **Review gate injection into SHARED_VERIFICATION.md** — Add review verification items to the shared reference so all child handoffs (H01-H18) inherit review gates without modification.
6. **AGENTS.md amendment verification** — Verify that the owner-approved amendments to AGENTS.md are present and correct. The amendments declare `gentle-ai` as a global development toolchain dependency, `.claude/` as agent-local state, review as a verification layer, and token discipline rules.
7. **Dry-run documentation** — Before executing `gentle-ai install`, run with `--dry-run` to document what will be created. The dry-run output becomes part of the evidence.

### What this handoff does NOT do

- AGENTS.md amendments were pre-approved by the owner and are committed alongside this handoff.
- It does not create product code, tests, or build configurations.
- It does not configure SDD (Spec-Driven Development). SDD initialization is orthogonal and may be introduced later if the owner decides the structured specification cycle adds value.
- It does not commit `.claude/` contents. The directory is operational state, not repository canon.
- It does not enforce review mode globally. `--scope clone` means each developer's clone makes its own decision. The repository documents the recommendation but does not mandate.

[↑ Menú](#menú)

---

## Out of Scope

| Exclusion | Reason |
| --- | --- |
| SDD initialization (`sdd-init`) | Orthogonal to receipt-driven development; separate owner decision |
| Repository scaffold (pnpm, NestJS, TypeScript) | H01 |
| Product code implementation | H01 onward |
| CI/CD pipeline configuration | H18 |
| Global `gentle-ai install --scope global` | Machine-level setup is developer responsibility, not a repository handoff |
| Committing `.claude/` directory contents | Agent-local operational state per AGENTS.md |
| Modifying AGENTS.md without owner approval | AGENTS.md is owner-controlled canon |
| Target environment detection for generated handoffs | Virgil generates tool-agnostic handoffs; receiving agents adapt |

[↑ Menú](#menú)

---

## Preconditions

1. The repository contains `AGENTS.md` (immutable, already present).
2. The repository contains `VIRGIL_HANDOFF_SEED.md` (architectural seed).
3. The repository contains `handoffs/SHARED_VERIFICATION.md` (shared verification reference).
4. `gentle-ai` 2.5.0 is installed globally on the development machine (`gentle-ai --version` reports `2.5.0`).
5. The developer has reviewed `gentle-ai install --dry-run` output and understands what will be created.

[↑ Menú](#menú)

---

## Deliverables

### D1 — Global Toolchain Verification

Verify that the required global development tools are available and at the correct versions.

**Acceptance criteria:**

- `gentle-ai --version` reports `2.5.0`.
- `node --version` reports `v24.16.0`.
- `pnpm --version` reports `11.24.0`.
- Version evidence is captured for the handoff completion report.

### D2 — Repository Agent Configuration

Run `gentle-ai install` in the repository root to create the agent configuration surface.

**Acceptance criteria:**

- `gentle-ai install --dry-run` is run first and output captured as evidence.
- `gentle-ai install` creates `.claude/` directory with agents, skills, and settings.
- `.claude/` is gitignored (either by existing `.gitignore` pattern or by adding it).
- No files from `.claude/` appear in `git status` as untracked after installation.
- `AGENTS.md` remains unchanged — the `.claude/` configuration is a compatibility bridge, not a competing policy source.

### D3 — Receipt-Driven Development Activation

Enable review mode for this repository clone.

**Acceptance criteria:**

- `gentle-ai review mode enable --scope global` executes successfully.
- `gentle-ai review mode status` reports receipt-driven development as `on`.
- The activation is documented so other developers know to run the same command after cloning.

### D4 — SHARED_VERIFICATION.md Review Gate Update

Add review verification items to the shared reference so child handoffs inherit them.

**Acceptance criteria:**

- SHARED_VERIFICATION.md includes a new section for review gate verification.
- The review gate items are conditional — they apply when `gentle-ai review mode status` reports `on`, and are documented as recommended but not blocking when review mode is off.
- The section documents the review lifecycle: `review start` → reviewer execution → `review capture-result` → receipt.
- Standard Progress Tracker items in SHARED_VERIFICATION.md include an optional review gate checkbox.

### D5 — AGENTS.md Amendment Verification

Verify that the owner-approved amendments to AGENTS.md are present and correct.

**Context:** The owner pre-approved these amendments during the H00 design session. They are committed alongside this handoff rather than proposed separately.

**Acceptance criteria:**

- AGENTS.md contains the Global Development Toolchain section declaring `gentle-ai` 2.5.0.
- AGENTS.md Repository Hygiene includes `.claude/` alongside `.atl/`.
- AGENTS.md Verification Policy includes the Review (Receipt-Driven Development) subsection.
- AGENTS.md Main Agent Rule, Context Budget Governance, and Model-Tier Routing include the token discipline amendments.
- All amendments are consistent with the content documented in this handoff.

[↑ Menú](#menú)

---

## Verification Requirements

This handoff has no build, static, or dynamic verification gates because it produces no product code. Verification is based on tool state and documentation correctness.

### Toolchain State

- `gentle-ai --version` reports `2.5.0`
- `gentle-ai review mode status` reports `on` for this clone
- `gentle-ai sdd-status` resolves without errors (confirms CLI can introspect the repo)
- `.claude/` exists and is gitignored
- `AGENTS.md` is byte-identical to its pre-handoff state (unless the owner approved an amendment during this handoff)

### Documentation State

- SHARED_VERIFICATION.md updated with review gate section
- All modified Markdown follows menu/backlink rules from AGENTS.md
- All persistent artifacts use International English

[↑ Menú](#menú)

---

## Evidence Requirements

1. Terminal output of `gentle-ai --version` showing `2.5.0`.
2. Terminal output of `node --version` showing `v24.16.0`.
3. Terminal output of `pnpm --version` showing `11.24.0`.
4. Terminal output of `gentle-ai install --dry-run` showing planned configuration.
5. Terminal output of `gentle-ai install` showing successful installation.
6. Terminal output of `gentle-ai review mode enable --scope global`.
7. Terminal output of `gentle-ai review mode status` showing `on`.
8. Diff of SHARED_VERIFICATION.md showing added review gate items.
9. Diff of AGENTS.md showing the owner-approved amendments.
10. Confirmation that `git status` shows no untracked `.claude/` files (i.e., properly gitignored).

[↑ Menú](#menú)

---

## Risks and Constraints

| Risk | Mitigation |
| --- | --- |
| `gentle-ai install` may create files that conflict with existing `.atl/` patterns | Run `--dry-run` first; review output; `.claude/` and `.atl/` are independent surfaces |
| `.claude/` contents may drift across `gentle-ai` versions | `gentle-ai sync` updates configuration to current version; document this as a maintenance operation |
| Review mode activation is per-clone and not inherited | Document the activation command in developer onboarding; H01 preconditions reference it |
| AGENTS.md amendments may need revision after implementation experience | Amendments are versioned in git; the owner can revise as needed |
| `gentle-ai install` flags may vary by version | Pin exact version (2.5.0); run `--help` first; capture exact flags used as evidence |
| Review mode may interfere with rapid prototyping | Review mode asks per candidate; `not now` applies to that candidate only; `disable` turns it off entirely |

[↑ Menú](#menú)

---

## References

- [`AGENTS.md`](../AGENTS.md) — normative agent behavior contract (immutable)
- [`VIRGIL_HANDOFF_SEED.md`](../VIRGIL_HANDOFF_SEED.md) — architectural seed and parent handoff
- [`SHARED_VERIFICATION.md`](./SHARED_VERIFICATION.md) — standard verification gates and POC-00 validated stack versions
- [AGENTS.md Open Standard](https://agents.md/) — Linux Foundation open agentic standard

[↑ Menú](#menú)
