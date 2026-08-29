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
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { RefResolverModule } from "../domain/ref-resolver.module.js";
import { RefResolverService } from "../domain/ref-resolver.service.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { ContextCommand } from "../commands/context.command.js";
import type {
  ContextProviderPort,
  ProviderHealth,
  RefResolution,
} from "../ports/context-provider.port.js";
import type { ProviderKind } from "../domain/refs.js";

function createResolvingProvider(
  kind: ProviderKind,
  backendId: string,
  capabilityId: string,
  resolutions: Record<string, RefResolution>,
): ContextProviderPort {
  return {
    kind,
    backendId,
    capabilityId,
    async healthCheck(): Promise<ProviderHealth> {
      return { status: "available" };
    },
    async resolveRef(ref: string): Promise<RefResolution> {
      return resolutions[ref] ?? { resolved: false };
    },
  };
}

describe("context flow", () => {
  let module: TestingModule;
  let refResolver: RefResolverService;
  let registry: ProviderRegistryService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        CapabilityRegistryModule,
        ProviderRegistryModule,
        RefResolverModule,
      ],
    }).compile();

    refResolver = module.get(RefResolverService);
    registry = module.get(ProviderRegistryService);
  });

  afterEach(async () => {
    await module.close();
  });

  it("resolves refs through RefResolverService", async () => {
    const provider = createResolvingProvider(
      "ticket",
      "test-jira",
      "ticket:jira",
      {
        "ticket://test-jira/PROJ-1": {
          resolved: true,
          uri: "https://jira.test/PROJ-1",
          label: "Fix login bug",
        },
      },
    );
    registry.register(provider);

    const result = await refResolver.resolve("ticket://test-jira/PROJ-1");

    expect(result.resolved).toBe(true);
    expect(result.label).toBe("Fix login bug");
    expect(result.uri).toBe("https://jira.test/PROJ-1");
  });

  it("resolveMany handles multiple refs concurrently", async () => {
    const provider = createResolvingProvider(
      "ticket",
      "test-jira",
      "ticket:jira",
      {
        "ticket://test-jira/A-1": {
          resolved: true,
          uri: "https://jira.test/A-1",
          label: "Task A",
        },
        "ticket://test-jira/A-2": {
          resolved: true,
          uri: "https://jira.test/A-2",
          label: "Task B",
        },
      },
    );
    registry.register(provider);

    const results = await refResolver.resolveMany([
      "ticket://test-jira/A-1",
      "ticket://test-jira/A-2",
    ]);

    expect(results.size).toBe(2);
    expect(results.get("ticket://test-jira/A-1")!.resolved).toBe(true);
    expect(results.get("ticket://test-jira/A-2")!.resolved).toBe(true);
  });

  it("returns resolved: false for unknown refs", async () => {
    const result = await refResolver.resolve("ticket://unknown/NONE-1");

    expect(result.resolved).toBe(false);
  });
});

function createContextTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "virgil-context-brief-test-"));
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

function writeContextDogmaDocs(docsDir: string): void {
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

describe("context command brief display", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let savedCwd: string;
  let module: TestingModule;
  let tempDir: string;
  let logOutput: string[];

  async function bootstrapContextCommand(
    docsDir: string,
  ): Promise<ContextCommand> {
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

    module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([DogmaLocalConfig]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        DogmaLocalModule.registerIfConfigured(),
        BriefModule,
      ],
      providers: [ContextCommand],
    }).compile();

    await module.init();

    return module.get(ContextCommand);
  }

  beforeEach(() => {
    savedEnv = { ...process.env };
    savedCwd = process.cwd();
    logOutput = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });
  });

  afterEach(async () => {
    process.env = savedEnv;
    process.chdir(savedCwd);
    vi.restoreAllMocks();
    if (module) await module.close();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("shows brief items grouped by kind in context output", async () => {
    tempDir = createContextTestDir();
    const docsDir = join(tempDir, "docs");
    writeContextDogmaDocs(docsDir);
    process.chdir(tempDir);

    const command = await bootstrapContextCommand(docsDir);
    await command.run(["TICKET-1"]);

    const output = logOutput.join("\n");

    // Verify kind-grouped brief items appear
    expect(output).toContain("[risk]");
    expect(output).toContain("[constraint]");
    expect(output).toContain("[principle]");
    expect(output).toContain("Security Policy");
    expect(output).toContain("Deployment Constraints");
    expect(output).toContain("System Architecture");

    // Verify stats line
    expect(output).toMatch(/3 items from 3/);
  });

  it("shows drift warning when brief is stale", async () => {
    tempDir = createContextTestDir();
    const docsDir = join(tempDir, "docs");
    writeContextDogmaDocs(docsDir);
    process.chdir(tempDir);

    const command = await bootstrapContextCommand(docsDir);

    // First run auto-generates the brief
    await command.run(["TICKET-1"]);

    // Clear the captured output
    logOutput = [];

    // Make a new commit to cause drift
    writeFileSync(join(tempDir, "newfile.txt"), "new content");
    execSync("git add .", { cwd: tempDir, stdio: "pipe" });
    execSync('git commit -m "second commit"', {
      cwd: tempDir,
      stdio: "pipe",
    });

    // Second run should show drift warning
    await command.run(["TICKET-1"]);

    const output = logOutput.join("\n");
    expect(output).toMatch(/Brief is 1 commit\(s\) behind HEAD/);
  });
});
