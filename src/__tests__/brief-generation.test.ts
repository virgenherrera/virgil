import { Test, type TestingModule } from "@nestjs/testing";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import type { Brief } from "../brief/brief.types.js";

function createBriefTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "virgil-brief-test-"));
  mkdirSync(join(dir, ".virgil"), { recursive: true });
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# Test");
  execSync("git add .", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "pipe" });
  return dir;
}

describe("brief generation", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let module: TestingModule;
  let tempDir: string;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(async () => {
    process.env = savedEnv;
    if (module) {
      await module.close();
    }
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function bootstrapWithDogma(docsDir: string): Promise<BriefGeneratorService> {
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

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

    return module.get(BriefGeneratorService);
  }

  it("generates brief from markdown documents", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
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

    const generator = await bootstrapWithDogma(docsDir);
    const brief = await generator.generate(tempDir);

    expect(brief.schemaVersion).toBe("1.0.0");
    expect(brief.stats.totalDocuments).toBe(2);
    expect(brief.stats.totalItems).toBe(3);
    expect(brief.watermark).toMatch(/^[a-f0-9]{40}$/);

    const riskItems = brief.items.filter((i) => i.kind === "risk");
    expect(riskItems.length).toBe(1);
    expect(riskItems[0]!.title).toBe("Security Policy");

    const constraintItems = brief.items.filter((i) => i.kind === "constraint");
    expect(constraintItems.length).toBe(1);
    expect(constraintItems[0]!.title).toBe("Deployment Constraints");

    const archItems = brief.items.filter((i) => i.kind === "principle");
    expect(archItems.length).toBe(1);
    expect(archItems[0]!.title).toBe("System Architecture");
  });

  it("handles documents without headings", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    writeFileSync(
      join(docsDir, "notes.txt"),
      [
        "First paragraph about general principles.",
        "",
        "Second paragraph about more principles.",
      ].join("\n"),
    );

    const generator = await bootstrapWithDogma(docsDir);
    const brief = await generator.generate(tempDir);

    expect(brief.stats.totalDocuments).toBe(1);
    expect(brief.stats.totalItems).toBe(2);
    expect(brief.items[0]!.title).toBe("Section 1");
    expect(brief.items[1]!.title).toBe("Section 2");
  });

  it("privacy-aware summarization", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    writeFileSync(
      join(docsDir, "secrets.md"),
      [
        "# API Key Management",
        "",
        "Store the api_key in vault. Never expose password or token values in logs.",
      ].join("\n"),
    );

    const generator = await bootstrapWithDogma(docsDir);
    const brief = await generator.generate(tempDir);

    expect(brief.stats.totalItems).toBe(1);
    expect(brief.items[0]!.summary).toBe(
      "Source contains credential or secret management guidance. Reference it by source ref without exposing values.",
    );
    // Raw content must not leak
    expect(brief.items[0]!.summary).not.toContain("api_key");
    expect(brief.items[0]!.summary).not.toContain("vault");
  });

  it("persists brief.json and brief.md", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    writeFileSync(
      join(docsDir, "example.md"),
      ["# Example", "", "Some content here."].join("\n"),
    );

    const generator = await bootstrapWithDogma(docsDir);
    const brief = await generator.generate(tempDir);

    const jsonPath = join(tempDir, ".virgil", "brief.json");
    const mdPath = join(tempDir, ".virgil", "brief.md");

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);

    const persisted = JSON.parse(readFileSync(jsonPath, "utf-8")) as Brief;
    expect(persisted.schemaVersion).toBe(brief.schemaVersion);
    expect(persisted.watermark).toBe(brief.watermark);
    expect(persisted.items.length).toBe(brief.items.length);
    expect(persisted.stats.totalItems).toBe(brief.stats.totalItems);

    const md = readFileSync(mdPath, "utf-8");
    expect(md).toContain("# Dogma Brief");
    expect(md).toContain("### Example");
  });

  it("empty dogma directory produces empty brief", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });

    const generator = await bootstrapWithDogma(docsDir);
    const brief = await generator.generate(tempDir);

    expect(brief.stats.totalDocuments).toBe(0);
    expect(brief.stats.totalItems).toBe(0);
    expect(brief.items).toEqual([]);
    expect(brief.stats.byKind.principle).toBe(0);
    expect(brief.stats.byKind.risk).toBe(0);
  });

  it("throws when no dogma provider registered", async () => {
    tempDir = createBriefTestDir();
    delete process.env.VIRGIL_DOGMA_LOCAL_PATH;

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

    const generator = module.get(BriefGeneratorService);

    await expect(generator.generate(tempDir)).rejects.toThrow(
      "No dogma provider registered",
    );
  });
});
