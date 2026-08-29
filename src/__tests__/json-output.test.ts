import { Test, type TestingModule } from "@nestjs/testing";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { BriefQueryService } from "../brief/brief-query.service.js";
import { StatusCommand } from "../commands/status.command.js";
import { BriefCommand } from "../commands/brief.command.js";
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
): ContextProviderPort {
  return {
    kind,
    backendId,
    capabilityId,
    async healthCheck(): Promise<ProviderHealth> {
      return { status: "available", message: "OK" };
    },
    async resolveRef(_ref: string): Promise<RefResolution> {
      return { resolved: false };
    },
  };
}

function createBriefTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "virgil-json-output-test-"));
  mkdirSync(join(dir, ".virgil"), { recursive: true });
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# Test");
  execSync("git add .", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "pipe" });
  return dir;
}

function writeDogmaDocs(docsDir: string): void {
  mkdirSync(docsDir, { recursive: true });

  writeFileSync(
    join(docsDir, "security.md"),
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
    join(docsDir, "architecture.md"),
    [
      "# System Architecture",
      "",
      "The system follows a hexagonal architecture pattern with ports and adapters.",
    ].join("\n"),
  );
}

describe("json output", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedEnv = { ...process.env };
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = savedEnv;
    consoleSpy.mockRestore();
  });

  describe("virgil status --json", () => {
    let module: TestingModule;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("outputs valid JSON with providers", async () => {
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
      await command.run([], { json: true });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.version).toBe("0.1.0");
      expect(parsed.providers).toBeInstanceOf(Array);
      expect(parsed.providers.length).toBe(1);
      expect(parsed.providers[0]).toMatchObject({
        capabilityId: "dogma:local",
        kind: "dogma",
        backendId: "local",
        status: "available",
      });
      expect(parsed.capabilities).toBeInstanceOf(Array);
      expect(parsed.capabilities.length).toBe(1);
      expect(parsed.capabilities[0]).toMatchObject({
        id: "dogma:local",
        description: "Local dogma files",
        status: "available",
      });
    });

    it("with no providers outputs empty arrays", async () => {
      module = await Test.createTestingModule({
        imports: [CapabilityRegistryModule, ProviderRegistryModule],
        providers: [StatusCommand],
      }).compile();

      const command = module.get(StatusCommand);
      await command.run([], { json: true });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.version).toBe("0.1.0");
      expect(parsed.providers).toEqual([]);
      expect(parsed.capabilities).toEqual([]);
    });
  });

  describe("virgil brief --json", () => {
    let module: TestingModule;
    let tempDir: string;

    afterEach(async () => {
      if (module) {
        await module.close();
      }
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    async function bootstrapBrief(docsDir: string): Promise<TestingModule> {
      process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

      const mod = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([DogmaLocalConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          DogmaLocalModule.registerIfConfigured(),
          BriefModule,
        ],
        providers: [BriefCommand],
      }).compile();

      await mod.init();
      return mod;
    }

    it("outputs brief as JSON in generate mode", async () => {
      tempDir = createBriefTestDir();
      const docsDir = join(tempDir, "docs");
      writeDogmaDocs(docsDir);

      // Override process.cwd for BriefCommand
      const originalCwd = process.cwd;
      process.cwd = () => tempDir;

      try {
        module = await bootstrapBrief(docsDir);
        const command = module.get(BriefCommand);
        await command.run([], { json: true });

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const output = consoleSpy.mock.calls[0]![0] as string;
        const parsed = JSON.parse(output);

        expect(parsed.schemaVersion).toBe("1.0.0");
        expect(parsed.watermark).toMatch(/^[a-f0-9]{40}$/);
        expect(parsed.items).toBeInstanceOf(Array);
        expect(parsed.items.length).toBe(3);
        expect(parsed.stats).toBeDefined();
        expect(parsed.stats.totalItems).toBe(3);
        expect(parsed.stats.totalDocuments).toBe(2);
      } finally {
        process.cwd = originalCwd;
      }
    });

    it("outputs query result as JSON with --kind filter", async () => {
      tempDir = createBriefTestDir();
      const docsDir = join(tempDir, "docs");
      writeDogmaDocs(docsDir);

      const originalCwd = process.cwd;
      process.cwd = () => tempDir;

      try {
        module = await bootstrapBrief(docsDir);

        // First generate the brief so it persists to .virgil/brief.json
        const generator = module.get(BriefGeneratorService);
        await generator.generate(tempDir);

        consoleSpy.mockClear();

        const command = module.get(BriefCommand);
        await command.run([], { kind: ["risk"], json: true });

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const output = consoleSpy.mock.calls[0]![0] as string;
        const parsed = JSON.parse(output);

        expect(parsed.items).toBeInstanceOf(Array);
        expect(parsed.items.length).toBeGreaterThan(0);
        expect(parsed.items.every((i: { kind: string }) => i.kind === "risk")).toBe(true);
        expect(parsed.stats).toBeDefined();
        expect(parsed.stats.matched).toBeDefined();
        expect(parsed.stats.total).toBeDefined();
        expect(parsed.drift).toBeDefined();
      } finally {
        process.cwd = originalCwd;
      }
    });
  });
});
