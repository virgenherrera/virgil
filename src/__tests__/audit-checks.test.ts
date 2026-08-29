import { Test, type TestingModule } from "@nestjs/testing";
import { writeFileSync } from "node:fs";
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
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

describe("audit", () => {
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

  async function createHandoffInExecution(
    ticketKey: string,
    options?: {
      allowedPaths?: string[];
      forbiddenPaths?: string[];
      maxFilesChanged?: number;
      maxLinesChanged?: number;
    },
  ) {
    const meta = await handoffService.create(ticketKey, {
      repoPath: testDir,
      ...options,
    });
    await stateMachine.transition(meta.id, "handoff");
    await stateMachine.transition(meta.id, "execution");
    return meta;
  }

  describe("checks", () => {
    it("passes all checks when no files changed since baseline", async () => {
      const meta = await createHandoffInExecution("AUDIT-1");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nNo changes.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      expect(result.verdict).toBe("PASS");
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it("detects out-of-scope file changes", async () => {
      const meta = await createHandoffInExecution("AUDIT-2", {
        allowedPaths: ["src/**"],
      });

      // Create a file outside the allowed paths and commit
      writeFileSync(resolve(testDir, "outside.txt"), "out of scope");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "out of scope change"', {
        cwd: testDir,
        stdio: "pipe",
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const scopeCheck = result.checks.find((c) => c.name === "scope");
      expect(scopeCheck).toBeDefined();
      expect(scopeCheck!.passed).toBe(false);
      expect(scopeCheck!.message).toContain("outside.txt");
    });

    it("detects forbidden file changes", async () => {
      const meta = await createHandoffInExecution("AUDIT-3", {
        forbiddenPaths: ["*.env"],
      });

      writeFileSync(resolve(testDir, "secrets.env"), "SECRET=value");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "add secrets"', {
        cwd: testDir,
        stdio: "pipe",
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const forbiddenCheck = result.checks.find((c) => c.name === "forbidden");
      expect(forbiddenCheck).toBeDefined();
      expect(forbiddenCheck!.passed).toBe(false);
      expect(forbiddenCheck!.message).toContain("secrets.env");
    });

    it("detects file count exceeded", async () => {
      const meta = await createHandoffInExecution("AUDIT-4", {
        maxFilesChanged: 1,
        allowedPaths: ["**"],
      });

      writeFileSync(resolve(testDir, "file1.txt"), "content1");
      writeFileSync(resolve(testDir, "file2.txt"), "content2");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "add files"', { cwd: testDir, stdio: "pipe" });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const fileCountCheck = result.checks.find(
        (c) => c.name === "file-count",
      );
      expect(fileCountCheck).toBeDefined();
      expect(fileCountCheck!.passed).toBe(false);
    });

    it("detects line count exceeded", async () => {
      const meta = await createHandoffInExecution("AUDIT-5", {
        maxLinesChanged: 1,
        allowedPaths: ["**"],
      });

      const manyLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join(
        "\n",
      );
      writeFileSync(resolve(testDir, "big.txt"), manyLines);
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "add big file"', {
        cwd: testDir,
        stdio: "pipe",
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const lineCountCheck = result.checks.find(
        (c) => c.name === "line-count",
      );
      expect(lineCountCheck).toBeDefined();
      expect(lineCountCheck!.passed).toBe(false);
    });

    it("detects missing AGENT_OUTPUT.md and returns WARN", async () => {
      const meta = await createHandoffInExecution("AUDIT-6");

      // Use break-glass to skip AGENT_OUTPUT.md precondition for transition
      await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Test without agent output",
      });
      const result = await auditService.audit(meta.id);

      expect(result.verdict).toBe("WARN");

      const agentOutputCheck = result.checks.find(
        (c) => c.name === "agent-output",
      );
      expect(agentOutputCheck).toBeDefined();
      expect(agentOutputCheck!.passed).toBe(false);
    });

    it("returns PASS when AGENT_OUTPUT.md exists and all checks pass", async () => {
      const meta = await createHandoffInExecution("AUDIT-7");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nAll good.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      expect(result.verdict).toBe("PASS");

      const agentOutputCheck = result.checks.find(
        (c) => c.name === "agent-output",
      );
      expect(agentOutputCheck).toBeDefined();
      expect(agentOutputCheck!.passed).toBe(true);
    });
  });

  describe("gap classification", () => {
    it("classifies scope violation as IMPLEMENTATION gap", async () => {
      const meta = await createHandoffInExecution("GAP-1", {
        allowedPaths: ["src/**"],
      });

      writeFileSync(resolve(testDir, "rogue.txt"), "outside");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "rogue"', { cwd: testDir, stdio: "pipe" });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const scopeCheck = result.checks.find((c) => c.name === "scope");
      expect(scopeCheck!.gapType).toBe("implementation");
    });

    it("classifies forbidden violation as IMPLEMENTATION gap", async () => {
      const meta = await createHandoffInExecution("GAP-2", {
        forbiddenPaths: ["*.env"],
      });

      writeFileSync(resolve(testDir, "app.env"), "BAD=value");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "bad"', { cwd: testDir, stdio: "pipe" });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const forbiddenCheck = result.checks.find(
        (c) => c.name === "forbidden",
      );
      expect(forbiddenCheck!.gapType).toBe("implementation");
    });

    it("classifies missing agent output as COMPLIANCE gap", async () => {
      const meta = await createHandoffInExecution("GAP-3");

      await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Test gap classification",
      });

      const result = await auditService.audit(meta.id);

      const agentOutputCheck = result.checks.find(
        (c) => c.name === "agent-output",
      );
      expect(agentOutputCheck!.gapType).toBe("compliance");
    });

    it("generates recommendation for IMPLEMENTATION gaps", async () => {
      const meta = await createHandoffInExecution("GAP-4", {
        allowedPaths: ["src/**"],
      });

      writeFileSync(resolve(testDir, "out.txt"), "outside");
      execSync("git add .", { cwd: testDir, stdio: "pipe" });
      execSync('git commit -m "out of scope"', {
        cwd: testDir,
        stdio: "pipe",
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      expect(result.recommendation).toContain("Re-delegate");
    });

    it("generates recommendation for COMPLIANCE gaps", async () => {
      const meta = await createHandoffInExecution("GAP-5");

      await stateMachine.transition(meta.id, "verify", {
        breakGlass: true,
        reason: "Test compliance gap",
      });

      const result = await auditService.audit(meta.id);

      expect(result.recommendation).toContain("AGENT_OUTPUT.md");
    });
  });

  describe("ledger integration", () => {
    it("records audit event in ledger with verdict", async () => {
      const meta = await createHandoffInExecution("LEDGER-1");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nDone.",
        "utf-8",
      );

      await stateMachine.transition(meta.id, "verify");
      await auditService.audit(meta.id);

      const entries = await ledger.getEntries(meta.id);
      const auditEntry = entries.find((e) => e.event === "audit");

      expect(auditEntry).toBeDefined();
      expect(auditEntry!.data).toBeDefined();
      expect(auditEntry!.data!.verdict).toBe("PASS");
    });
  });
});
