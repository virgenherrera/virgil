import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { HandoffModule } from "../handoff/handoff.module.js";
import { HandoffService } from "../handoff/handoff.service.js";
import { HandoffStateMachine } from "../handoff/handoff-state-machine.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

describe("e2e: handoff lifecycle", () => {
  let module: TestingModule;
  let handoffService: HandoffService;
  let stateMachine: HandoffStateMachine;
  let auditService: AuditService;
  let ledger: LedgerService;
  let testDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = createTestDir();
    initGitRepo(testDir);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);

    module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        LedgerModule,
        HandoffModule,
        AuditModule,
      ],
    }).compile();

    handoffService = module.get(HandoffService);
    stateMachine = module.get(HandoffStateMachine);
    auditService = module.get(AuditService);
    ledger = module.get(LedgerService);
  });

  afterEach(async () => {
    await module.close();
    cwdSpy.mockRestore();
    cleanTestDir(testDir);
  });

  it("full lifecycle: create -> handoff -> execution -> verify -> delivered", async () => {
    // 1. Create handoff
    const meta = await handoffService.create("LIFE-1", {
      repoPath: testDir,
    });
    expect(meta.state).toBe("draft");

    const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
    expect(existsSync(resolve(handoffDir, "TASK.md"))).toBe(true);
    expect(existsSync(resolve(handoffDir, "CONTEXT.md"))).toBe(true);
    expect(existsSync(resolve(handoffDir, "ACCEPTANCE_CHECKLIST.md"))).toBe(
      true,
    );
    expect(existsSync(resolve(handoffDir, "META.json"))).toBe(true);

    // 2. Transition: draft -> handoff
    const handoffState = await stateMachine.transition(meta.id, "handoff");
    expect(handoffState.state).toBe("handoff");

    // 3. Transition: handoff -> execution
    const executionState = await stateMachine.transition(meta.id, "execution");
    expect(executionState.state).toBe("execution");

    // 4. Agent writes output
    writeFileSync(
      resolve(handoffDir, "AGENT_OUTPUT.md"),
      "# Agent Output\n\nAll tasks completed successfully.",
      "utf-8",
    );

    // 5. Transition: execution -> verify
    const verifyState = await stateMachine.transition(meta.id, "verify");
    expect(verifyState.state).toBe("verify");

    // 6. Audit (no changes since baseline = PASS)
    const auditResult = await auditService.audit(meta.id);
    expect(auditResult.verdict).toBe("PASS");
    expect(existsSync(resolve(handoffDir, "AUDIT_REPORT.json"))).toBe(true);

    // 7. Transition: verify -> delivered
    const deliveredState = await stateMachine.transition(meta.id, "delivered");
    expect(deliveredState.state).toBe("delivered");

    // 8. Verify ledger has full history
    const entries = await ledger.getEntries(meta.id);
    const events = entries.map((e) => e.event);
    expect(events).toContain("created");
    expect(events).toContain("transition");
    expect(events).toContain("audit");
  });

  it("re-delegation: verify -> execution on audit fail", async () => {
    const meta = await handoffService.create("REDEL-1", {
      repoPath: testDir,
      allowedPaths: ["src/**"],
    });

    await stateMachine.transition(meta.id, "handoff");
    await stateMachine.transition(meta.id, "execution");

    const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);

    // Agent writes output AND creates an out-of-scope file
    writeFileSync(
      resolve(handoffDir, "AGENT_OUTPUT.md"),
      "# Agent Output\n\nDone but touched some extra files.",
      "utf-8",
    );
    writeFileSync(resolve(testDir, "out-of-scope.txt"), "rogue change");
    execSync("git add .", { cwd: testDir, stdio: "pipe" });
    execSync('git commit -m "scope violation"', {
      cwd: testDir,
      stdio: "pipe",
    });

    // Transition to verify
    await stateMachine.transition(meta.id, "verify");

    // Audit should fail due to scope violation
    const auditResult = await auditService.audit(meta.id);
    expect(auditResult.verdict).toBe("FAIL");

    const scopeCheck = auditResult.checks.find((c) => c.name === "scope");
    expect(scopeCheck).toBeDefined();
    expect(scopeCheck!.passed).toBe(false);

    // Re-delegate: verify -> execution
    const reExecution = await stateMachine.transition(meta.id, "execution");
    expect(reExecution.state).toBe("execution");

    // Verify ledger records the loop
    const entries = await ledger.getEntries(meta.id);
    const transitions = entries.filter((e) => e.event === "transition");

    // draft->handoff, handoff->execution, execution->verify, verify->execution
    expect(transitions.length).toBe(4);
    const lastTransition = transitions[transitions.length - 1]!;
    expect(lastTransition.from).toBe("verify");
    expect(lastTransition.to).toBe("execution");
  });

  it("break-glass override bypasses preconditions", async () => {
    const meta = await handoffService.create("BG-E2E-1", {
      repoPath: testDir,
    });

    await stateMachine.transition(meta.id, "handoff");
    await stateMachine.transition(meta.id, "execution");

    // No AGENT_OUTPUT.md — should normally fail
    await expect(
      stateMachine.transition(meta.id, "verify"),
    ).rejects.toThrow(/AGENT_OUTPUT\.md/);

    // Break-glass bypasses the precondition
    const updated = await stateMachine.transition(meta.id, "verify", {
      breakGlass: true,
      reason: "Emergency production fix",
    });
    expect(updated.state).toBe("verify");

    // Verify break-glass recorded in META
    expect(updated.breakGlass).toBeDefined();
    expect(updated.breakGlass!.reason).toBe("Emergency production fix");

    // Verify 72h certification deadline
    const activatedAt = new Date(updated.breakGlass!.activatedAt);
    const deadline = new Date(updated.breakGlass!.certificationDeadline);
    const diffHours =
      (deadline.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(72);

    // Verify ledger records break-glass event
    const entries = await ledger.getEntries(meta.id);
    const breakGlassEntry = entries.find((e) => e.event === "break-glass");
    expect(breakGlassEntry).toBeDefined();
    expect(breakGlassEntry!.reason).toBe("Emergency production fix");
  });
});
