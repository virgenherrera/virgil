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
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { BriefModule } from "../brief/brief.module.js";
import { BriefGeneratorService } from "../brief/brief-generator.service.js";
import { BriefQueryService } from "../brief/brief-query.service.js";
import { AppError } from "../shared/errors.js";

function createBriefTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "virgil-brief-query-test-"));
  mkdirSync(join(dir, ".virgil"), { recursive: true });
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "pipe" });
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

describe("brief query", () => {
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

  async function bootstrapWithDogma(
    docsDir: string,
  ): Promise<{ generator: BriefGeneratorService; query: BriefQueryService }> {
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

    return {
      generator: module.get(BriefGeneratorService),
      query: module.get(BriefQueryService),
    };
  }

  it("queries brief items by kind", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    const result = await query.query(tempDir, { kinds: ["risk"] });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.kind === "risk")).toBe(true);
    expect(result.stats.matched).toBe(result.items.length);
    expect(result.stats.total).toBe(3); // risk + constraint + principle
  });

  it("queries with multiple kinds", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    const result = await query.query(tempDir, { kinds: ["risk", "constraint"] });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.kind === "risk" || i.kind === "constraint")).toBe(true);
    expect(result.stats.matched).toBe(result.items.length);
  });

  it("queries with text search", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    // Search matches against title — "System Architecture" contains "architecture"
    const result = await query.query(tempDir, { search: "architecture" });

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.title).toBe("System Architecture");
  });

  it("queries with maxItems", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    const result = await query.query(tempDir, { maxItems: 1 });

    expect(result.items.length).toBe(1);
    expect(result.stats.total).toBe(3);
  });

  it("returns all items when no filters", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    const result = await query.query(tempDir, {});

    expect(result.items.length).toBe(3);
    expect(result.stats.matched).toBe(3);
    expect(result.stats.total).toBe(3);
  });

  it("detects watermark drift", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    // Make a new commit after generation
    writeFileSync(join(tempDir, "newfile.txt"), "new content");
    execSync("git add .", { cwd: tempDir, stdio: "pipe" });
    execSync('git commit -m "second commit"', { cwd: tempDir, stdio: "pipe" });

    const drift = await query.checkDrift(tempDir);

    expect(drift.drifted).toBe(true);
    expect(drift.commitsBehind).toBe(1);
    expect(drift.watermark).not.toBe(drift.head);
    expect(drift.watermark).toMatch(/^[a-f0-9]{40}$/);
    expect(drift.head).toMatch(/^[a-f0-9]{40}$/);
  });

  it("reports zero drift when brief is current", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { generator, query } = await bootstrapWithDogma(docsDir);
    await generator.generate(tempDir);

    const drift = await query.checkDrift(tempDir);

    expect(drift.drifted).toBe(false);
    expect(drift.commitsBehind).toBe(0);
    expect(drift.watermark).toBe(drift.head);
  });

  it("throws when brief.json does not exist", async () => {
    tempDir = createBriefTestDir();
    const docsDir = join(tempDir, "docs");
    writeDogmaDocs(docsDir);

    const { query } = await bootstrapWithDogma(docsDir);

    await expect(query.query(tempDir, {})).rejects.toThrow(AppError);
    await expect(query.query(tempDir, {})).rejects.toThrow(/brief\.json/i);
  });
});
