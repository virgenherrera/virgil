# Spike Decision Report — Local Docker Compose Model Minions

> **Date:** 2026-09-02
> **Branch:** spike/local-dmr-minions
> **Verdict:** adopt narrower path

## Menú

- [Executive Summary](#executive-summary)
- [Infrastructure Verdict](#infrastructure-verdict)
- [Model Verdict](#model-verdict)
- [Phase-3 Eligibility](#phase-3-eligibility)
- [Recommended Next Steps](#recommended-next-steps)
- [Evidence Index](#evidence-index)
- [Completion Report](#completion-report)

---

## Executive Summary

The Docker Model Runner (DMR) + Compose Models infrastructure is proven end-to-end on this
machine: static config resolution, live `compose up` provisioning, container-to-DMR inference
over `host.docker.internal:12434`, and all six security hardening controls pass empirically.
The bundled `ai/smollm2:latest` model (361.82M parameters), however, fails to perform the
assigned worker and reasoning tasks — it echoes prompt templates instead of reasoning, scoring
0% strict correctness on the JSON-contract and classification fixtures. Latency and concurrency
are not the bottleneck; model capacity is. The recommended path is to **adopt the infrastructure
and hardening design**, but **narrow the scope to re-testing with a larger model** before any
Phase-3 AGENTS.md amendment is applied.

[↑ Menú](#menú)

---

## Infrastructure Verdict

All infrastructure-layer questions from W1–W4 resolved to PASS, with one earlier assumption
(W1) corrected in W2/W3.

Key findings:

- **Docker Engine/Compose/DMR**: Docker Engine 29.7.2 (Docker Desktop 4.89.0), Compose v5.5.0,
  DMR running with an active Metal-accelerated llama.cpp backend. `docker model` CLI usage for
  worker-tier local inference is viable.
- **Compose Models**: W1's initial "unsupported" reading was premature — an unreferenced
  top-level `models:` key is pruned by Compose like any unused top-level block. When a service
  declares `models: [<name>]` referencing the top-level entry, `docker compose config` resolves
  it correctly and `docker compose config --models` lists it. W3 confirmed live `docker compose
  up` also works end-to-end: model pull/provisioning, container start, worker command execution,
  clean exit 0.
- **Container-to-DMR inference**: works, but only via `host.docker.internal:12434` — a
  service-name-style hostname derived from the model key (e.g. `model-backend`) does NOT
  resolve; that alias is not auto-injected by this Compose/DMR version. `depends_on:
  <model-key>` is invalid (models are not services in the dependency graph).
- **Security hardening**: all 6 controls pass — `network_mode: none` blocks all networking
  (ping unreachable), DMR is unreachable from the isolated executor (network_mode: none also
  strips the `host.docker.internal` DNS alias, a hard architectural block not just a firewall
  rule), Docker socket is absent (no bind mount), `read_only: true` + scoped `tmpfs` blocks root
  writes while allowing tmpfs writes, `deploy.resources.limits` (64M memory, 10 PIDs) is enforced
  via cgroup v2 on plain `docker compose up` (no swarm required), and the container runs as
  non-root (`user: nobody`).
- **Broker/executor architecture**: viable — a broker process can retain network access to reach
  DMR, while an isolated executor with `network_mode: none` is architecturally incapable of
  reaching DMR directly, satisfying the "executor must not talk to DMR directly" design
  requirement.

[↑ Menú](#menú)

---

## Model Verdict

W5 benchmarked `ai/smollm2:latest` (361.82M params, IQ2_XXS/Q4_K_M quant) on Apple M1 Pro / 16GB
/ Metal across 6 fixtures.

Key findings:

- **Failure mode**: on fixtures 1–3 (structured JSON output, repo classification, test-failure
  diagnosis) the model echoes the prompt's literal template/placeholder text (e.g. unfilled
  `"0.0-1.0"`, bare `"..."`) instead of computing real values — 0% JSON validity, 0% strict
  correctness on all three.
- **Worker tier: unqualified** — requires >66% strict correctness on fixtures 1–2; actual is 0%.
- **Reasoning tier: unqualified** — requires >66% across fixtures 1–4; actual is 25%, and that
  25% (fixture 4, "patch") is a fixture-design artifact: the prompt's own template already
  contained the correct fix string, so the model's template-echo behavior coincidentally matched
  ground truth rather than reflecting genuine reasoning.
- **Pro tier: untested** (never in scope for this hardware/model combination).
- **Performance is not the bottleneck**: sequential p50 248ms / p95 257ms; 3x concurrent
  requests all completed with HTTP 200, no errors, no garbling — concurrency added ~1.8x latency
  (contention, not failure). The model serves reliably fast; it does not serve correctly.

**Recommendation**: the failure is in model capacity, not infrastructure. Test with a larger
model that still fits in 16GB unified memory (e.g. `llama3.2:3B-Q4`, `qwen2.5:7B-Q4`, or
`phi-3.5-mini:3.8B-Q4`). The M1 Pro / 16GB / Metal hardware profile should comfortably run
3–7B-parameter quantized models.

[↑ Menú](#menú)

---

## Phase-3 Eligibility

Per the handoff: "Modify AGENTS.md a second time only after every Phase-2 pass condition
succeeds."

Status of pass conditions:

1. Phase-1 policy reviewable, no unverified Docker claim — PASS
2. Repeatable profile detects availability — PASS
3. Provisioning and execution separate — PASS
4. DMR API not exposed to unapproved clients — PASS (`network_mode: none` blocks it)
5. Executor disconnected, credential-free, socket-free, least-privilege — PASS
6. Cache, permissions, tier eligibility, budgets fail closed — PARTIAL (Context Capsule
   prototype not built)
7. At least one worker fixture passes reproducibly — FAIL (smollm2 unqualified)

**Phase-3 eligibility: BLOCKED** — condition 7 fails (no qualified model), condition 6 is
partial (Context Capsule not prototyped).

**Owner decision (2026-09-02):** spike marked successful. Phase-3 amendment explicitly skipped — no qualified model. Context Capsule prototype deferred. Infrastructure path proven; model qualification and Context Capsule are future spike scope.

[↑ Menú](#menú)

---

## Recommended Next Steps

1. **Provision a larger model** (requires owner approval + network): try `llama3.2:3B`,
   `qwen2.5:7B`, or `phi-3.5-mini:3.8B` in Q4 quantization. Re-run the W5 benchmark against it.
2. **Context Capsule prototype**: implement the bounded context mechanism for minion dispatch.
   This is independent of model qualification and can proceed in parallel.
3. **If a model qualifies worker tier**: re-evaluate Phase-3 eligibility and apply the
   conditional AGENTS.md amendment.
4. **If no model qualifies**: the spike verdict becomes "defer" — infrastructure proven but no
   usable local model for this hardware.

**Status:** Steps 1-2 deferred to future spikes by owner decision. The current spike is closed as successful with "adopt narrower path" verdict. The proven infrastructure (Compose Models, DMR, broker/executor isolation, virgil.json governance) is available for future model qualification work.

[↑ Menú](#menú)

---

## Evidence Index

| Evidence | Path |
| --- | --- |
| W1 Capability Profile | `.atl/local-minions/profiles/probe-20260902T144632.json` |
| W3 Compose/Inference Report | `.atl/local-minions/w3-report.json` |
| W4 Security Hardening Report | `.atl/local-minions/w4-report.json` |
| W5 Tier Benchmark Report | `.atl/local-minions/w5-report.json` |
| Spike Handoff | `handoffs/SPIKE_LOCAL_DMR_MINIONS.md` |
| AGENTS.md Cloud Amendment | Committed on spike branch (2453578) |
| virgil.json Config | `virgil.json` |

[↑ Menú](#menú)

---

## Completion Report

**Spike:** Local Docker Compose Model Minions
**Branch:** spike/local-dmr-minions
**Duration:** 2026-09-02 (single session)
**Verdict:** Adopt narrower path

### What was proven

1. Docker Model Runner (DMR) provides local LLM inference via an OpenAI-compatible API at `localhost:12434`, accelerated by Metal on Apple Silicon.
2. Docker Compose Models (top-level `models:` key) resolves and provisions correctly on Compose v5.5.0 when a service references the model.
3. Container-to-DMR inference works via `host.docker.internal:12434`.
4. Full security hardening is enforceable: `network_mode: none`, `read_only: true`, non-root user, `cap_drop: [ALL]`, `no-new-privileges`, CPU/RAM/PIDs limits — all verified on Docker Desktop for Mac.
5. An isolated executor with `network_mode: none` CANNOT reach DMR — `host.docker.internal` DNS is stripped entirely. This proves the broker/executor separation by construction.
6. The `virgil.json` governance config with ceiling control (disabled/worker/reasoning/pro) provides owner-controlled local minion policy.
7. The AGENTS.md cloud budget enforcement amendment (Delegation Budget Declaration, Tier Accountability, Fleet and Session Budget Governance) addresses the original token-burn incident.

### What was not proven

1. No model qualified for any tier. `ai/smollm2:latest` (361M params) echoes prompt templates instead of reasoning. Worker tier requires >66% strict correctness; actual: 0%.
2. Context Capsule mechanism not prototyped.
3. End-to-end minion dispatch (orchestrator → capsule → broker → DMR → executor → receipt) not demonstrated.

### Deferred to future spikes

1. Provision and benchmark a larger model (3-7B params, Q4 quantization, fits in 16GB) for worker/reasoning tier qualification.
2. Context Capsule prototype — bounded, content-addressed execution context for minion dispatch.
3. Phase-3 conditional AGENTS.md local-first amendment — blocked until a model qualifies and Context Capsule exists.
4. End-to-end orchestrator-to-receipt demonstration.

### Artifacts produced

| Artifact | Path | Status |
| --- | --- | --- |
| AGENTS.md cloud budget enforcement | `AGENTS.md` | Committed (2453578) |
| virgil.json + config script | `virgil.json`, `scripts/virgil-config.ts` | Staged |
| Spike handoff (updated) | `handoffs/SPIKE_LOCAL_DMR_MINIONS.md` | Staged |
| Decision report | `handoffs/SPIKE_LOCAL_DMR_MINIONS_DECISION.md` | Staged |
| W1 capability profile | `.atl/local-minions/profiles/probe-*.json` | Local (gitignored) |
| W3 inference report | `.atl/local-minions/w3-report.json` | Local (gitignored) |
| W4 hardening report | `.atl/local-minions/w4-report.json` | Local (gitignored) |
| W5 benchmark report | `.atl/local-minions/w5-report.json` | Local (gitignored) |

[↑ Menú](#menú)
