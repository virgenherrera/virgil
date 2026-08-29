import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { GithubIssuesConfig } from "../providers/ticket/github/github-issues.config.js";
import { GithubIssuesModule } from "../providers/ticket/github/github-issues.module.js";
import { GithubIssuesReaderService } from "../providers/ticket/github/github-issues-reader.service.js";
import { ConfigurationError } from "../shared/errors.js";

function stubFetch(responses: Record<string, unknown>) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const urlStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;
    for (const [pattern, body] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("github issues provider", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("absent env", () => {
    it("registers no provider when no VIRGIL_GITHUB_* vars set", async () => {
      delete process.env.VIRGIL_GITHUB_TOKEN;
      delete process.env.VIRGIL_GITHUB_OWNER;
      delete process.env.VIRGIL_GITHUB_REPO;
      delete process.env.VIRGIL_GITHUB_API_URL;

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("ticket");
      expect(providers).toEqual([]);

      await module.close();
    });
  });

  describe("partial env", () => {
    it("throws ConfigurationError when only VIRGIL_GITHUB_TOKEN set", () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_partial";
      delete process.env.VIRGIL_GITHUB_OWNER;
      delete process.env.VIRGIL_GITHUB_REPO;

      expect(() => GithubIssuesModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
      expect(() => GithubIssuesModule.registerIfConfigured()).toThrow(
        /Partial GitHub configuration detected/,
      );
    });

    it("throws ConfigurationError when only VIRGIL_GITHUB_OWNER set", () => {
      delete process.env.VIRGIL_GITHUB_TOKEN;
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      delete process.env.VIRGIL_GITHUB_REPO;

      expect(() => GithubIssuesModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
    });
  });

  describe("full env + health check", () => {
    it("registers provider and marks capability available on healthy API", async () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      process.env.VIRGIL_GITHUB_REPO = "test-repo";

      stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("ticket");
      expect(providers).toHaveLength(1);
      expect(providers[0]!.capabilityId).toBe("ticket-github");
      expect(providers[0]!.backendId).toBe("github");

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const githubCap = capabilities.find((c) => c.id === "ticket-github");
      expect(githubCap).toBeDefined();
      expect(githubCap!.status).toBe("available");

      await module.close();
    });

    it("marks capability degraded when health check fails", async () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_bad_token";
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      process.env.VIRGIL_GITHUB_REPO = "test-repo";

      stubFetch({}); // all requests return 404

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const githubCap = capabilities.find((c) => c.id === "ticket-github");
      expect(githubCap).toBeDefined();
      expect(githubCap!.status).toBe("degraded");

      await module.close();
    });
  });

  describe("snapshot", () => {
    it("returns issues mapped to GithubIssueBrief with correct refs", async () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      process.env.VIRGIL_GITHUB_REPO = "test-repo";

      const mockIssues = [
        {
          number: 42,
          title: "Fix login bug",
          state: "open",
          body: "Login is broken",
          html_url: "https://github.com/test-org/test-repo/issues/42",
          assignee: { login: "octocat" },
          labels: [{ name: "bug", color: "d73a4a" }],
          milestone: { number: 1, title: "v1.0", state: "open" },
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-16T12:00:00Z",
          closed_at: null,
          comments: 3,
        },
        {
          number: 43,
          title: "Add dark mode",
          state: "open",
          body: null,
          html_url: "https://github.com/test-org/test-repo/issues/43",
          assignee: null,
          labels: [],
          milestone: null,
          created_at: "2024-01-17T08:00:00Z",
          updated_at: "2024-01-17T08:00:00Z",
          closed_at: null,
          comments: 0,
        },
      ];

      stubFetch({
        "/user": { login: "test-user" },
        "/repos/test-org/test-repo/issues": mockIssues,
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(GithubIssuesReaderService);
      const result = await reader.snapshot({ maxItems: 30 });

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeDefined();
      expect(result.data.owner).toBe("test-org");
      expect(result.data.repo).toBe("test-repo");
      expect(result.data.issues).toHaveLength(2);

      const first = result.data.issues[0]!;
      expect(first.ref).toBe("ticket://github/42");
      expect(first.number).toBe(42);
      expect(first.title).toBe("Fix login bug");
      expect(first.state).toBe("open");
      expect(first.assignee).toBe("octocat");
      expect(first.labels).toEqual([{ name: "bug", color: "d73a4a" }]);
      expect(first.milestone).toEqual({
        number: 1,
        title: "v1.0",
        state: "open",
      });
      expect(first.createdAt).toBe("2024-01-15T10:00:00Z");

      const second = result.data.issues[1]!;
      expect(second.ref).toBe("ticket://github/43");
      expect(second.assignee).toBeNull();
      expect(second.labels).toEqual([]);
      expect(second.milestone).toBeNull();

      await module.close();
    });
  });

  describe("resolveRef", () => {
    it("resolves a github issue ref to html_url and label", async () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      process.env.VIRGIL_GITHUB_REPO = "test-repo";

      stubFetch({
        "/user": { login: "test-user" },
        "/repos/test-org/test-repo/issues/42": {
          number: 42,
          title: "Fix login bug",
          state: "open",
          body: "Login is broken",
          html_url: "https://github.com/test-org/test-repo/issues/42",
          assignee: { login: "octocat" },
          labels: [{ name: "bug", color: "d73a4a" }],
          milestone: null,
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-16T12:00:00Z",
          closed_at: null,
          comments: 3,
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(GithubIssuesReaderService);
      const result = await reader.resolveRef("ticket://github/42");

      expect(result.resolved).toBe(true);
      expect(result.uri).toBe(
        "https://github.com/test-org/test-repo/issues/42",
      );
      expect(result.label).toBe("#42: Fix login bug");

      await module.close();
    });

    it("returns resolved: false for non-github refs", async () => {
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_OWNER = "test-org";
      process.env.VIRGIL_GITHUB_REPO = "test-repo";

      stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubIssuesConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubIssuesModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(GithubIssuesReaderService);
      const result = await reader.resolveRef("ticket://jira/PROJ-1");

      expect(result.resolved).toBe(false);

      await module.close();
    });
  });
});
