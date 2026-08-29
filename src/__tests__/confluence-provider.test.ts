import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { ConfluenceConfig } from "../providers/dogma/confluence/confluence.config.js";
import { ConfluenceModule } from "../providers/dogma/confluence/confluence.module.js";
import { ConfluenceService } from "../providers/dogma/confluence/confluence.service.js";
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

describe("confluence provider", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("absent env", () => {
    it("registers no provider when no VIRGIL_CONFLUENCE_* vars set", async () => {
      delete process.env.VIRGIL_CONFLUENCE_SITE_URL;
      delete process.env.VIRGIL_CONFLUENCE_EMAIL;
      delete process.env.VIRGIL_CONFLUENCE_API_TOKEN;
      delete process.env.VIRGIL_CONFLUENCE_SPACE_KEY;

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("dogma");
      expect(providers).toEqual([]);

      await module.close();
    });
  });

  describe("partial env", () => {
    it("throws ConfigurationError when only VIRGIL_CONFLUENCE_SITE_URL set", () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      delete process.env.VIRGIL_CONFLUENCE_EMAIL;
      delete process.env.VIRGIL_CONFLUENCE_API_TOKEN;

      expect(() => ConfluenceModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
      expect(() => ConfluenceModule.registerIfConfigured()).toThrow(
        /Partial Confluence configuration detected/,
      );
    });

    it("throws ConfigurationError when only VIRGIL_CONFLUENCE_EMAIL set", () => {
      delete process.env.VIRGIL_CONFLUENCE_SITE_URL;
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      delete process.env.VIRGIL_CONFLUENCE_API_TOKEN;

      expect(() => ConfluenceModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
    });
  });

  describe("full env + health check", () => {
    it("registers provider and marks capability available on healthy API", async () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      process.env.VIRGIL_CONFLUENCE_API_TOKEN = "test-token-123";

      stubFetch({
        "/wiki/rest/api/user/current": { accountId: "abc123", displayName: "Test User" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("dogma");
      expect(providers).toHaveLength(1);
      expect(providers[0]!.capabilityId).toBe("dogma-confluence");
      expect(providers[0]!.backendId).toBe("confluence");

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const confluenceCap = capabilities.find((c) => c.id === "dogma-confluence");
      expect(confluenceCap).toBeDefined();
      expect(confluenceCap!.status).toBe("available");

      await module.close();
    });

    it("marks capability degraded when health check fails", async () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      process.env.VIRGIL_CONFLUENCE_API_TOKEN = "bad-token";

      stubFetch({}); // all requests return 404

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const confluenceCap = capabilities.find((c) => c.id === "dogma-confluence");
      expect(confluenceCap).toBeDefined();
      expect(confluenceCap!.status).toBe("degraded");

      await module.close();
    });
  });

  describe("snapshot", () => {
    it("returns DogmaDocument[] with correct refs", async () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      process.env.VIRGIL_CONFLUENCE_API_TOKEN = "test-token-123";

      const mockPages = {
        results: [
          {
            id: "12345",
            title: "Architecture Overview",
            body: {
              storage: {
                value: "<p>This is the <strong>architecture</strong> overview.</p>",
              },
            },
            version: { when: "2024-06-15T10:00:00.000Z" },
          },
          {
            id: "67890",
            title: "API Guidelines",
            body: {
              storage: {
                value: "<h1>API Guidelines</h1><ul><li>Use REST</li><li>Use JSON</li></ul>",
              },
            },
            version: { when: "2024-07-01T14:30:00.000Z" },
          },
        ],
      };

      stubFetch({
        "/wiki/rest/api/user/current": { accountId: "abc123" },
        "/wiki/rest/api/content": mockPages,
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(ConfluenceService);
      const result = await service.snapshot({ maxItems: 30 });

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeDefined();
      expect(result.data).toHaveLength(2);

      const first = result.data[0]!;
      expect(first.ref).toBe("dogma://confluence/12345");
      expect(first.relativePath).toBe("Architecture Overview");
      expect(first.content).toBe("This is the architecture overview.");
      expect(first.size).toBe(
        "<p>This is the <strong>architecture</strong> overview.</p>".length,
      );
      expect(first.modifiedAt).toBe("2024-06-15T10:00:00.000Z");

      const second = result.data[1]!;
      expect(second.ref).toBe("dogma://confluence/67890");
      expect(second.relativePath).toBe("API Guidelines");

      await module.close();
    });
  });

  describe("resolveRef", () => {
    it("maps dogma://confluence/{pageId} to Confluence web URL", async () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      process.env.VIRGIL_CONFLUENCE_API_TOKEN = "test-token-123";

      stubFetch({
        "/wiki/rest/api/user/current": { accountId: "abc123" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(ConfluenceService);
      const result = await service.resolveRef("dogma://confluence/12345");

      expect(result.resolved).toBe(true);
      expect(result.uri).toBe(
        "https://mysite.atlassian.net/wiki/pages/12345",
      );
      expect(result.label).toBe("Confluence page 12345");

      await module.close();
    });

    it("returns resolved:false for non-confluence refs", async () => {
      process.env.VIRGIL_CONFLUENCE_SITE_URL = "https://mysite.atlassian.net";
      process.env.VIRGIL_CONFLUENCE_EMAIL = "user@example.com";
      process.env.VIRGIL_CONFLUENCE_API_TOKEN = "test-token-123";

      stubFetch({
        "/wiki/rest/api/user/current": { accountId: "abc123" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([ConfluenceConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ConfluenceModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const service = module.get(ConfluenceService);
      const result = await service.resolveRef("dogma://local/README.md");

      expect(result.resolved).toBe(false);

      await module.close();
    });
  });
});
