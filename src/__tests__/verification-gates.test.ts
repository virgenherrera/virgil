vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, execSync: vi.fn(mod.execSync) };
});

import { Test, type TestingModule } from "@nestjs/testing";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { HandoffModule } from "../handoff/handoff.module.js";
import { HandoffService } from "../handoff/handoff.service.js";
import { HandoffStateMachine } from "../handoff/handoff-state-machine.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { VerificationGatesConfig } from "../config/verification-gates.config.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

const mockedExecSync = vi.mocked(execSync);

describe("verification gates", () => {
  let module: TestingModule;
  let handoffService: HandoffService;
  let stateMachine: HandoffStateMachine;
  let auditService: AuditService;
  let testDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let originalExecSync: Function;

  beforeAll(() => {
    originalExecSync = mockedExecSync.getMockImplementation()!;
  });

  async function buildModule() {
    module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([VerificationGatesConfig]),
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
  }

  async function createHandoffInExecution(ticketKey: string) {
    const meta = await handoffService.create(ticketKey, {
      repoPath: testDir,
    });
    await stateMachine.transition(meta.id, "handoff");
    await stateMachine.transition(meta.id, "execution");
    return meta;
  }

  function writeAgentOutput(handoffId: string) {
    const handoffDir = resolve(testDir, ".virgil/handoffs", handoffId);
    writeFileSync(
      resolve(handoffDir, "AGENT_OUTPUT.md"),
      "# Output\nDone.",
      "utf-8",
    );
  }

  function stubVerificationCommand(handler: (cmd: string, opts?: any) => any) {
    mockedExecSync.mockImplementation(((cmd: string, opts?: any) => {
      if (
        typeof cmd === "string" &&
        (cmd.includes("vitest") ||
          cmd.includes("npm audit") ||
          cmd.includes("tsc --noEmit"))
      ) {
        return handler(cmd, opts);
      }
      return originalExecSync(cmd, opts);
    }) as any);
  }

  beforeEach(() => {
    testDir = createTestDir();
    initGitRepo(testDir);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    cwdSpy.mockRestore();
    mockedExecSync.mockImplementation(originalExecSync as any);
    cleanTestDir(testDir);
  });

  describe("coverage check", () => {
    it("passes when coverage meets threshold", async () => {
      process.env.VIRGIL_COVERAGE_THRESHOLD = "50";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-COV-1");
        writeAgentOutput(meta.id);

        // Create mock coverage-summary.json in the repo
        const coverageDir = join(testDir, "coverage");
        mkdirSync(coverageDir, { recursive: true });
        writeFileSync(
          join(coverageDir, "coverage-summary.json"),
          JSON.stringify({ total: { statements: { pct: 85 } } }),
        );

        // Stub vitest command to succeed without actually running
        stubVerificationCommand((cmd) => {
          if (cmd.includes("vitest")) return "";
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const coverageCheck = result.checks.find((c) => c.name === "coverage");
        expect(coverageCheck).toBeDefined();
        expect(coverageCheck!.passed).toBe(true);
        expect(coverageCheck!.message).toContain("85%");
        expect(coverageCheck!.message).toContain("50%");
      } finally {
        delete process.env.VIRGIL_COVERAGE_THRESHOLD;
      }
    });

    it("fails when coverage is below threshold", async () => {
      process.env.VIRGIL_COVERAGE_THRESHOLD = "50";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-COV-2");
        writeAgentOutput(meta.id);

        // Create mock coverage-summary.json with low coverage
        const coverageDir = join(testDir, "coverage");
        mkdirSync(coverageDir, { recursive: true });
        writeFileSync(
          join(coverageDir, "coverage-summary.json"),
          JSON.stringify({ total: { statements: { pct: 30 } } }),
        );

        stubVerificationCommand((cmd) => {
          if (cmd.includes("vitest")) return "";
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const coverageCheck = result.checks.find((c) => c.name === "coverage");
        expect(coverageCheck).toBeDefined();
        expect(coverageCheck!.passed).toBe(false);
        expect(coverageCheck!.message).toContain("30%");
        expect(coverageCheck!.gapType).toBe("testing");
      } finally {
        delete process.env.VIRGIL_COVERAGE_THRESHOLD;
      }
    });

    it("is skipped when VIRGIL_COVERAGE_THRESHOLD is not set", async () => {
      delete process.env.VIRGIL_COVERAGE_THRESHOLD;
      await buildModule();

      const meta = await createHandoffInExecution("VG-COV-3");
      writeAgentOutput(meta.id);

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const coverageCheck = result.checks.find((c) => c.name === "coverage");
      expect(coverageCheck).toBeUndefined();
    });
  });

  describe("npm-audit check", () => {
    it("passes with zero critical/high CVEs", async () => {
      process.env.VIRGIL_MAX_CRITICAL_CVES = "0";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-NPM-1");
        writeAgentOutput(meta.id);

        stubVerificationCommand((cmd) => {
          if (cmd.includes("npm audit")) {
            return JSON.stringify({
              metadata: {
                vulnerabilities: {
                  critical: 0,
                  high: 0,
                  moderate: 3,
                  low: 1,
                },
              },
            });
          }
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const auditCheck = result.checks.find((c) => c.name === "npm-audit");
        expect(auditCheck).toBeDefined();
        expect(auditCheck!.passed).toBe(true);
        expect(auditCheck!.message).toContain("0 critical/high CVEs");
      } finally {
        delete process.env.VIRGIL_MAX_CRITICAL_CVES;
      }
    });

    it("fails when critical CVEs exceed limit", async () => {
      process.env.VIRGIL_MAX_CRITICAL_CVES = "0";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-NPM-2");
        writeAgentOutput(meta.id);

        stubVerificationCommand((cmd) => {
          if (cmd.includes("npm audit")) {
            return JSON.stringify({
              metadata: {
                vulnerabilities: {
                  critical: 2,
                  high: 1,
                  moderate: 0,
                  low: 0,
                },
              },
            });
          }
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const auditCheck = result.checks.find((c) => c.name === "npm-audit");
        expect(auditCheck).toBeDefined();
        expect(auditCheck!.passed).toBe(false);
        expect(auditCheck!.message).toContain("3 critical/high CVEs");
        expect(auditCheck!.gapType).toBe("compliance");
      } finally {
        delete process.env.VIRGIL_MAX_CRITICAL_CVES;
      }
    });
  });

  describe("type-check", () => {
    it("passes when tsc reports no errors", async () => {
      process.env.VIRGIL_TYPE_CHECK = "true";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-TSC-1");
        writeAgentOutput(meta.id);

        stubVerificationCommand((cmd) => {
          if (cmd.includes("tsc --noEmit")) return "";
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const typeCheck = result.checks.find((c) => c.name === "type-check");
        expect(typeCheck).toBeDefined();
        expect(typeCheck!.passed).toBe(true);
        expect(typeCheck!.message).toContain("No type errors");
      } finally {
        delete process.env.VIRGIL_TYPE_CHECK;
      }
    });

    it("fails when tsc reports errors", async () => {
      process.env.VIRGIL_TYPE_CHECK = "true";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-TSC-2");
        writeAgentOutput(meta.id);

        stubVerificationCommand((cmd) => {
          if (cmd.includes("tsc --noEmit")) {
            const err = new Error("tsc failed") as any;
            err.stderr =
              "src/foo.ts(1,1): error TS2304: Cannot find name 'x'.\nsrc/bar.ts(5,3): error TS2345: Argument type mismatch.";
            err.status = 2;
            throw err;
          }
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        const typeCheck = result.checks.find((c) => c.name === "type-check");
        expect(typeCheck).toBeDefined();
        expect(typeCheck!.passed).toBe(false);
        expect(typeCheck!.message).toContain("2");
        expect(typeCheck!.message).toContain("type error");
        expect(typeCheck!.gapType).toBe("contract");
      } finally {
        delete process.env.VIRGIL_TYPE_CHECK;
      }
    });
  });

  describe("gating logic", () => {
    it("runs only original 6 checks when no verification gates configured", async () => {
      delete process.env.VIRGIL_COVERAGE_THRESHOLD;
      delete process.env.VIRGIL_TYPE_CHECK;
      delete process.env.VIRGIL_MAX_CRITICAL_CVES;

      await buildModule();

      const meta = await createHandoffInExecution("VG-GATE-1");
      writeAgentOutput(meta.id);

      await stateMachine.transition(meta.id, "verify");
      const result = await auditService.audit(meta.id);

      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames).not.toContain("coverage");
      expect(checkNames).not.toContain("npm-audit");
      expect(checkNames).not.toContain("type-check");
      // Original checks should still be present
      expect(checkNames).toContain("scope");
      expect(checkNames).toContain("forbidden");
      expect(checkNames).toContain("file-count");
      expect(checkNames).toContain("line-count");
      expect(checkNames).toContain("conflict-markers");
      expect(checkNames).toContain("agent-output");
    });
  });

  describe("recommendation routing", () => {
    it("recommends improving test coverage for TESTING gap", async () => {
      process.env.VIRGIL_COVERAGE_THRESHOLD = "90";
      try {
        await buildModule();

        const meta = await createHandoffInExecution("VG-REC-1");
        writeAgentOutput(meta.id);

        // Create mock coverage below threshold
        const coverageDir = join(testDir, "coverage");
        mkdirSync(coverageDir, { recursive: true });
        writeFileSync(
          join(coverageDir, "coverage-summary.json"),
          JSON.stringify({ total: { statements: { pct: 10 } } }),
        );

        stubVerificationCommand((cmd) => {
          if (cmd.includes("vitest")) return "";
          return "";
        });

        await stateMachine.transition(meta.id, "verify");
        const result = await auditService.audit(meta.id);

        expect(result.recommendation).toContain("test coverage");
      } finally {
        delete process.env.VIRGIL_COVERAGE_THRESHOLD;
      }
    });
  });
});
