---
id: planning/index
title: "Planning"
mode: planning
type: index
tags: [planning, idea, handoff, artifacts, phases]
---

# Planning

← [Main Index](../README.md)

> From idea to handoff. Defines WHAT to build before building it.

Planning produces a `handoff.md` that is validated mechanically with
`virgil handoff lint` — a deterministic gate, not a subjective review.
The resulting handoff enables **parallel execution by lanes**: it is not
a serial pipeline that a single executor walks end to end, but rather
a contract with tasks grouped into independent lanes that multiple
executors can claim and advance simultaneously.

---

## Documents

| Document | What it defines |
|-----------|-----------|
| [Operational Model](operational-model.md) | Framework modes, ownership, limits, adapter |
| [Artifacts](artifacts/README.md) | 6 universal artifacts, TPM, state machine, adapters |
| [SM Behavior](behavior/README.md) | SM as facade, phases 1-8, fastForward, tiers, PDC |
| [Roles](roles/README.md) | 5 default roles, contracts by phase, ad-hoc roles |
