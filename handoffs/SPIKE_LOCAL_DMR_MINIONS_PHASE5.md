# SPIKE — Local DMR Minions Phase 5: Probe as NestJS Package

> **Project:** Virgil
> **Artifact type:** Spike handoff (amendment)
> **Status:** Pending
> **Parent:** [Phase 4](./SPIKE_LOCAL_DMR_MINIONS.md)
> **Normative policy:** [`AGENTS.md`](../AGENTS.md)

Phase 4 delivered a working hardware probe and ceiling calculator as a standalone TypeScript script (`scripts/virgil-model-probe.ts`) requiring `tsx` as a runtime dependency. This was expedient but architecturally wrong — the monorepo already has a NestJS + nest-commander CLI pattern (`packages/cli`), and the probe should follow it.

## Goal

Migrate the probe script into a proper NestJS package (`packages/tools` or similar) using nest-commander, eliminating the `tsx` devDependency and aligning with the monorepo's existing patterns.

## Scope

- [ ] Create `packages/tools` (or `packages/dev-tools`) as a new workspace package
- [ ] Scaffold with NestJS + nest-commander following `packages/cli` patterns
- [ ] Migrate all 6 probe commands (detect, fitness, ceiling, probe, benchmark, select) as nest-commander subcommands
- [ ] Migrate all Zod schemas from the standalone script
- [ ] Update root `package.json` probe script to invoke the new package
- [ ] Remove `tsx` from root devDependencies and catalog (if no other consumer)
- [ ] Remove or deprecate `scripts/virgil-model-probe.ts`
- [ ] Update README.md, AGENTS.md, and handoff documentation
- [ ] Ensure all commands work via `pnpm probe <subcommand>` as before

## Constraints

- This is development workflow infrastructure, not a Virgil product feature
- Follow existing monorepo patterns (exact deps, catalog, static/dynamic test gates)
- Strict TDD: tests first, vitest, app-level integration tests per AGENTS.md testing policy
- The probe must remain a development-time tool, not bundled into the Virgil CLI product

## Acceptance Criteria

- `pnpm probe detect` works from repo root
- Zero `tsx` dependency at root level
- All 6 commands functional with identical behavior to Phase 4 script
- Test coverage matching AGENTS.md policy (>97%)
- Adversarial review passes clean
