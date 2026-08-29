import { Test, type TestingModule } from "@nestjs/testing";
import {
  mkdtempSync,
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
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { GithubWikiConfig } from "../providers/dogma/github-wiki/github-wiki.config.js";
import { GithubWikiModule } from "../providers/dogma/github-wiki/github-wiki.module.js";
import { GithubWikiService } from "../providers/dogma/github-wiki/github-wiki.service.js";
import { ConfigurationError } from "../shared/errors.js";

/**
 * Creates a local bare git repo with wiki pages and a clone from it,
 * simulating a cached GitHub wiki checkout.
 */
function createMockWikiRepo(): { bareDir: string; cacheDir: string } {
  // Create a bare repo simulating the .wiki.git remote
  const bareDir = mkdtempSync(join(tmpdir(), "virgil-wiki-bare-"));
  execSync("git init --bare", { cwd: bareDir, stdio: "pipe" });

  // Create a working repo, add wiki pages, push to bare
  const workDir = mkdtempSync(join(tmpdir(), "virgil-wiki-work-"));
  execSync("git init -b master", { cwd: workDir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: workDir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: workDir, stdio: "pipe" });

  writeFileSync(
    join(workDir, "Home.md"),
    "# Home\n\nWelcome to the wiki.",
  );
  writeFileSync(
    join(workDir, "Getting-Started.md"),
    "# Getting Started\n\nFollow these steps.",
  );
  writeFileSync(
    join(workDir, "_Sidebar.md"),
    "# Sidebar\n\n- [Home](Home)\n- [Getting Started](Getting-Started)",
  );
  writeFileSync(join(workDir, "_Footer.md"), "Footer content");

  execSync("git add .", { cwd: workDir, stdio: "pipe" });
  execSync('git commit -m "initial wiki"', { cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin ${bareDir}`, {
    cwd: workDir,
    stdio: "pipe",
  });
  execSync("git push origin master", { cwd: workDir, stdio: "pipe" });

  rmSync(workDir, { recursive: true, force: true });

  // Clone from bare to simulate the service's cached clone
  const cacheDir = mkdtempSync(join(tmpdir(), "virgil-wiki-cache-"));
  rmSync(cacheDir, { recursive: true, force: true });
  execSync(`git clone --depth 1 ${bareDir} ${cacheDir}`, { stdio: "pipe" });

  return { bareDir, cacheDir };
}

describe("github-wiki provider", () => {
  let savedEnv: NodeJS.ProcessEnv;
  let module: TestingModule;
  const tempDirs: string[] = [];

  function trackDir(dir: string): string {
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(async () => {
    process.env = savedEnv;
    if (module) {
      await module.close();
    }
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  async function bootstrap(
    cacheDir: string,
  ): Promise<GithubWikiService> {
    process.env.VIRGIL_GITHUB_WIKI_OWNER = "test-owner";
    process.env.VIRGIL_GITHUB_WIKI_REPO = "test-repo";
    process.env.VIRGIL_GITHUB_WIKI_CACHE_DIR = cacheDir;

    module = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot([GithubWikiConfig]),
        CapabilityRegistryModule,
        ProviderRegistryModule,
        GithubWikiModule.registerIfConfigured(),
      ],
    }).compile();

    await module.init();

    return module.get(GithubWikiService);
  }

  describe("absent env", () => {
    it("registers empty module when env vars are not set", async () => {
      delete process.env.VIRGIL_GITHUB_WIKI_OWNER;
      delete process.env.VIRGIL_GITHUB_WIKI_REPO;
      delete process.env.VIRGIL_GITHUB_WIKI_TOKEN;
      delete process.env.VIRGIL_GITHUB_WIKI_CACHE_DIR;

      module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubWikiConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubWikiModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getAll();
      expect(providers).toHaveLength(0);
    });
  });

  describe("partial env", () => {
    it("throws ConfigurationError when only owner is set", () => {
      process.env.VIRGIL_GITHUB_WIKI_OWNER = "test-owner";
      delete process.env.VIRGIL_GITHUB_WIKI_REPO;

      expect(() => GithubWikiModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
    });

    it("throws ConfigurationError when only repo is set", () => {
      delete process.env.VIRGIL_GITHUB_WIKI_OWNER;
      process.env.VIRGIL_GITHUB_WIKI_REPO = "test-repo";

      expect(() => GithubWikiModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
    });
  });

  describe("snapshot", () => {
    it("returns wiki pages excluding special files", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.snapshot({});

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeTruthy();

      const pageNames = result.data.map((d) => d.relativePath).sort();
      expect(pageNames).toEqual(["Getting-Started.md", "Home.md"]);
    });

    it("filters out _Sidebar, _Footer, and _Header files", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.snapshot({});

      const paths = result.data.map((d) => d.relativePath);
      expect(paths).not.toContain("_Sidebar.md");
      expect(paths).not.toContain("_Footer.md");
      expect(paths).not.toContain("_Header.md");
    });

    it("reads wiki page content correctly", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.snapshot({});

      const homePage = result.data.find((d) => d.relativePath === "Home.md");
      expect(homePage).toBeDefined();
      expect(homePage!.content).toBe("# Home\n\nWelcome to the wiki.");
      expect(homePage!.ref).toBe("dogma://github-wiki/Home.md");
      expect(homePage!.size).toBeGreaterThan(0);
      expect(homePage!.modifiedAt).toBeTruthy();
    });

    it("applies maxItems scope", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.snapshot({ maxItems: 1 });

      expect(result.data).toHaveLength(1);
    });

    it("applies filter scope", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.snapshot({ filter: "getting" });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].relativePath).toBe("Getting-Started.md");
    });
  });

  describe("resolveRef", () => {
    it("resolves github-wiki refs to GitHub wiki URLs", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.resolveRef(
        "dogma://github-wiki/Home.md",
      );

      expect(result).toEqual({
        resolved: true,
        uri: "https://github.com/test-owner/test-repo/wiki/Home",
        label: "Home",
      });
    });

    it("strips .markdown extension from page name", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.resolveRef(
        "dogma://github-wiki/Setup.markdown",
      );

      expect(result).toEqual({
        resolved: true,
        uri: "https://github.com/test-owner/test-repo/wiki/Setup",
        label: "Setup",
      });
    });

    it("returns unresolved for non-github-wiki refs", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const result = await service.resolveRef("dogma://local/some-file.md");

      expect(result).toEqual({ resolved: false });
    });
  });

  describe("healthCheck", () => {
    it("returns available when cache dir has git repo with reachable remote", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);
      const health = await service.healthCheck();

      expect(health.status).toBe("available");
      expect(health.message).toContain("available");
    });

    it("returns available (offline) when remote is unreachable but cache exists", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(cacheDir);

      // Remove the bare repo so the remote becomes unreachable
      rmSync(bareDir, { recursive: true, force: true });

      const service = await bootstrap(cacheDir);
      const health = await service.healthCheck();

      expect(health.status).toBe("available");
      expect(health.message).toContain("offline");
    });

    it("returns unavailable when cache dir has no git repo", async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "virgil-wiki-empty-"));
      trackDir(emptyDir);

      const service = await bootstrap(emptyDir);
      const health = await service.healthCheck();

      expect(health.status).toBe("unavailable");
    });
  });

  describe("provider identity", () => {
    it("has correct kind, backendId, and capabilityId", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      const service = await bootstrap(cacheDir);

      expect(service.kind).toBe("dogma");
      expect(service.backendId).toBe("github-wiki");
      expect(service.capabilityId).toBe("dogma-github-wiki");
    });

    it("registers in the provider registry", async () => {
      const { bareDir, cacheDir } = createMockWikiRepo();
      trackDir(bareDir);
      trackDir(cacheDir);

      await bootstrap(cacheDir);

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("dogma");
      expect(providers).toHaveLength(1);
      expect(providers[0].backendId).toBe("github-wiki");
    });
  });
});
