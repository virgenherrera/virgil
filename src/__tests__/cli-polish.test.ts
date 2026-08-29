import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { StatusCommand } from "../commands/status.command.js";
import { ContextCommand } from "../commands/context.command.js";
import { AuditCommand } from "../commands/audit.command.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuditService } from "../audit/audit.service.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { HandoffModule } from "../handoff/handoff.module.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefQueryService } from "../brief/brief-query.service.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { DoctorCommand } from "../commands/doctor.command.js";
import { VersionCommand } from "../commands/version.command.js";
import {
  formatError,
} from "../shared/error-formatter.js";
import {
  ConfigurationError,
  ProviderError,
  AppError,
  ERROR_CODE,
} from "../shared/errors.js";
import { createTestDir, cleanTestDir, initGitRepo } from "./test-helpers.js";
import type {
  ContextProviderPort,
  ProviderHealth,
  RefResolution,
} from "../ports/context-provider.port.js";
import type { ProviderKind } from "../domain/refs.js";

function createTestProvider(
  kind: ProviderKind,
  backendId: string,
  capabilityId: string,
  healthDelay = 0,
): ContextProviderPort {
  return {
    kind,
    backendId,
    capabilityId,
    async healthCheck(): Promise<ProviderHealth> {
      if (healthDelay > 0) {
        await new Promise((r) => setTimeout(r, healthDelay));
      }
      return { status: "available", message: "OK" };
    },
    async resolveRef(_ref: string): Promise<RefResolution> {
      return { resolved: false };
    },
  };
}

describe("cli polish", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("status --verbose", () => {
    let module: TestingModule;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("shows provider health details when verbose", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [StatusCommand],
      }).compile();

      const providerRegistry = module.get(ProviderRegistryService);
      const capabilityRegistry = module.get(CapabilityRegistryService);

      providerRegistry.register(
        createTestProvider("dogma", "local", "dogma:local"),
      );
      capabilityRegistry.register({
        id: "dogma:local",
        description: "Local dogma files",
        status: "available",
        refs: ["dogma://local/security.md"],
      });

      const command = module.get(StatusCommand);
      await command.run([], { verbose: true });

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Health:");
      expect(output).toContain("Config source:");
      expect(output).toContain("Response time:");
    });

    it("keeps compact output without verbose", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [StatusCommand],
      }).compile();

      const providerRegistry = module.get(ProviderRegistryService);
      providerRegistry.register(
        createTestProvider("dogma", "local", "dogma:local"),
      );

      const command = module.get(StatusCommand);
      await command.run([], {});

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).not.toContain("Health:");
      expect(output).not.toContain("Response time:");
    });
  });

  describe("context --verbose", () => {
    let module: TestingModule;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("shows query diagnostics when verbose", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [
          ContextCommand,
          {
            provide: BriefQueryService,
            useValue: {
              query: vi.fn().mockResolvedValue({
                items: [],
                stats: { matched: 0, total: 0 },
                drift: { drifted: false, commitsBehind: 0 },
              }),
            },
          },
          {
            provide: BriefGeneratorService,
            useValue: { generate: vi.fn() },
          },
        ],
      }).compile();

      const providerRegistry = module.get(ProviderRegistryService);
      providerRegistry.register(
        createTestProvider("ticket", "github", "ticket:github"),
      );

      const command = module.get(ContextCommand);
      await command.run(["TEST-1"], { verbose: true });

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Providers queried:");
      expect(output).toContain("Elapsed:");
    });

    it("keeps standard output without verbose", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [
          ContextCommand,
          {
            provide: BriefQueryService,
            useValue: {
              query: vi.fn().mockResolvedValue({
                items: [],
                stats: { matched: 0, total: 0 },
                drift: { drifted: false, commitsBehind: 0 },
              }),
            },
          },
          {
            provide: BriefGeneratorService,
            useValue: { generate: vi.fn() },
          },
        ],
      }).compile();

      const command = module.get(ContextCommand);
      await command.run(["TEST-1"]);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).not.toContain("Providers queried:");
      expect(output).not.toContain("Elapsed:");
    });
  });

  describe("audit --verbose", () => {
    let module: TestingModule;
    let testDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
      if (cwdSpy) {
        cwdSpy.mockRestore();
      }
      if (testDir) {
        cleanTestDir(testDir);
      }
    });

    it("shows check execution times when verbose", async () => {
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
        providers: [AuditCommand],
      }).compile();

      // Mock the audit service to return a controlled result
      const auditService = module.get(AuditService);
      vi.spyOn(auditService, "audit").mockResolvedValue({
        handoffId: "test-handoff",
        verdict: "PASS",
        checks: [
          { name: "scope", passed: true, message: "All files in scope" },
          { name: "forbidden", passed: true, message: "No forbidden files" },
        ],
        auditedAt: new Date().toISOString(),
      });

      const command = module.get(AuditCommand);
      await command.run(["test-handoff"], { verbose: true });

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Execution time:");
      expect(output).toContain("Detailed:");
    });
  });

  describe("doctor command", () => {
    let module: TestingModule;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("reports system health with configured providers", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [DoctorCommand],
      }).compile();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const providerRegistry = module.get(ProviderRegistryService);

      providerRegistry.register(
        createTestProvider("dogma", "local", "dogma:local"),
      );
      capabilityRegistry.register({
        id: "dogma:local",
        description: "Local dogma files",
        status: "available",
      });

      const command = module.get(DoctorCommand);
      await command.run([], {});

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Node.js:");
      expect(output).toContain("Providers (1):");
      expect(output).toContain("[OK] dogma:local");
    });

    it("reports no providers when none configured", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [DoctorCommand],
      }).compile();

      const command = module.get(DoctorCommand);
      await command.run([], {});

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("No providers configured.");
      expect(output).toContain("virgil init");
    });

    it("checks config file existence", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [DoctorCommand],
      }).compile();

      const command = module.get(DoctorCommand);
      await command.run([], {});

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Config:");
    });
  });

  describe("version command", () => {
    it("shows package version", async () => {
      const command = new VersionCommand();
      await command.run([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^virgil \d+\.\d+\.\d+/),
      );
    });
  });

  describe("error formatter", () => {
    it("provides actionable ConfigurationError hints", () => {
      const error = new ConfigurationError("Missing config file");
      const result = formatError(error);

      expect(result).toContain("Missing config file");
      expect(result).toContain("virgil init");
    });

    it("provides actionable ProviderError hints for PROVIDER_UNAVAILABLE", () => {
      const error = new ProviderError(
        "GitHub API unreachable",
        ERROR_CODE.PROVIDER_UNAVAILABLE,
      );
      const result = formatError(error);

      expect(result).toContain("GitHub API unreachable");
      expect(result).toContain("credentials");
    });

    it("provides actionable ProviderError hints for PROVIDER_TIMEOUT", () => {
      const error = new ProviderError(
        "Request timed out",
        ERROR_CODE.PROVIDER_TIMEOUT,
      );
      const result = formatError(error);

      expect(result).toContain("Request timed out");
      expect(result).toContain("took too long");
    });

    it("formats generic AppError with code", () => {
      const error = new AppError("Bad ref", ERROR_CODE.REF_PARSE_FAILED);
      const result = formatError(error);

      expect(result).toBe("Error [REF_PARSE_FAILED]: Bad ref");
    });

    it("formats plain Error objects", () => {
      const error = new Error("something broke");
      const result = formatError(error);

      expect(result).toBe("something broke");
    });

    it("formats non-Error values", () => {
      const result = formatError("a string error");
      expect(result).toBe("a string error");
    });
  });
});
