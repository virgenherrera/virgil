import { Test, type TestingModule } from "@nestjs/testing";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { HandoffModule } from "../handoff/handoff.module.js";
import { HandoffService } from "../handoff/handoff.service.js";
import { HandoffStateMachine } from "../handoff/handoff-state-machine.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

describe("handoff lifecycle", () => {
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

  describe("create", () => {
    it("creates handoff in draft state with all required files", async () => {
      const meta = await handoffService.create("TEST-1", {
        repoPath: testDir,
      });

      expect(meta.state).toBe("draft");
      expect(meta.ticketKey).toBe("TEST-1");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      expect(existsSync(resolve(handoffDir, "TASK.md"))).toBe(true);
      expect(existsSync(resolve(handoffDir, "CONTEXT.md"))).toBe(true);
      expect(existsSync(resolve(handoffDir, "ACCEPTANCE_CHECKLIST.md"))).toBe(
        true,
      );
      expect(existsSync(resolve(handoffDir, "META.json"))).toBe(true);
    });

    it("writes META.json with correct schema version and guardrails", async () => {
      const meta = await handoffService.create("TEST-2", {
        repoPath: testDir,
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      const raw = readFileSync(resolve(handoffDir, "META.json"), "utf-8");
      const stored = JSON.parse(raw);

      expect(stored.schemaVersion).toBe("1.0.0");
      expect(stored.guardrails).toBeDefined();
      expect(stored.guardrails.allowedPaths).toEqual(["src/**"]);
      expect(stored.guardrails.forbiddenPaths).toEqual([
        "*.env",
        "*.key",
        "*.secret",
      ]);
      expect(stored.guardrails.maxFilesChanged).toBe(8);
      expect(stored.guardrails.maxLinesChanged).toBe(400);
    });

    it("records created event in ledger", async () => {
      const meta = await handoffService.create("TEST-3", {
        repoPath: testDir,
      });

      const entries = await ledger.getEntries(meta.id);
      const createdEntry = entries.find((e) => e.event === "created");

      expect(createdEntry).toBeDefined();
      expect(createdEntry!.handoffId).toBe(meta.id);
      expect(createdEntry!.data).toEqual({
        ticketKey: "TEST-3",
        ffLevel: 1,
      });
    });

    it("CONTEXT.md shows brief fallback when no dogma provider configured", async () => {
      const meta = await handoffService.create("TEST-BRIEF-1", {
        repoPath: testDir,
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      const context = readFileSync(resolve(handoffDir, "CONTEXT.md"), "utf-8");

      expect(context).toContain("No dogma brief available.");
    });

    it("applies custom ff level and guardrails from options", async () => {
      const meta = await handoffService.create("TEST-4", {
        repoPath: testDir,
        ffLevel: 3,
        allowedPaths: ["lib/**"],
        forbiddenPaths: ["*.pem"],
        maxFilesChanged: 20,
        maxLinesChanged: 1000,
      });

      expect(meta.ffLevel).toBe(3);
      expect(meta.guardrails.allowedPaths).toEqual(["lib/**"]);
      expect(meta.guardrails.forbiddenPaths).toEqual(["*.pem"]);
      expect(meta.guardrails.maxFilesChanged).toBe(20);
      expect(meta.guardrails.maxLinesChanged).toBe(1000);
    });
  });

  describe("transition", () => {
    it("transitions draft -> handoff when all files present", async () => {
      const meta = await handoffService.create("TRANS-1", {
        repoPath: testDir,
      });

      const updated = await stateMachine.transition(meta.id, "handoff");

      expect(updated.state).toBe("handoff");
    });

    it("transitions handoff -> execution without preconditions", async () => {
      const meta = await handoffService.create("TRANS-2", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      const updated = await stateMachine.transition(meta.id, "execution");

      expect(updated.state).toBe("execution");
    });

    it("blocks execution -> verify without AGENT_OUTPUT.md", async () => {
      const meta = await handoffService.create("TRANS-3", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      await expect(
        stateMachine.transition(meta.id, "verify"),
      ).rejects.toThrow(/AGENT_OUTPUT\.md/);
    });

    it("allows execution -> verify when AGENT_OUTPUT.md exists", async () => {
      const meta = await handoffService.create("TRANS-4", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      const updated = await stateMachine.transition(meta.id, "verify");

      expect(updated.state).toBe("verify");
    });

    it("blocks verify -> delivered without audit PASS", async () => {
      const meta = await handoffService.create("TRANS-5", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");

      // No audit report exists yet
      await expect(
        stateMachine.transition(meta.id, "delivered"),
      ).rejects.toThrow(/AUDIT_REPORT\.json/);
    });

    it("allows verify -> delivered with audit PASS", async () => {
      const meta = await handoffService.create("TRANS-6", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");

      // Run the real audit -- no git changes since baseline = PASS
      await auditService.audit(meta.id);

      const updated = await stateMachine.transition(meta.id, "delivered");

      expect(updated.state).toBe("delivered");
    });

    it("allows verify -> execution for re-delegation on FAIL", async () => {
      const meta = await handoffService.create("TRANS-7", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");

      // Write a FAIL audit report manually
      const failReport = {
        handoffId: meta.id,
        verdict: "FAIL",
        checks: [{ name: "scope", passed: false, message: "Out of scope" }],
        auditedAt: new Date().toISOString(),
      };
      writeFileSync(
        resolve(handoffDir, "AUDIT_REPORT.json"),
        JSON.stringify(failReport, null, 2),
        "utf-8",
      );

      const updated = await stateMachine.transition(meta.id, "execution");

      expect(updated.state).toBe("execution");
    });

    it("rejects invalid transitions (draft -> verify)", async () => {
      const meta = await handoffService.create("TRANS-8", {
        repoPath: testDir,
      });

      await expect(
        stateMachine.transition(meta.id, "verify"),
      ).rejects.toThrow(/Invalid transition/);
    });

    it("records each transition in ledger", async () => {
      const meta = await handoffService.create("TRANS-9", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const entries = await ledger.getEntries(meta.id);
      const transitions = entries.filter((e) => e.event === "transition");

      expect(transitions.length).toBe(2);
      expect(transitions[0]!.from).toBe("draft");
      expect(transitions[0]!.to).toBe("handoff");
      expect(transitions[1]!.from).toBe("handoff");
      expect(transitions[1]!.to).toBe("execution");
    });
  });

  describe("break-glass", () => {
    it("bypasses preconditions when break-glass is active", async () => {
      const meta = await handoffService.create("BG-1", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      // Should fail without break-glass (no AGENT_OUTPUT.md)
      await expect(
        stateMachine.transition(meta.id, "verify"),
      ).rejects.toThrow();

      // Should succeed with break-glass
      const updated = await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Emergency production fix",
      });

      expect(updated.state).toBe("verify");
    });

    it("records break-glass event in ledger with reason", async () => {
      const meta = await handoffService.create("BG-2", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Critical outage",
      });

      const entries = await ledger.getEntries(meta.id);
      const breakGlassEntry = entries.find((e) => e.event === "break-glass");

      expect(breakGlassEntry).toBeDefined();
      expect(breakGlassEntry!.reason).toBe("Critical outage");
    });

    it("sets 72h certification deadline in META.json", async () => {
      const meta = await handoffService.create("BG-3", {
        repoPath: testDir,
      });

      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const updated = await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Emergency",
      });

      expect(updated.breakGlass).toBeDefined();
      expect(updated.breakGlass!.reason).toBe("Emergency");

      const activatedAt = new Date(updated.breakGlass!.activatedAt);
      const deadline = new Date(updated.breakGlass!.certificationDeadline);
      const diffHours =
        (deadline.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);

      expect(diffHours).toBe(72);
    });
  });

  describe("create with dogma brief", () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(async () => {
      savedEnv = { ...process.env };

      // Close the default module to reconfigure with dogma
      await module.close();

      const docsDir = resolve(testDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        resolve(docsDir, "security.md"),
        [
          "# Security Policy",
          "",
          "There is a significant risk of data breaches if credentials are exposed.",
          "",
          "# Deployment Constraints",
          "",
          "All services must use TLS. This is a mandatory requirement.",
        ].join("\n"),
      );
      writeFileSync(
        resolve(docsDir, "architecture.md"),
        [
          "# System Architecture",
          "",
          "The system follows a hexagonal architecture pattern with ports and adapters.",
        ].join("\n"),
      );

      process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

      module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([DogmaLocalConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          LedgerModule,
          HandoffModule,
          AuditModule,
          DogmaLocalModule.registerIfConfigured(),
          BriefModule,
        ],
      }).compile();

      await module.init();
      handoffService = module.get(HandoffService);
    });

    afterEach(() => {
      process.env = savedEnv;
    });

    it("CONTEXT.md groups brief items by kind", async () => {
      const meta = await handoffService.create("DOGMA-1", {
        repoPath: testDir,
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      const context = readFileSync(resolve(handoffDir, "CONTEXT.md"), "utf-8");

      expect(context).toContain("### Risk");
      expect(context).toContain("### Constraint");
      expect(context).toContain("### Principle");
      expect(context).toContain("**Security Policy**:");
      expect(context).toContain("**Deployment Constraints**:");
      expect(context).toContain("**System Architecture**:");
      expect(context).toContain("Source:");
    });

    it("CONTEXT.md shows drift warning when brief is stale", async () => {
      const generator = module.get(BriefGeneratorService);
      await generator.generate(testDir);

      // Make a new commit to create drift
      writeFileSync(resolve(testDir, "newfile.txt"), "new content");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "second commit"', {
        cwd: testDir,
        stdio: "pipe",
      });

      const meta = await handoffService.create("DOGMA-2", {
        repoPath: testDir,
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      const context = readFileSync(resolve(handoffDir, "CONTEXT.md"), "utf-8");

      expect(context).toContain("Warning:");
      expect(context).toContain("commit(s) behind HEAD");
    });
  });
});
