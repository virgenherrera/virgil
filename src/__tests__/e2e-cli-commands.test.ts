import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { HandoffModule } from "../handoff/handoff.module.js";
import { HandoffService } from "../handoff/handoff.service.js";
import { HandoffStateMachine } from "../handoff/handoff-state-machine.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

describe("e2e: CLI commands", () => {
  describe("status command", () => {
    let savedEnv: NodeJS.ProcessEnv;
    let module: TestingModule;
    let logOutput: string[];

    beforeEach(() => {
      savedEnv = { ...process.env };
      logOutput = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });
    });

    afterEach(async () => {
      process.env = savedEnv;
      vi.restoreAllMocks();
      if (module) await module.close();
    });

    it("virgil status outputs provider list when providers are configured", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "virgil-e2e-cmd-"));
      const docsDir = join(tempDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, "policy.md"),
        "# Security\n\nThere is a significant risk if credentials leak.",
      );

      process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

      const { StatusCommand } = await import("../commands/status.command.js");

      module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([DogmaLocalConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          DogmaLocalModule.registerIfConfigured(),
        ],
        providers: [StatusCommand],
      }).compile();

      await module.init();

      const statusCommand = module.get(StatusCommand);
      await statusCommand.run([], {});

      const output = logOutput.join("\n");

      expect(output).toContain("dogma-local");
      expect(output).toContain("dogma");
      expect(output).toContain("[OK]");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("virgil status --json outputs structured data", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "virgil-e2e-cmd-"));
      const docsDir = join(tempDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, "guide.md"), "# Guide\n\nA principle.");

      process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

      const { StatusCommand } = await import("../commands/status.command.js");

      module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([DogmaLocalConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          DogmaLocalModule.registerIfConfigured(),
        ],
        providers: [StatusCommand],
      }).compile();

      await module.init();

      const statusCommand = module.get(StatusCommand);
      await statusCommand.run([], { json: true });

      const output = logOutput.join("\n");
      const parsed = JSON.parse(output);

      expect(parsed.version).toBe("0.1.0");
      expect(parsed.providers).toHaveLength(1);
      expect(parsed.providers[0].capabilityId).toBe("dogma-local");
      expect(parsed.providers[0].kind).toBe("dogma");
      expect(parsed.providers[0].status).toBe("available");

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("handoff create command", () => {
    let module: TestingModule;
    let testDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;
    let logOutput: string[];

    beforeEach(async () => {
      testDir = createTestDir();
      initGitRepo(testDir);
      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
      logOutput = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });

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
    });

    afterEach(async () => {
      await module.close();
      cwdSpy.mockRestore();
      vi.restoreAllMocks();
      cleanTestDir(testDir);
    });

    it("virgil handoff create generates all 4 files", async () => {
      const handoffService = module.get(HandoffService);
      const meta = await handoffService.create("CLI-1", {
        repoPath: testDir,
      });

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      expect(existsSync(resolve(handoffDir, "TASK.md"))).toBe(true);
      expect(existsSync(resolve(handoffDir, "CONTEXT.md"))).toBe(true);
      expect(existsSync(resolve(handoffDir, "ACCEPTANCE_CHECKLIST.md"))).toBe(
        true,
      );
      expect(existsSync(resolve(handoffDir, "META.json"))).toBe(true);
    });
  });

  describe("audit command", () => {
    let module: TestingModule;
    let testDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;
    let logOutput: string[];

    beforeEach(async () => {
      testDir = createTestDir();
      initGitRepo(testDir);
      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
      logOutput = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });

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
    });

    afterEach(async () => {
      await module.close();
      cwdSpy.mockRestore();
      vi.restoreAllMocks();
      cleanTestDir(testDir);
    });

    it("virgil audit produces AUDIT_REPORT.json", async () => {
      const handoffService = module.get(HandoffService);
      const stateMachine = module.get(HandoffStateMachine);
      const auditService = module.get(AuditService);

      const meta = await handoffService.create("AUDIT-CMD-1", {
        repoPath: testDir,
      });
      await stateMachine.transition(meta.id, "handoff");
      await stateMachine.transition(meta.id, "execution");

      const handoffDir = resolve(testDir, ".virgil/handoffs", meta.id);
      writeFileSync(
        resolve(handoffDir, "AGENT_OUTPUT.md"),
        "# Output\nCompleted.",
        "utf-8",
      );
      await stateMachine.transition(meta.id, "verify");

      const result = await auditService.audit(meta.id);

      expect(result.verdict).toBe("PASS");

      const reportPath = resolve(handoffDir, "AUDIT_REPORT.json");
      expect(existsSync(reportPath)).toBe(true);

      const report = JSON.parse(readFileSync(reportPath, "utf-8"));
      expect(report.verdict).toBe("PASS");
      expect(report.handoffId).toBe(meta.id);
    });
  });

  describe("brief command", () => {
    let savedEnv: NodeJS.ProcessEnv;
    let module: TestingModule;
    let tempDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;
    let logOutput: string[];

    beforeEach(() => {
      savedEnv = { ...process.env };
      logOutput = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logOutput.push(args.map(String).join(" "));
      });
    });

    afterEach(async () => {
      process.env = savedEnv;
      vi.restoreAllMocks();
      if (cwdSpy) cwdSpy.mockRestore();
      if (module) await module.close();
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("virgil brief generates brief.json", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "virgil-e2e-brief-"));
      mkdirSync(join(tempDir, ".virgil"), { recursive: true });
      execSync("git init", { cwd: tempDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', {
        cwd: tempDir,
        stdio: "pipe",
      });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "# Test");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

      const docsDir = join(tempDir, "docs");
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, "constraints.md"),
        "# Constraints\n\nAll APIs must use TLS. This is a mandatory requirement.",
      );

      process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;
      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

      module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([DogmaLocalConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          DogmaLocalModule.registerIfConfigured(),
          BriefModule,
        ],
      }).compile();

      await module.init();

      const briefGenerator = module.get(BriefGeneratorService);
      await briefGenerator.generate(tempDir);

      const briefPath = join(tempDir, ".virgil", "brief.json");
      expect(existsSync(briefPath)).toBe(true);

      const brief = JSON.parse(readFileSync(briefPath, "utf-8"));
      expect(brief.stats).toBeDefined();
      expect(brief.stats.totalItems).toBeGreaterThan(0);
      expect(brief.watermark).toBeDefined();
    });
  });
});
