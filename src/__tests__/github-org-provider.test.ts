import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { GithubOrgConfig } from "../providers/org/github/github-org.config.js";
import { GithubOrgModule } from "../providers/org/github/github-org.module.js";
import { GithubOrgService } from "../providers/org/github/github-org.service.js";
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

describe("github org provider", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("absent env", () => {
    it("registers no provider when no VIRGIL_GITHUB_ORG_* vars set", async () => {
      delete process.env.VIRGIL_GITHUB_ORG_TOKEN;
      delete process.env.VIRGIL_GITHUB_ORG_NAME;
      delete process.env.VIRGIL_GITHUB_ORG_API_URL;
      delete process.env.VIRGIL_GITHUB_TOKEN;

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("org");
      expect(providers).toEqual([]);

      await module.close();
    });
  });

  describe("partial env", () => {
    it("throws ConfigurationError when only VIRGIL_GITHUB_ORG_NAME set", () => {
      delete process.env.VIRGIL_GITHUB_ORG_TOKEN;
      delete process.env.VIRGIL_GITHUB_TOKEN;
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      expect(() => GithubOrgModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
      expect(() => GithubOrgModule.registerIfConfigured()).toThrow(
        /VIRGIL_GITHUB_ORG_NAME requires/,
      );
    });
  });

  describe("full env + health check", () => {
    it("registers provider and marks capability available on healthy API", async () => {
      process.env.VIRGIL_GITHUB_ORG_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("org");
      expect(providers).toHaveLength(1);
      expect(providers[0]!.capabilityId).toBe("org-github");
      expect(providers[0]!.backendId).toBe("github");

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const orgCap = capabilities.find((c) => c.id === "org-github");
      expect(orgCap).toBeDefined();
      expect(orgCap!.status).toBe("available");

      await module.close();
    });

    it("marks capability degraded when health check fails", async () => {
      process.env.VIRGIL_GITHUB_ORG_TOKEN = "ghp_bad_token";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      stubFetch({}); // all requests return 404

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const orgCap = capabilities.find((c) => c.id === "org-github");
      expect(orgCap).toBeDefined();
      expect(orgCap!.status).toBe("degraded");

      await module.close();
    });
  });

  describe("snapshot", () => {
    it("returns OrgSnapshot with members mapped correctly", async () => {
      process.env.VIRGIL_GITHUB_ORG_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      const mockMembers = [
        {
          login: "octocat",
          id: 1,
          avatar_url: "https://avatars.githubusercontent.com/u/1",
          html_url: "https://github.com/octocat",
          type: "User",
          site_admin: false,
        },
        {
          login: "hubot",
          id: 2,
          avatar_url: "https://avatars.githubusercontent.com/u/2",
          html_url: "https://github.com/hubot",
          type: "User",
          site_admin: false,
        },
      ];

      stubFetch({
        "/user": { login: "test-user" },
        "/orgs/test-org/members": mockMembers,
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(GithubOrgService);
      const result = await service.snapshot({ maxItems: 30 });

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeDefined();
      expect(result.data.members).toHaveLength(2);
      expect(result.data.teamCount).toBe(1);

      const first = result.data.members[0]!;
      expect(first.ref).toBe("org://github/octocat");
      expect(first.name).toBe("octocat");
      expect(first.role).toBe("member");
      expect(first.team).toBe("test-org");

      const second = result.data.members[1]!;
      expect(second.ref).toBe("org://github/hubot");
      expect(second.name).toBe("hubot");

      await module.close();
    });
  });

  describe("resolveRef", () => {
    it("maps org://github/{login} to GitHub profile URL", async () => {
      process.env.VIRGIL_GITHUB_ORG_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(GithubOrgService);
      const result = await service.resolveRef("org://github/octocat");

      expect(result.resolved).toBe(true);
      expect(result.uri).toBe("https://github.com/octocat");
      expect(result.label).toBe("@octocat");

      await module.close();
    });

    it("returns resolved:false for non-github-org refs", async () => {
      process.env.VIRGIL_GITHUB_ORG_TOKEN = "ghp_test123";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(GithubOrgService);
      const result = await service.resolveRef("org://local/someone");

      expect(result.resolved).toBe(false);

      await module.close();
    });
  });

  describe("token fallback", () => {
    it("falls back to VIRGIL_GITHUB_TOKEN when VIRGIL_GITHUB_ORG_TOKEN not set", async () => {
      delete process.env.VIRGIL_GITHUB_ORG_TOKEN;
      process.env.VIRGIL_GITHUB_TOKEN = "ghp_fallback";
      process.env.VIRGIL_GITHUB_ORG_NAME = "test-org";

      const fetchFn = stubFetch({
        "/user": { login: "test-user" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([GithubOrgConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          GithubOrgModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("org");
      expect(providers).toHaveLength(1);

      // Verify the fallback token was used in the request
      expect(fetchFn).toHaveBeenCalled();
      const callArgs = fetchFn.mock.calls[0]!;
      const requestUrl = callArgs[0] as string;
      expect(requestUrl).toContain("api.github.com");
      const requestInit = callArgs[1] as RequestInit;
      expect(requestInit.headers).toHaveProperty(
        "Authorization",
        "Bearer ghp_fallback",
      );

      await module.close();
    });
  });
});
