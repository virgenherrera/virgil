---
id: execution/git-strategy
title: "Git Strategy"
mode: execution
type: process
tags: [git, worktrees, branches, commits, merge, parallelism, composite-agent, gitflow]
---

# Git Strategy and Parallelism

← [Main Index](../README.md) | [Execution](README.md)

> Defines how the executionOrchestrator uses branches, worktrees, and
> commits to run the Red-Green-Refactor cycle with real parallelism.
> Resolves the TBDs for "Execution parallelism" and "Commit strategy".

> **Note on WHAT vs HOW.** This document defines the REQUIREMENTS that
> any branching strategy must meet for execution (isolation between
> lanes, traceability to iterations, non-destructive merge, support for
> parallel execution). The reference implementation uses Gitflow
> adapted with worktrees, but any strategy that satisfies these
> requirements is acceptable (trunk-based with feature flags, stacked
> PRs, etc.).

---

## Contents

- [Branch Model](#branch-model)
- [Worktrees for Parallelism](#worktrees-for-parallelism)
- [Commit Strategy](#commit-strategy)
- [Complete Flow of an Iteration](#complete-flow-of-an-iteration)
- [Handling Post-Merge Conflicts](#handling-post-merge-conflicts)
- [Handling Mid-Lane Failures](#handling-mid-lane-failures)
- [Orchestrator Decision Diagram](#orchestrator-decision-diagram)

---

## Branch Model

execution adapts Gitflow to the phased execution context. Each
iteration of the cycle (a batch of tasks from the DAG) operates on a
dedicated branch. Parallel lanes run in isolated worktrees.

```mermaid
gitGraph
    commit id: "main (stable)"
    branch develop
    commit id: "develop (integration)"
    branch exec/iter-1
    commit id: "contracts: API + DB schema"
    branch exec/iter-1/lane-a
    commit id: "red: auth tests"
    commit id: "green: login endpoint"
    commit id: "green: token refresh"
    commit id: "refactor: SOLID + DI"
    checkout exec/iter-1
    branch exec/iter-1/lane-b
    commit id: "red: UI tests"
    commit id: "green: login component"
    commit id: "refactor: a11y"
    checkout exec/iter-1
    merge exec/iter-1/lane-a id: "merge lane-a"
    merge exec/iter-1/lane-b id: "merge lane-b"
    commit id: "integration tests pass"
    checkout develop
    merge exec/iter-1 id: "iter-1 done"
    branch exec/iter-2
    commit id: "contracts: events + cache"
    commit id: "..."
    checkout develop
    merge exec/iter-2 id: "iter-2 done"
    checkout main
    merge develop id: "release"
```

### Branch Anatomy

| Branch | Purpose | Who Creates It | When It's Merged |
|------|-----------|---------------|------------------|
| `main` | Stable code, ready for operation | — | When develop passes acceptance |
| `develop` | Continuous integration between iterations | Orchestrator (once) | Into main at release |
| `exec/iter-N` | One iteration of the Red-Green-Refactor cycle | Orchestrator (per iteration) | Into develop when all lanes converge |
| `exec/iter-N/lane-X` | One parallel lane of the DAG | Orchestrator (per lane) | Into exec/iter-N when Refactor completes |

### Naming Rule

```text
exec/iter-{N}/lane-{descriptive-name}

Examples:
  exec/iter-1/lane-auth
  exec/iter-1/lane-ui-login
  exec/iter-1/lane-infra-redis
  exec/iter-2/lane-payments
```

[↑ Contents](#contents)

---

## Worktrees for Parallelism

When the DAG in `tasks.md` has independent lanes (no FS dependencies
between them), the Orchestrator launches subAgents in **isolated
worktrees**. Each agent operates its own working directory without
file conflicts.

```mermaid
flowchart TD
    subgraph OE["executionOrchestrator"]
        DAG["Reads DAG from tasks.md"]
        DETECT["Detects 3\nindependent lanes"]
    end

    DAG --> DETECT

    subgraph WT["Worktrees (isolated filesystem)"]
        direction LR
        WT_A["worktree A\nexec/iter-1/lane-auth\n📁 /tmp/wt-lane-auth"]
        WT_B["worktree B\nexec/iter-1/lane-ui\n📁 /tmp/wt-lane-ui"]
        WT_C["worktree C\nexec/iter-1/lane-infra\n📁 /tmp/wt-lane-infra"]
    end

    DETECT -->|"git worktree add"| WT_A
    DETECT -->|"git worktree add"| WT_B
    DETECT -->|"git worktree add"| WT_C

    subgraph AGENTS["subAgents (parallel)"]
        direction LR
        AG_A["Agent A\nRed → Green → Refactor\n(auth)"]
        AG_B["Agent B\nRed → Green → Refactor\n(UI)"]
        AG_C["Agent C\nRed → Green → Refactor\n(infra)"]
    end

    WT_A --> AG_A
    WT_B --> AG_B
    WT_C --> AG_C

    AG_A -->|"push lane-auth"| MERGE["Orchestrator merges\ninto the iteration branch"]
    AG_B -->|"push lane-ui"| MERGE
    AG_C -->|"push lane-infra"| MERGE

    MERGE --> INTEGRATION["Integration tests\n(full iter-1 branch)"]
```

### Role Model Within a Worktree

> **Roles ↔ worktrees reconciliation**: In sequential execution (1
> lane), the Orchestrator launches separate roles per phase —
> testEngineer (Red), Implementor (Green), fitness functions + residual
> review (Refactor) — as distinct subAgents with different
> personalities.
>
> In parallel execution with worktrees, each lane is assigned to a
> **compositeAgent** that takes on the personalities sequentially
> within the same worktree. The reason: launching multiple subAgents
> per lane within the same worktree would create filesystem access
> conflicts. The compositeAgent switches personality between phases:
>
> 1. **testEngineer personality** → writes the test suite (Red)
> 2. **Implementor personality** → writes code that passes the tests (Green)
> 3. **Mechanical verification** → runs fitness functions (mutation,
>    CRAP, complexity, dependencies, module size, security scanners).
>    Residual review (authorization, DDD) is documented and escalated
>    without blocking the gate.
>
> The Orchestrator validates each personality transition with a
> miniPDC between phases.

### Lifecycle of a Worktree

```mermaid
sequenceDiagram
    participant OE as Orchestrator
    participant GIT as Git
    participant AG as compositeAgent
    participant CI as Tests

    OE->>GIT: git worktree add /tmp/wt-lane-auth exec/iter-1/lane-auth
    OE->>AG: Contract: run Red-Green-Refactor for lane auth
    activate AG

    AG->>AG: testEngineer personality<br/>Red: writes tests (commits)
    Note over AG: miniPDC: Red → Green transition
    AG->>AG: Implementor personality<br/>Green: implements (commits)
    Note over AG: miniPDC: Green → Refactor transition
    AG->>AG: Mechanical verification<br/>Refactor: fitness functions (commits)
    AG->>CI: Runs the lane's tests
    CI-->>AG: ✅ PASS

    AG-->>OE: Status Report + push to remote
    deactivate AG

    OE->>GIT: git worktree remove /tmp/wt-lane-auth
    OE->>GIT: git merge exec/iter-1/lane-auth --no-ff
    OE->>CI: Runs integration tests (iter-1 branch)
    CI-->>OE: ✅ PASS → lane merged
```

> **Note**: This diagram covers the lifecycle of an individual worktree
> (Red-Green-Refactor). The Accept phase (QA Certification) does NOT
> happen per worktree — it runs once per iteration, after ALL lanes
> converge on `exec/iter-N` and integration tests pass, and BEFORE the
> merge of `exec/iter-N` into `develop`. See the "Complete Flow of an
> Iteration" diagram below.

### When to Use Worktrees vs Sequential

| Condition | Strategy | Reason |
|-----------|-----------|-------|
| 2+ lanes with no FS dependencies between them | Parallel worktrees | No file conflicts — maximum throughput |
| Lanes with an SS (start-start) dependency | Worktrees with partial merge | Lane B starts when A starts, but needs A's setup |
| Lanes with an FS (finish-start) dependency | Sequential | B needs A's complete output |
| Single lane or fewer than 5 tasks | Sequential in branch | Worktree overhead is not justified |
| File conflict detected between lanes | Forced sequential | Parallel worktrees would produce merge conflicts |

### Pre-Worktree Conflict Detection

Before launching parallel worktrees, the Orchestrator verifies that
the lanes do not touch the same files:

```mermaid
flowchart TD
    LANES["Independent lanes\n(no FS deps)"]
    ANALYZE{{"Do the files\neach lane will touch\noverlap?"}}

    LANES --> ANALYZE
    ANALYZE -->|"No"| PARALLEL["Parallel worktrees\n(maximum throughput)"]
    ANALYZE -->|"Yes, partial"| ORDERED["Order lanes\nby shared file\n(serialize colliding ones)"]
    ANALYZE -->|"Yes, total"| SEQUENTIAL["Sequential\n(one lane at a time)"]
```

The analysis is based on the files listed in each workItem in
`tasks.md` (the `files` field of the workItem schema). If the field
does not exist, the Orchestrator assumes overlap and serializes.

[↑ Contents](#contents)

---

## Commit Strategy

### Convention Per Phase

| Phase | Prefix | Example | Frequency |
|------|---------|---------|------------|
| Contracts | `contract:` | `contract: define auth API (OpenAPI 3.1)` | 1 per contract type |
| Red | `test:` | `test: auth-login-success (AC-01)` | 1 per test or small group |
| Green | `feat:` | `feat: implement login endpoint (passes auth-login-success)` | 1 per passing test |
| Refactor | `refactor:` | `refactor: extract AuthService (SOLID-SRP)` | 1 per atomic refactor |

### AC → test → commit Traceability

Every commit in Green references which test(s) it passes. Every commit
in Red references which AC it covers. The complete chain is:

```text
AC-01 (spec.md)
  → test: auth-login-success (AC-01)        [Red]
    → feat: implement login (passes auth-login-success)  [Green]
      → refactor: extract AuthService (SOLID-SRP)        [Refactor]
```

### Squash Policy

| Moment | Strategy | Reason |
|---------|-----------|-------|
| Within a lane | Granular commits | Red→Green→Refactor traceability |
| Merge lane → iter-N | `--no-ff` (merge commit) | Preserves lane history |
| Merge iter-N → develop | `--no-ff` (merge commit) | Preserves iteration history |
| Merge develop → main | Optional squash | The MIM decides: clean history vs complete history |

[↑ Contents](#contents)

---

## Complete Flow of an Iteration

```mermaid
flowchart TD
    START["Orchestrator reads handoff.md\n+ DAG from tasks.md"]

    subgraph PREFASE["prePhase: Contracts (branch exec/iter-N)"]
        C1["Contract Architect defines\ncontracts on branch iter-N"]
        C2["MIM approves contracts\n(if business decision)"]
    end

    subgraph PARALLEL["Parallel execution (worktrees)"]
        direction TB

        subgraph LA["Worktree: lane-auth"]
            LA_R["Red: auth tests"]
            LA_G["Green: auth impl"]
            LA_RF["Refactor: auth review"]
            LA_R --> LA_G --> LA_RF
        end

        subgraph LB["Worktree: lane-ui"]
            LB_R["Red: UI tests"]
            LB_G["Green: UI impl"]
            LB_RF["Refactor: UI review"]
            LB_R --> LB_G --> LB_RF
        end

        subgraph LC["Worktree: lane-infra"]
            LC_R["Red: infra tests"]
            LC_G["Green: infra impl"]
            LC_RF["Refactor: infra review"]
            LC_R --> LC_G --> LC_RF
        end
    end

    subgraph CONVERGE["Convergence (branch exec/iter-N)"]
        MERGE_A["Merge lane-auth"]
        MERGE_B["Merge lane-ui"]
        MERGE_C["Merge lane-infra"]
        INT_TEST["Integration tests\n(full suite)"]
        RESOLVE{{"Conflicts?"}}
    end

    subgraph ACCEPT["QA Certification"]
        QA_CHECK["QA verifies\nproduct vs handoff"]
    end

    subgraph CLOSE["Iteration closure"]
        MERGE_DEV["Merge iter-N → develop"]
        NEXT{{"More iterations?"}}
    end

    START --> C1
    C1 --> C2
    C2 --> PARALLEL

    LA_RF --> MERGE_A
    LB_RF --> MERGE_B
    LC_RF --> MERGE_C

    MERGE_A --> INT_TEST
    MERGE_B --> INT_TEST
    MERGE_C --> INT_TEST

    INT_TEST --> RESOLVE
    RESOLVE -->|"No"| QA_CHECK
    RESOLVE -->|"Yes"| FIX["Resolve conflicts\n+ re-run tests"]
    FIX --> INT_TEST

    QA_CHECK --> MERGE_DEV
    MERGE_DEV --> NEXT
    NEXT -->|"Yes"| START
    NEXT -->|"No"| RELEASE["Merge develop → main"]
```

[↑ Contents](#contents)

---

## Handling Post-Merge Conflicts

When two lanes modified related files (not the same file, but with
logical dependencies), integration tests detect them:

| Scenario | Symptom | Resolution |
|-----------|---------|------------|
| Two lanes defined the same endpoint | Integration test fails (duplicate route) | Orchestrator merges manually, removes the duplicate |
| Lane A changed an interface that lane B consumes | B's test fails post-merge | Orchestrator adjusts B for A's updated interface |
| Lane A and B modified the same file | Git merge conflict | Orchestrator resolves it, re-runs tests |
| Tests pass in isolation but fail integrated | State interference (DB, cache) | Orchestrator isolates the problem, creates a fix on the iter-N branch |

[↑ Contents](#contents)

---

## Handling Mid-Lane Failures

When a subAgent fails during execution within a worktree:

```mermaid
flowchart TD
    FAIL["subAgent reports\nFAILED or BLOCKED"]
    ASSESS{{"Type of failure?"}}

    FAIL --> ASSESS

    ASSESS -->|"Tests don't pass\n(Green blocked)"| REDELEGATE["Re-delegate in\nthe same worktree\n(new Implementor)"]
    ASSESS -->|"Refactor breaks tests\n(regression)"| REVERT["Revert the last refactor\n(git revert in the worktree)"]
    ASSESS -->|"External block\n(third-party API, MIM decision)"| PARK["Park the lane\n(worktree remains,\nlane goes to blocked)"]
    ASSESS -->|"Unrecoverable error\n(corrupted worktree)"| ABANDON["Abandon the worktree\n(git worktree remove --force)"]

    REDELEGATE --> CONTINUE["Continue execution\nin the worktree"]
    REVERT --> CONTINUE
    PARK --> NOTIFY["Notify the MIM\n+ continue other lanes"]
    ABANDON --> RECREATE["Recreate the worktree\nfrom the lane's last\nvalid commit"]
    RECREATE --> CONTINUE
```

### Impact on Other Lanes

| Scenario | Impact | Action |
|-----------|---------|--------|
| Failed lane has no dependents | None | Other lanes continue normally |
| Failed lane is a partial prerequisite (SS) | Dependent lane can continue with what it already has | Orchestrator evaluates whether the partial result is sufficient |
| Failed lane is a full prerequisite (FS) | Dependent lane is blocked | Orchestrator marks the dependent lane as `blocked`, parks its worktree |
| Multiple lanes fail | Possible systemic problem | Orchestrator escalates to the MIM before re-delegating |

### Worktree Cleanup

The Orchestrator is responsible for cleaning up worktrees at iteration
close:

1. Successfully completed lanes → `git worktree remove` after the merge
2. Parked lanes → worktree remains until the block is resolved
3. Abandoned lanes → `git worktree remove --force` + branch deleted

[↑ Contents](#contents)

---

## Orchestrator Decision Diagram

```mermaid
flowchart TD
    READ["Reads DAG from tasks.md"]
    LANES{{"How many\nindependent lanes?"}}

    READ --> LANES

    LANES -->|"1"| SEQ["Sequential execution\n(no worktrees)"]
    LANES -->|"2+"| CHECK{{"Do files\noverlap?"}}

    CHECK -->|"No"| WT["Parallel worktrees\n(1 agent per lane)"]
    CHECK -->|"Partial"| HYBRID["Hybrid:\ncolliding lanes → sequential\nnon-colliding lanes → parallel"]
    CHECK -->|"Total"| SEQ

    WT --> MERGE["Merge + integration tests"]
    HYBRID --> MERGE
    SEQ --> MERGE

    MERGE --> PASS{{"Tests pass?"}}
    PASS -->|"Yes"| CLOSE["Close the iteration\nmerge → develop"]
    PASS -->|"No"| FIX["Resolve conflicts\nre-run"]
    FIX --> PASS
```

[↑ Contents](#contents)
