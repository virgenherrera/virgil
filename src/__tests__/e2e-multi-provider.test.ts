import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stubFetch } from "./e2e-helpers.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { GithubIssuesConfig } from "../providers/ticket/github/github-issues.config.js";
import { GithubIssuesModule } from "../providers/ticket/github/github-issues.module.js";
import { DogmaLocalConfig } from "../providers/dogma/local/dogma-local.config.js";
import { DogmaLocalModule } from "../providers/dogma/local/dogma-local.module.js";
import { OrgLocalConfig } from "../providers/org/local/org-local.config.js";
import { OrgLocalModule } from "../providers/org/local/org-local.module.js";
import { RefResolverModule } from "../domain/ref-resolver.module.js";
import { RefResolverService } from "../domain/ref-resolver.service.js";

describe("e2e: multi-provider integration", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
    vi.restoreAllMocks();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTempDocsDir(): string {
    tempDir = mkdtempSync(join(tmpdir(), "virgil-e2e-mp-"));
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(
      join(docsDir, "architecture.md"),
      [
        "# Architecture",
        "",
        "The system follows a hexagonal architecture pattern.",
      ].join("\n"),
    );
    return docsDir;
  }

  function createTempOrgFile(): string {
    if (!tempDir) {
      tempDir = mkdtempSync(join(tmpdir(), "virgil-e2e-mp-"));
    }
    const orgFile = join(tempDir, "team.json");
    writeFileSync(
      orgFile,
      JSON.stringify([
        { name: "Alice", role: "lead", team: "backend" },
        { name: "Bob", role: "dev", team: "frontend" },
      ]),
    );
    return orgFile;
  }

  it("multiple providers register and report capabilities", async () => {
    const docsDir = createTempDocsDir();
    const orgFile = createTempOrgFile();

    process.env.VIRGIL_GITHUB_TOKEN = "ghp_test";
    process.env.VIRGIL_GITHUB_OWNER = "test-org";
    process.env.VIRGIL_GITHUB_REPO = "test-repo";
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;
    process.env.VIRGIL_ORG_LOCAL_PATH = orgFile;

    stubFetch({ "/user": { login: "test-user" } });

    const module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([
          GithubIssuesConfig,
          DogmaLocalConfig,
          OrgLocalConfig,
        ]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        GithubIssuesModule.registerIfConfigured(),
        DogmaLocalModule.registerIfConfigured(),
        OrgLocalModule.registerIfConfigured(),
      ],
    }).compile();

    await module.init();

    const providerRegistry = module.get(ProviderRegistryService);
    const capabilityRegistry = module.get(CapabilityRegistryService);

    const allProviders = providerRegistry.getAll();
    expect(allProviders.length).toBe(3);

    const kinds = allProviders.map((p) => p.kind).sort();
    expect(kinds).toEqual(["dogma", "org", "ticket"]);

    const capabilities = capabilityRegistry.list();
    const capIds = capabilities.map((c) => c.id).sort();
    expect(capIds).toContain("ticket-github");
    expect(capIds).toContain("dogma-local");
    expect(capIds).toContain("org-local");

    await module.close();
  });

  it("ref resolver dispatches to correct provider by kind", async () => {
    const docsDir = createTempDocsDir();
    const orgFile = createTempOrgFile();

    process.env.VIRGIL_GITHUB_TOKEN = "ghp_test";
    process.env.VIRGIL_GITHUB_OWNER = "test-org";
    process.env.VIRGIL_GITHUB_REPO = "test-repo";
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;
    process.env.VIRGIL_ORG_LOCAL_PATH = orgFile;

    stubFetch({
      "/user": { login: "test-user" },
      "/repos/test-org/test-repo/issues/99": {
        number: 99,
        title: "Refactor API",
        state: "open",
        body: "Needs refactoring",
        html_url: "https://github.com/test-org/test-repo/issues/99",
        assignee: null,
        labels: [],
        milestone: null,
        created_at: "2024-06-01T00:00:00Z",
        updated_at: "2024-06-01T00:00:00Z",
        closed_at: null,
        comments: 0,
      },
    });

    const module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([
          GithubIssuesConfig,
          DogmaLocalConfig,
          OrgLocalConfig,
        ]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        RefResolverModule,
        GithubIssuesModule.registerIfConfigured(),
        DogmaLocalModule.registerIfConfigured(),
        OrgLocalModule.registerIfConfigured(),
      ],
    }).compile();

    await module.init();

    const refResolver = module.get(RefResolverService);

    // Ticket ref dispatches to GitHub Issues provider
    const ticketResult = await refResolver.resolve("ticket://github/99");
    expect(ticketResult.resolved).toBe(true);
    expect(ticketResult.label).toBe("#99: Refactor API");

    // Dogma ref dispatches to DogmaLocal provider
    const dogmaResult = await refResolver.resolve(
      "dogma://local/architecture.md",
    );
    expect(dogmaResult.resolved).toBe(true);
    expect(dogmaResult.label).toBe("architecture.md");

    // Org ref dispatches to OrgLocal provider
    const orgResult = await refResolver.resolve("org://local/Alice");
    expect(orgResult.resolved).toBe(true);
    expect(orgResult.label).toContain("Alice");
    expect(orgResult.label).toContain("lead");

    await module.close();
  });

  it("provider isolation — one degraded provider does not affect others", async () => {
    const docsDir = createTempDocsDir();

    process.env.VIRGIL_GITHUB_TOKEN = "ghp_bad_token";
    process.env.VIRGIL_GITHUB_OWNER = "test-org";
    process.env.VIRGIL_GITHUB_REPO = "test-repo";
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;

    // GitHub health check returns 404 (no /user match)
    stubFetch({});

    const module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([GithubIssuesConfig, DogmaLocalConfig]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        GithubIssuesModule.registerIfConfigured(),
        DogmaLocalModule.registerIfConfigured(),
      ],
    }).compile();

    await module.init();

    const capabilityRegistry = module.get(CapabilityRegistryService);
    const capabilities = capabilityRegistry.list();

    const githubCap = capabilities.find((c) => c.id === "ticket-github");
    expect(githubCap).toBeDefined();
    expect(githubCap!.status).toBe("degraded");

    const dogmaCap = capabilities.find((c) => c.id === "dogma-local");
    expect(dogmaCap).toBeDefined();
    expect(dogmaCap!.status).toBe("available");

    await module.close();
  });

  it("status command shows all configured providers", async () => {
    const docsDir = createTempDocsDir();
    const orgFile = createTempOrgFile();

    process.env.VIRGIL_GITHUB_TOKEN = "ghp_test";
    process.env.VIRGIL_GITHUB_OWNER = "test-org";
    process.env.VIRGIL_GITHUB_REPO = "test-repo";
    process.env.VIRGIL_DOGMA_LOCAL_PATH = docsDir;
    process.env.VIRGIL_ORG_LOCAL_PATH = orgFile;

    stubFetch({ "/user": { login: "test-user" } });

    // Import StatusCommand here to avoid loading it at module level
    const { StatusCommand } = await import("../commands/status.command.js");

    const module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([
          GithubIssuesConfig,
          DogmaLocalConfig,
          OrgLocalConfig,
        ]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        GithubIssuesModule.registerIfConfigured(),
        DogmaLocalModule.registerIfConfigured(),
        OrgLocalModule.registerIfConfigured(),
      ],
      providers: [StatusCommand],
    }).compile();

    await module.init();

    const logOutput: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });

    const statusCommand = module.get(StatusCommand);
    await statusCommand.run([], {});

    const output = logOutput.join("\n");

    expect(output).toContain("ticket-github");
    expect(output).toContain("dogma-local");
    expect(output).toContain("org-local");
    expect(output).toContain("[OK]");

    await module.close();
  });
});
