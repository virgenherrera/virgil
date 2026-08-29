import { Test, type TestingModule } from "@nestjs/testing";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ExecutionTrackerService } from "../handoff/execution-tracker.service.js";
import { HandoffModule } from "../handoff/handoff.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";

function createTestHandoff(
  tmpDir: string,
  state: string,
  executionPhase?: string,
) {
  const handoffsDir = resolve(tmpDir, ".virgil", "handoffs", "TEST-1-123");
  mkdirSync(handoffsDir, { recursive: true });
  const meta = {
    id: "TEST-1-123",
    schemaVersion: "1.0.0",
    state,
    ticketKey: "TEST-1",
    ffLevel: 1,
    generatedAt: new Date().toISOString(),
    repos: [],
    guardrails: {
      allowedPaths: ["src/**"],
      forbiddenPaths: [],
      maxFilesChanged: 8,
      maxLinesChanged: 400,
    },
    ...(executionPhase ? { executionPhase } : {}),
  };
  writeFileSync(
    resolve(handoffsDir, "META.json"),
    JSON.stringify(meta, null, 2),
  );
  writeFileSync(resolve(handoffsDir, "TASK.md"), "# Task");
  writeFileSync(resolve(handoffsDir, "CONTEXT.md"), "# Context");
  writeFileSync(
    resolve(handoffsDir, "ACCEPTANCE_CHECKLIST.md"),
    "# Checklist",
  );
  return handoffsDir;
}

describe("execution sub-phases", () => {
  let module: TestingModule;
  let tracker: ExecutionTrackerService;
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
      ],
    }).compile();

    tracker = module.get(ExecutionTrackerService);
    ledger = module.get(LedgerService);
  });

  afterEach(async () => {
    await module.close();
    cwdSpy.mockRestore();
    cleanTestDir(testDir);
  });

  describe("valid transitions", () => {
    it("advances pre-phase -> red -> green -> refactor -> verify", async () => {
      createTestHandoff(testDir, "execution");

      const afterRed = await tracker.advancePhase("TEST-1-123", "red");
      expect(afterRed.executionPhase).toBe("red");

      const afterGreen = await tracker.advancePhase("TEST-1-123", "green");
      expect(afterGreen.executionPhase).toBe("green");

      const afterRefactor = await tracker.advancePhase(
        "TEST-1-123",
        "refactor",
      );
      expect(afterRefactor.executionPhase).toBe("refactor");

      const afterVerify = await tracker.advancePhase("TEST-1-123", "verify");
      expect(afterVerify.executionPhase).toBe("verify");
    });

    it("cycles back from verify -> red", async () => {
      createTestHandoff(testDir, "execution", "verify");

      const afterRed = await tracker.advancePhase("TEST-1-123", "red");
      expect(afterRed.executionPhase).toBe("red");
    });
  });

  describe("invalid transitions", () => {
    it("rejects pre-phase -> green (must go through red)", async () => {
      createTestHandoff(testDir, "execution");

      await expect(
        tracker.advancePhase("TEST-1-123", "green"),
      ).rejects.toThrow(/Invalid phase transition/);
    });
  });

  describe("state guard", () => {
    it("throws when handoff is not in execution state", async () => {
      createTestHandoff(testDir, "draft");

      await expect(
        tracker.advancePhase("TEST-1-123", "red"),
      ).rejects.toThrow(/only apply in 'execution' state/);
    });
  });

  describe("persistence", () => {
    it("persists executionPhase in META.json", async () => {
      const handoffDir = createTestHandoff(testDir, "execution");

      await tracker.advancePhase("TEST-1-123", "red");

      const raw = readFileSync(resolve(handoffDir, "META.json"), "utf-8");
      const meta = JSON.parse(raw);
      expect(meta.executionPhase).toBe("red");
    });
  });

  describe("defaults", () => {
    it("defaults to pre-phase when no executionPhase set", () => {
      createTestHandoff(testDir, "execution");

      const phase = tracker.currentPhase("TEST-1-123");
      expect(phase).toBe("pre-phase");
    });
  });

  describe("full cycle", () => {
    it("completes pre-phase -> red -> green -> refactor -> verify", async () => {
      createTestHandoff(testDir, "execution");
      const phases = ["red", "green", "refactor", "verify"] as const;

      for (const phase of phases) {
        await tracker.advancePhase("TEST-1-123", phase);
      }

      const current = tracker.currentPhase("TEST-1-123");
      expect(current).toBe("verify");
    });
  });

  describe("ledger entries", () => {
    it("writes a ledger entry for each phase transition", async () => {
      createTestHandoff(testDir, "execution");

      await tracker.advancePhase("TEST-1-123", "red");
      await tracker.advancePhase("TEST-1-123", "green");

      const entries = await ledger.getEntries("TEST-1-123");
      const phaseEntries = entries.filter(
        (e) => e.event === "phase-transition",
      );

      expect(phaseEntries).toHaveLength(2);
      expect(phaseEntries[0]!.from).toBe("pre-phase");
      expect(phaseEntries[0]!.to).toBe("red");
      expect(phaseEntries[1]!.from).toBe("red");
      expect(phaseEntries[1]!.to).toBe("green");
    });
  });

  describe("currentPhase", () => {
    it("returns the current phase from META.json", async () => {
      createTestHandoff(testDir, "execution", "refactor");

      const phase = tracker.currentPhase("TEST-1-123");
      expect(phase).toBe("refactor");
    });
  });
});
