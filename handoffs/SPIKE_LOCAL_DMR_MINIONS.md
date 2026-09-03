# SPIKE — Local Docker Compose Model Minions

> **Project:** Virgil
> **Artifact type:** Spike handoff
> **Status:** Resumed — Phase 4: hardware fitness probe and ceiling calculator
> **Normative policy:** [`AGENTS.md`](../AGENTS.md)

This spike creates an enforceable, local-first minion path without turning Docker Model Runner (DMR) into an external-model gateway. It responds to the observed incident in which seven Claude background agents exhausted the session limit before four Wave-4 assignments completed. The cloud harness remains the orchestrator; only explicitly eligible, offline-capable work may be delegated to qualified local minions.

## Menú

- [Progress Tracker](#progress-tracker)
- [Decision and Boundaries](#decision-and-boundaries)
- [Phase 0 — Owner Containment](#phase-0-owner-containment)
- [Phase 1 — Verify Cloud Budget Enforcement Baseline](#phase-1-verify-cloud-budget-enforcement-baseline)
- [Phase 2 — Isolated Compose Models Spike](#phase-2-isolated-compose-models-spike)
- [Security Architecture](#security-architecture)
- [Context Capsule Contract](#context-capsule-contract)
- [Capability Qualification](#capability-qualification)
- [Hard Budget Contract](#hard-budget-contract)
- [Verification and Decision Gate](#verification-and-decision-gate)
- [Phase 3 — Conditional Local-First Capability Amendment](#phase-3-conditional-local-first-capability-amendment)
- [Phase 4 — Hardware Fitness Probe and Ceiling Calculator](#phase-4-hardware-fitness-probe-and-ceiling-calculator)
- [Deliverables and Acceptance Criteria](#deliverables-and-acceptance-criteria)
- [Risks and Constraints](#risks-and-constraints)
- [Official References](#official-references)

---

## Progress Tracker

- [x] Assignment accepted
- [x] Owner-created emergency stash reference recorded
- [x] Clean baseline and `spike/local-dmr-minions` branch verified
- [x] Phase-1 cloud budget enforcement baseline verified present in AGENTS.md
- [x] W1 dynamic capability probe implemented and profile collected
- [x] Approved provisioning and disconnected execution paths proven separate
- [x] W3 Compose Models prototype with parameterized model selection completed
- [x] Broker/executor isolation tests completed
- [ ] Context Capsule cache and budget-controller prototype completed — DEFERRED: infrastructure proven, deferred to future spike
- [x] W5 machine tier benchmark and decision report produced
- [x] Phase-3 local-first AGENTS.md amendment applied from passing evidence OR explicitly skipped with blocker evidence — SKIPPED: no model qualified worker tier; blocker evidence in W5 report and decision report
- [ ] Applicable repository verification and evidence report completed — N/A: spike deliverables are policy and prototype, not product code
- [x] Handoff completion report produced
- **Phase 4 — Resumed 2026-09-02** (prior Phase 2 marked fiasco; infrastructure proven but execution reckless)
- [x] Hardware intelligence baseline incorporated (tier equivalences, fitness formula)
- [x] Multi-OS probe script implemented with Zod schemas (8 schemas, 1258 lines)
- [x] TUI or structured output showing CAN vs WANT ceiling (structured JSON + stderr summary)
- [x] Ceiling configuration persisted and validated in virgil.json
- [x] Docker DMR implementation validated against probe output (MODEL_NAME required variable)
- [x] Phase 4 completion report produced — adversarial review complete, all CRITICAL/HIGH/MEDIUM fixed

[↑ Menú](#menú)

---

## Decision and Boundaries

```text
Cloud orchestrator (Claude Code or Gemini)
  ├─ external research, product decisions, credentials, cloud exceptions
  └─ qualified local minion dispatch
       ├─ Engram semantic lookup
       ├─ disposable Context Capsule
       ├─ local DMR inference broker (already-present model only)
       └─ disconnected executor → bounded evidence receipt
```

Eligible local work is limited to no-internet work with a declared need: repository inventory, local search, deterministic extraction, normalization, fixture-based RED → GREEN → REFACTOR loops, test/lint diagnosis, and constrained diff review. Product decisions, web research, provider integration, credentials, and work requiring network access remain with the orchestrator or require an explicit cloud exception.

DMR is **not** an OpenAI, Anthropic, Gemini, or other external-provider proxy, gateway, fallback, or routing layer. A cache miss, unavailable runner, failed benchmark, missing permission, or exhausted budget returns a typed result; it never silently sends the task to cloud.

[↑ Menú](#menú)

---

## Phase 0: Owner Containment

The owner performs containment manually before this handoff begins. Do **not** run this operation on the owner's behalf.

1. Record `git status --short`, current branch, `git rev-parse HEAD`, and time in the spike evidence report.
2. Preserve tracked unstaged changes and untracked non-ignored files while preserving index entries:

   ```sh
   git stash push --keep-index --include-untracked \
     -m "codex-emergency-claude-session-limit-2026-09-02"
   ```

3. Record the resulting `stash@{n}` and SHA from `git stash list --date=local`; verify expected unstaged/untracked paths are absent from `git status --short`.
4. Do not use `--all`: ignored `.atl/`, `.claude/`, credentials, caches, and operational state are deliberately excluded. Do not apply, pop, drop, amend, inspect, or restore this stash during the spike.
5. Create `spike/local-dmr-minions` from the clean post-containment baseline. If that branch exists, stop and record its resolved base; never rebase or force-update it.

[↑ Menú](#menú)

---

## Phase 1: Verify Cloud Budget Enforcement Baseline

Before spike work begins, verify that the cloud-focused AGENTS.md budget enforcement amendment is already committed on the spike branch. This amendment is authored and applied independently of the spike and addresses cloud-agent token exhaustion. It is not a spike deliverable.

Verification checklist:

1. AGENTS.md contains enforceable hard budget rules scoped to ALL agent dispatch (cloud and local), not only local minions.
2. The orchestrator concurrency/session budget reservation rule is present and applies to cloud agent launches.
3. Evidence-only report rules apply to cloud sub-agents, not only future local minions.
4. No local-minion-specific governance, Docker references, model names, or platform capabilities are present in AGENTS.md at this point.

If the baseline is missing, stop and report. The spike does not author this amendment; it only consumes it.

[↑ Menú](#menú)

---

## Phase 2: Isolated Compose Models Spike

After Phase 0 and Phase 1, investigate and prototype Docker Compose Models and DMR only on `spike/local-dmr-minions`. The result may be **adopt**, **adopt a narrower path**, **defer**, or **reject**. Unsupported is an honest measurement outcome, never a reason to weaken constraints.

### W1 — Dynamic capability probe

Implement a repeatable, parameterized probe that discovers what the current machine CAN run — it does not assume specific models, GPU vendors, or runtimes.

The probe MUST dynamically enumerate:

1. **Runtime availability**: Docker Engine/Desktop version, Compose version (≥ v2.38 required), `docker model` subcommand presence, DMR status.
2. **Locally installed models**: immutable identifiers, parameter counts, quantization, context limits — enumerated from `docker model list`, not hardcoded.
3. **Hardware capacity**: OS/architecture, CPU cores, total/available RAM, disk, GPU/VRAM/driver/backend (when detectable). These are inputs to a fitness function, not pass/fail labels.
4. **Compose Models support**: whether top-level `models` renders successfully with the detected Compose version.
5. **Fitness scoring**: for each discovered local model, compute a suitability score against each task class (worker, narrow reasoning) based on measured context window, quantization, available VRAM/RAM, and known minimum thresholds. The thresholds are parameterized, not hardcoded.

The probe MUST NOT enable DMR, pull/search models, install a runner, modify Docker settings, or make network requests. The profile reports each discovered model as `available_locally`, and each unmet dependency as `provisionable_with_approved_network`, `unsupported`, or `unknown`.

The probe output is a machine-specific, content-addressed JSON profile under `.atl/local-minions/profiles/`. It expires and must be re-run when the machine state changes.

### W2 — Provisioning is not execution

| Operation | Connectivity | Required evidence | Forbidden behavior |
| --- | --- | --- | --- |
| Approved provisioning | Explicit owner approval; network permitted | Model/image digest, source/license, size, security result, post-pull inventory | Calling this offline execution. |
| Minion execution | Already-present model only; egress denied and tested | Resolved model/image reference, no-pull proof, receipt | Pulling, registry search, telemetry egress, external API, or cloud fallback. |

Docker documents first-use pulls from Docker Hub, OCI registries, or Hugging Face. It also documents Docker Engine model-name HEAD requests to Docker Hub. Therefore an offline claim requires observed egress-denial evidence for the complete path, including the host runner; omitting an application API key is insufficient.

### W3 — Compose Models broker/executor prototype

Compose Models requires Compose v2.38+ and a compatible platform. Evaluate top-level `models`, model bindings, `context_size`, and `runtime_flags` using a pinned minimum version. Auto-provisioning or a context setting beyond measured capacity is a failure, not convenience.

| Component | Network | Filesystem / credentials | Role |
| --- | --- | --- | --- |
| Orchestrator | Per task | Normal harness boundary | Decisions and exceptions. |
| DMR / broker | Only the measured local DMR path; no general egress | Capsule in; bounded response out; no source write, socket, or cloud credentials | Local inference from an already-installed model. |
| Executor | `network_mode: none` | No socket/credentials; no source mount unless declared; read-only narrow mount when needed | Approved local tools and bounded evidence. |

Model selection in the Compose file MUST be driven by the W1 probe profile, not hardcoded. The `docker-compose.yml` template uses the probe's discovered model references and fitness scores to select the best-fit locally-available model for each task class. If no model meets the minimum threshold for a task class, that class is marked `unsupported` — the template does not fall back to a different model or cloud. The Compose template MUST be parameterizable: model reference, context_size, runtime_flags, and resource limits are variables resolved from the probe profile at dispatch time, not static values committed to the repository.

DMR's API is unauthenticated for reachable clients. Prove—not assume—that arbitrary containers and LAN clients cannot reach it. `docker model gateway` is prohibited: Docker documents external-provider/fallback routing, which violates this design. If Compose Models cannot keep broker-to-DMR access narrow and prevent general egress, retain the executor boundary and defer/reject that route rather than weakening it.

### W4 — Hardening and controller prototype

Render and inspect Compose configuration before execution. Enforce or explicitly report platform-unavailable controls: executor `network_mode: none`; no default network attachment, ports, host networking, Docker socket, privileged mode, host PID/IPC/user namespace, or cloud credentials; `read_only: true`, non-root user, `cap_drop: [ALL]`, `no-new-privileges`, CPU/RAM/PIDs/ulimits/time limits, `restart: "no"`, pinned images, `tmpfs`, bounded output volume, and long read-only bind mounts with `create_host_path: false`. No source mount is allowed when the Capsule is sufficient.

The controller validates task eligibility, capsule/profile freshness, permission manifest, tier qualification, and reserved budget before it can create a container. It fails closed with a typed receipt.

### W5 — Tier benchmark

Use fixed, non-sensitive offline fixtures with ground truth: strict structured JSON, bounded repository classification, RED → GREEN → REFACTOR planning, test-failure diagnosis, constrained patch proposal, isolation-negative tests, latency/throughput under load, context under load, and safe concurrency. Do not infer tiers from branding or parameter count.

[↑ Menú](#menú)

---

## Security Architecture

Every request is an immutable task manifest declaring task class, accepted Capsule hash, local-profile hash, selected model reference, allowed tools, declared source paths, output destination, and all resource/budget limits. Omitted permission means denied.

The executor begins with no file access. A source mount must be read-only, path-narrow, and manifest-validated. Patches and reports exit only through a separate bounded output channel; execution cannot mutate the checkout directly. Document Docker Desktop versus Linux Engine differences; no hardening claim generalizes without evidence.

Required negative tests:

- Executor cannot resolve/reach internet, host services, DMR, or Docker API.
- Broker cannot reach beyond the measured DMR path; registry/external API attempts fail.
- Unapproved containers and LAN clients cannot reach DMR's unauthenticated API.
- Executor cannot read Docker socket, cloud credential variables/files, unmounted paths, or write source.
- Absent local model yields `local_unavailable`, no pull, and no cloud retry.
- Stale/malformed Capsule/profile, hash mismatch, timeout, malformed output, and budget exhaustion fail closed.

Required positive tests:

- An already-installed model completes a worker fixture while egress-control evidence stays clean.
- Broker/executor completes bounded RED → GREEN → REFACTOR without policy violation.
- Identical inputs reuse a Capsule; every invalidator regenerates it.
- `docker compose config` and inspection prove security configuration.
- Tier results reproduce; unqualified tiers remain unavailable.

[↑ Menú](#menú)

---

## Context Capsule Contract

Engram/shared memory is the semantic source for decisions, handoffs, completed work, and provenance. A Capsule is a disposable execution snapshot under an ignored local path such as `.atl/local-minions/capsules/<content-hash>.json`; it is not a transcript store or source of truth.

| Field group | Required content |
| --- | --- |
| Identity | Schema/policy version, task ID/class, repository revision, creation and expiry. |
| Inputs | Hashes of instructions, selected paths, cited Engram/handoff evidence, profile, and benchmark suite. |
| Evidence | Compact cited facts, allowed paths/tools, acceptance criteria, bounded prior receipts. |
| Budget | Tier/profile, turns, context/output/time/concurrency/resource limits, exception state. |
| Integrity | Content hash, validation result, producer/consumer versions. |

Regenerate when `HEAD`, policy/schema version, task input, selected-path hash, cited evidence version, local profile, or benchmark version changes. Never store credentials, access tokens, environment values, private absolute paths, full transcripts, source copies, or unbounded logs. A Capsule sufficient for the task means no source mount.

[↑ Menú](#menú)

---

## Capability Qualification

Capability is per machine and expires. Later clones rerun the same probe; no tier travels as a repository fact. The content-addressed profile includes timestamp, sanitized machine fingerprint, runtime versions, input/result hashes, benchmark version, expiry, and `unknown` for unavailable data.

| Signal | Required evidence |
| --- | --- |
| Runtime | Docker/Desktop/Compose/DMR versions, status, platform, Compose Models render result. |
| Hardware | CPU, usable RAM, disk, GPU/VRAM, driver and inference backend. |
| Local models | Immutable local references, context configuration, no-pull readiness proof. |
| Task quality | Fixture correctness, structured-output/tool compatibility, malformed-result rate. |
| Performance | p50/p95 latency, throughput when observable, peak resources, safe concurrency. |
| Isolation | All negative/positive outcomes, including host-runner egress denial. |
| Permissions | Task permissions stay inside the proven isolation boundary. |

The controller may qualify `worker`, narrow `reasoning`, or `unsupported` only for tested task classes. `pro` is unsupported by default and needs a dedicated benchmark plus existing owner-approved reasoning-to-pro escalation. Model name, vendor claim, parameter count, CPU count, or GPU label alone never qualifies a tier.

[↑ Menú](#menú)

---

## Hard Budget Contract

The controller, not prompt text, enforces fleet size, concurrency, turns, input context, output, wall time, tool calls, retries, CPU/RAM/VRAM/PIDs, scratch/output size, and total evidence bytes. It reserves capacity before launch, accounts after every action, and terminates on any excess.

Each attempt produces a compact, schema-validated receipt: task/Capsule/profile hashes; selected tier; model/image identifiers; declared/consumed limits; permissions; isolation checks; outcome (`completed`, `budget_exhausted`, `local_unavailable`, `policy_denied`, or `failed`); bounded diagnostics; evidence references; and a `cloud_exception_reason` when applicable.

No receipt may include raw logs, source contents, prompt transcripts, secrets, environment dumps, or credentials. Exhaustion cannot add agents, expand context, download a model, disable isolation, raise a tier, or choose cloud automatically.

[↑ Menú](#menú)

---

## Verification and Decision Gate

For accepted implementation/configuration changes, run applicable `pnpm build`, `pnpm test:static`, and `pnpm test:dynamic` gates and report truthfully if Docker/hardware prevents a gate. Apply receipt-driven review only if active for the clone.

The spike passes only if all are evidenced:

1. Phase-1 policy is reviewable and makes no unverified Docker claim.
2. A repeatable profile detects current availability and returns unsupported/unknown honestly elsewhere.
3. Provisioning and execution are separate; execution cannot pull, use external APIs, or make host-runner egress.
4. Compose Models/DMR does not expose the unauthenticated API to unapproved clients.
5. Executor is disconnected, credential-free, Docker-socket-free, and least-privilege filesystem restricted.
6. Cache, permissions, tier eligibility, and budgets fail closed.
7. At least one worker fixture passes reproducibly; reasoning/pro need independent thresholds.

Any unproven egress boundary, DMR exposure, automatic pull, external-provider route, unavailable control, failed negative test, or inconclusive benchmark blocks Phase 3. Record evidence, affected criterion, and next action; never bypass constraints for Docker convenience.

[↑ Menú](#menú)

---

## Phase 3: Conditional Local-First Capability Amendment

Modify `AGENTS.md` a second time **only after every Phase-2 pass condition succeeds**. The amendment adds local-minion governance that is inert without a qualified local runtime. On failure/defer, retain the capability-neutral cloud-only policy and write the limitation in the final report.

### Amendment Block A — Qualified Local Minions (under Orchestrator–Minion Model)

Add after the existing "Delegation Budget Declaration" subsection:

> ### Qualified Local Minions
>
> An eligible offline minion task MUST use a verified local runtime/profile first. Eligibility requires no internet, no credentials, a declared permission set, and a current profile that qualified the selected task class.
>
> Before delegated discovery, the orchestrator MUST query Engram/shared project memory, then issue a disposable, content-addressed Context Capsule containing only cited task evidence. Minions MUST consume the Capsule and MUST NOT receive raw transcript history or rediscover known facts without an invalidation reason.
>
> The Capsule is an execution snapshot, not project canon: it contains only the task's bounded evidence, declared permissions, acceptance criteria, and budget. It MUST NOT contain credentials, raw transcripts, unbounded logs, source copies, or environment dumps.
>
> Local runtime availability and tier qualification are machine-specific, task-class-specific, and expiring. They MUST be measured before use; no platform, command, model, or performance capability is assumed by this policy.

### Amendment Block B — Local Tier Qualification (under Model-Tier Routing)

Add after the existing "Tier Accountability" subsection:

> ### Local Tier Qualification
>
> The controller may qualify `worker`, narrow `reasoning`, or `unsupported` only for tested task classes and a current local profile. `pro` is unsupported by default and requires a dedicated benchmark plus the existing owner-approved reasoning-to-pro escalation.
>
> Model branding, vendor claims, parameter counts, CPU counts, and GPU labels are not tier evidence. Qualification requires reproducible task correctness, structured-output behavior, bounded resource and latency evidence, safe concurrency, and proven isolation for the declared permissions.

### Amendment Block C — Local Execution Budget (under Context Budget Governance)

Add before the existing "Fleet and Session Budget Governance" subsection. This block governs LOCAL dispatch only; the cloud-scoped budget rules are already in place.

> ### Local Execution Budget
>
> Local dispatch is denied unless it declares agent count, concurrency, turns, input-context, generated-output, wall-clock, tool-call/retry, resource, and evidence-output limits. The launcher/controller, not prompt prose, MUST enforce those limits.
>
> Each local minion MUST return a schema-validated, bounded evidence receipt: status, hashes, changed-path/evidence references, consumed budget, bounded diagnostics, and next action. Raw logs, secrets, transcripts, source trees, credentials, and unbounded diagnostics are prohibited.
>
> Internet access, credentials, absent local qualification, failed local execution, or insufficient local capability requires a typed `cloud_exception_reason` and fresh approval/budget. A local failure MUST NOT silently retry in cloud, raise a tier, expand a budget, or increase concurrency.

### Amendment Block D — Verified Capabilities (conditional on spike evidence)

The amendment may additionally add verified probe commands, supported platform/version bounds, profile location/expiry, allowed task classes, actually enforced hardening, and evidence/receipt paths — but ONLY those substantiated by Phase-2 evidence.

It MUST NOT label models as universal tiers, claim offline execution without host-runner egress evidence, or assume capabilities for future clones.

[↑ Menú](#menú)

---

## Phase 4: Hardware Fitness Probe and Ceiling Calculator

Phase 2 proved the Docker/DMR infrastructure works but executed recklessly — pulling models without checking disk, accepting incomplete deliverables, burning tokens. Phase 4 replaces ad-hoc model pulling with a systematic, Zod-validated probe that discovers what the machine CAN run and lets the owner declare what it SHOULD run.

### Hardware Intelligence Baseline

External research (Gemini, 2026-09-02) established tier equivalences and a hardware fitness formula.

**Tier Equivalence Mapping**

| Virgil Tier | Equivalent Cloud Class | Local Candidate Models |
| --- | --- | --- |
| worker | Haiku-class | Llama 3.1 (8B), Mistral (7B), Gemma 2 (9B) |
| reasoning | Sonnet/Fable-class | Qwen 3 (32B), Phi-4 (14B) |
| pro | Opus-class | Llama 3.3 (70B), Qwen 3 (72B), DeepSeek V3 |

**Hardware Requirements (Q4 quantization)**

Formula:

```text
Memory Required = (Billions of parameters × 0.55 GB) + 1.5 GB context overhead
```

| Model Size | RAM / VRAM (Q4) | Disk | Minimum Hardware |
| --- | --- | --- | --- |
| 7B–9B | ~6–7 GB | ~4.5–6 GB | GPU 8 GB+ or Mac with sufficient unified memory |
| 14B | ~10–11 GB | ~9–10 GB | GPU 12 GB+ or Mac 16 GB+ |
| 32B | ~22–24 GB | ~20–22 GB | RTX 4090/5090 (32 GB) or Mac 32 GB+ |
| 70B–72B | ~46–48 GB | ~40–45 GB | 2× GPUs (24 GB each) or Mac Studio 64 GB+ |

These are inputs to the probe script, not hardcoded pass/fail labels. The script applies the formula dynamically against detected hardware.

### Multi-OS Probe Script — `virgil-model-probe.ts`

Amend or replace the existing `scripts/virgil-model-probe.ts` to implement a Zod-validated, multi-OS hardware fitness probe.

The script MUST:

1. Be implemented in TypeScript, runnable via `npx tsx scripts/virgil-model-probe.ts`.
2. Use **Zod schemas** for ALL input validation and output normalization — hardware profile, model catalog, fitness scores, ceiling configuration, and persisted output. No unvalidated JSON.
3. Support **macOS** (Apple Silicon via Metal, Intel), **Linux** (NVIDIA CUDA, CPU-only), and **Windows** (NVIDIA CUDA, CPU-only) through OS-specific detection strategies with a unified output schema.
4. Detect hardware profile:
   - CPU: architecture, core count, model.
   - GPU: Metal cores (macOS), CUDA device/VRAM (Linux/Windows), or absent.
   - Memory: total system RAM, available RAM, unified memory (Apple Silicon).
   - Disk: available space on the Docker volume/partition.
   - Docker: Engine version, Compose version, DMR status, allocated resources.
5. Apply the fitness formula to each candidate model from the tier equivalence catalog.
6. Present results as **structured output** (JSON) and optionally as a **TUI** showing:
   - Which models FIT on this machine (**CAN** host) with fitness scores.
   - Which tier each model qualifies for based on the W5 benchmark thresholds.
   - Resource impact per model: RAM consumed, disk needed, estimated concurrent capacity.
   - Maximum concurrent local minions given remaining resources.
7. Accept the owner's **desired ceiling** (**WANT** to host):
   - Maximum number of concurrent minions.
   - Preferred tier ceiling (e.g., `["worker"]` or `["worker", "reasoning"]`).
   - RAM reservation for host OS and non-Docker processes (default: 4 GB).
   - Selected model per allowed tier (from qualified candidates only).
8. Persist the validated ceiling configuration to `virgil.json` under a `localMinions` key.
9. Validate persisted config against the Zod schema on every load — stale or invalid config is rejected, not silently accepted.

The script MUST NOT pull models, enable DMR, modify Docker settings, or make network requests. It reports available state and recommends; the owner decides.

### Ceiling Calculator Contract

The ceiling has two dimensions that the probe script computes and validates.

**CAN — hardware-determined maximum:**

- Total system RAM minus OS reservation (configurable, default 4 GB).
- Apply fitness formula per candidate model at Q4 quantization.
- Account for Docker daemon overhead (~500 MB baseline).
- Account for concurrent model memory — models on Apple Silicon Metal share unified memory but each instance reserves its allocation.
- Available disk for model storage.
- The CAN ceiling is a computed fact, not a preference.

**WANT — owner-declared policy ceiling:**

- Maximum concurrent local minions (persisted in `virgil.json`).
- Allowed tiers: subset of `["worker", "reasoning"]`. Pro is excluded by default per existing AGENTS.md escalation rules.
- Selected model per tier from qualified candidates only.
- Docker resource limits per container: CPU shares, memory limit, PIDs limit.
- The WANT ceiling MUST NOT exceed the CAN ceiling. The script validates this constraint and surfaces the effective ceiling.

**Effective ceiling** = `min(CAN, WANT)` per dimension. The probe reports both and the resolved effective value.

### Zod Schema Surface

The script defines and exports at minimum:

| Schema | Purpose |
| --- | --- |
| `HardwareProfileSchema` | Detected CPU, GPU, RAM, disk, Docker resources |
| `ModelCatalogEntrySchema` | Model reference, parameter count, quantization, tier, disk/RAM requirements |
| `FitnessResultSchema` | Per-model fitness score, fits (boolean), resource breakdown |
| `CeilingCanSchema` | Hardware-derived maximum: concurrent models, total RAM budget, disk budget |
| `CeilingWantSchema` | Owner-declared: max minions, allowed tiers, selected models, RAM reservation |
| `EffectiveCeilingSchema` | Resolved ceiling: min(CAN, WANT) with explanations |
| `VirgilLocalMinionsConfigSchema` | Persisted `virgil.json` shape for the `localMinions` key |

All schemas use Zod. The script validates inputs, intermediate results, and outputs. No `.parse()` call outside the script boundary — this is an app-level tool, not a library with isolated unit tests.

### Docker DMR Validation

Phase 4 validates the Docker DMR implementation against the probe output:

1. The `docker-compose.yml` template MUST consume the probe's effective ceiling — model reference, resource limits, context size, and concurrency are resolved from the probe, not hardcoded.
2. If no model qualifies for a tier, that tier's service is omitted from the rendered Compose config — no placeholder services.
3. The probe profile hash is recorded in the rendered Compose config as a label for staleness detection.
4. Existing Phase 2 security controls (network isolation, no credentials, no socket, least-privilege) remain mandatory and are validated by the probe before declaring a model fit.

[↑ Menú](#menú)

---

## Deliverables and Acceptance Criteria

| Deliverable | Acceptance evidence |
| --- | --- |
| Containment receipt | Owner stash reference/SHA, clean state, branch base, ignored-state exclusion. |
| Phase-1 baseline verification | Confirmed presence of cloud-scoped hard budget enforcement in AGENTS.md; no local-minion governance yet. |
| Capability probe/profile | Versioned, content-addressed, sanitized schema and repeatable per-machine result. |
| Compose prototype | Rendered config, version pin, DMR reachability/egress tests, broker/executor split result. |
| Controller | Permission manifest, Capsule/profile checks, tier qualification, budgets, receipts. |
| Benchmark report | Fixtures, thresholds, correctness/latency/resources/isolation, safe concurrency. |
| Decision report | Adopt/narrow/defer/reject; proven facts, limits, risks, Phase-3 eligibility. |
| Phase-3 local-first amendment | Full local-minion AGENTS.md diff (Blocks A–D) applied only after all Phase-2 pass conditions; otherwise explicit skip with blocker evidence and limitation report. |
| Multi-OS probe script | `scripts/virgil-model-probe.ts` with Zod schemas, hardware detection, fitness scoring, CAN/WANT ceiling calculator, and `virgil.json` persistence. |
| Ceiling configuration | Validated `localMinions` key in `virgil.json` with effective ceiling, selected models, and resource limits. |
| Docker DMR validation | Compose template consuming probe output; no hardcoded models; security controls validated by probe. |

The staged implementation/document diff must stay in spike-owned paths and never contain model data, credentials, local profiles, caches, transcripts, or Docker operational state.

[↑ Menú](#menú)

---

## Risks and Constraints

| Risk | Required response |
| --- | --- |
| Compose Models auto-provisions or cannot restrict broker egress | Reject/defer the route; never weaken offline execution. |
| DMR API is unauthenticated | Prove reachability restriction before task data is sent; otherwise fail closed. |
| Docker Engine makes model-name HEAD requests | Prove egress denial or do not call it offline. |
| Desktop and Linux Engine differ | State platform-specific evidence; no cross-platform claim without proof. |
| Local capacity is insufficient | Mark task/tier unsupported; require explicit cloud exception. |
| Capsule could leak context | Schema redaction, ignored storage, expiry, bounded size, deletion on invalidation. |
| Benchmark overfits | Versioned, diverse non-sensitive fixtures and explicit task-class limits. |

[↑ Menú](#menú)

---

## Official References

- [Docker Model Runner](https://docs.docker.com/ai/model-runner/) — local model lifecycle, isolation, unauthenticated API, and Docker Engine model-name HEAD requests.
- [Define AI Models in Docker Compose applications](https://docs.docker.com/ai/compose/models-and-compose/) — Compose `models`, v2.38+ prerequisite, references, context sizing, and runtime flags.
- [DMR REST API](https://docs.docker.com/ai/model-runner/api-reference/) — documented host/container endpoints and API surfaces.
- [`docker model start-runner`](https://docs.docker.com/reference/cli/docker/model/start-runner/) — local runner lifecycle, default loopback binding, backend/GPU/TLS options.
- [`docker model gateway`](https://docs.docker.com/reference/cli/docker/model/gateway/) — external-provider/fallback routing explicitly prohibited here.
- [Compose networking](https://docs.docker.com/compose/how-tos/networking/) — `network_mode: none` disables container networking.
- [Compose service reference](https://docs.docker.com/reference/compose-file/services/) — filesystem, restart, mounts, resource and security controls.
- [Docker Engine security](https://docs.docker.com/engine/security/) — daemon/socket risk and hardening context.
- [Docker Desktop container isolation FAQ](https://docs.docker.com/security/faqs/containers/) — platform-specific isolation boundaries.

[↑ Menú](#menú)
