import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { TeamsConfig } from "../providers/chat/teams/teams.config.js";
import { TeamsModule } from "../providers/chat/teams/teams.module.js";
import { TeamsReaderService } from "../providers/chat/teams/teams-reader.service.js";
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

describe("teams provider", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("absent env", () => {
    it("registers no provider when no VIRGIL_TEAMS_* vars set", async () => {
      delete process.env.VIRGIL_TEAMS_TOKEN;
      delete process.env.VIRGIL_TEAMS_TEAM_ID;
      delete process.env.VIRGIL_TEAMS_CHANNEL_IDS;

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("chat");
      expect(providers).toEqual([]);

      await module.close();
    });
  });

  describe("partial env", () => {
    it("throws ConfigurationError when only VIRGIL_TEAMS_TOKEN set", () => {
      process.env.VIRGIL_TEAMS_TOKEN = "partial-token";
      delete process.env.VIRGIL_TEAMS_TEAM_ID;
      delete process.env.VIRGIL_TEAMS_CHANNEL_IDS;

      expect(() => TeamsModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
      expect(() => TeamsModule.registerIfConfigured()).toThrow(
        /Partial Teams configuration detected/,
      );
    });
  });

  describe("full env + health check", () => {
    it("registers provider and marks capability available on healthy API", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "test-token-123";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-1";

      stubFetch({
        "/v1.0/me": { displayName: "Test User", id: "user-id" },
        "/messages": {
          value: [],
        },
        "/channels/ch-1": {
          id: "ch-1",
          displayName: "General",
          membershipType: "standard",
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("chat");
      expect(providers).toHaveLength(1);
      expect(providers[0]!.capabilityId).toBe("chat-teams");
      expect(providers[0]!.backendId).toBe("teams");

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const teamsCap = capabilities.find((c) => c.id === "chat-teams");
      expect(teamsCap).toBeDefined();
      expect(teamsCap!.status).toBe("available");

      await module.close();
    });

    it("marks capability degraded when health check fails", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "bad-token";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-1";

      stubFetch({}); // all requests return 404

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const teamsCap = capabilities.find((c) => c.id === "chat-teams");
      expect(teamsCap).toBeDefined();
      expect(teamsCap!.status).toBe("degraded");

      await module.close();
    });
  });

  describe("snapshot", () => {
    it("returns channels and messages with correct refs", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "test-token-123";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-1";

      stubFetch({
        "/v1.0/me": { displayName: "Test User", id: "user-id" },
        "/messages": {
          value: [
            {
              id: "msg-1",
              from: { user: { displayName: "Alice" } },
              body: { content: "Hello world" },
              createdDateTime: "2024-01-15T10:00:00Z",
            },
            {
              id: "msg-2",
              from: { user: { displayName: "Bob" } },
              body: { content: "Hi there" },
              createdDateTime: "2024-01-15T11:00:00Z",
            },
          ],
        },
        "/channels/ch-1": {
          id: "ch-1",
          displayName: "General",
          membershipType: "standard",
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(TeamsReaderService);
      const result = await reader.snapshot({ maxItems: 20 });

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeDefined();
      expect(result.data.channels).toHaveLength(1);
      expect(result.data.channels[0]!.id).toBe("ch-1");
      expect(result.data.channels[0]!.name).toBe("General");

      expect(result.data.recentMessages).toHaveLength(2);

      const first = result.data.recentMessages[0]!;
      expect(first.ref).toBe("chat://teams/ch-1/msg-1");
      expect(first.channel).toBe("ch-1");
      expect(first.author).toBe("Alice");
      expect(first.text).toBe("Hello world");
      expect(first.timestamp).toBe("2024-01-15T10:00:00Z");

      const second = result.data.recentMessages[1]!;
      expect(second.ref).toBe("chat://teams/ch-1/msg-2");
      expect(second.author).toBe("Bob");
      expect(second.text).toBe("Hi there");

      await module.close();
    });

    it("handles empty channels gracefully", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "test-token-123";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-missing";

      stubFetch({
        "/v1.0/me": { displayName: "Test User", id: "user-id" },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(TeamsReaderService);
      const result = await reader.snapshot({ maxItems: 20 });

      expect(result.data.channels).toEqual([]);
      expect(result.data.recentMessages).toEqual([]);

      await module.close();
    });
  });

  describe("resolveRef", () => {
    it("resolves a teams message ref", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "test-token-123";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-1";

      stubFetch({
        "/v1.0/me": { displayName: "Test User", id: "user-id" },
        "/channels/ch-1": {
          id: "ch-1",
          displayName: "General",
          membershipType: "standard",
        },
        "/messages": { value: [] },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(TeamsReaderService);
      const result = await reader.resolveRef("chat://teams/ch-1/msg-1");

      expect(result.resolved).toBe(true);
      expect(result.uri).toBe(
        "https://teams.microsoft.com/l/message/ch-1/msg-1?tenantId=default",
      );

      await module.close();
    });

    it("returns resolved: false for non-teams refs", async () => {
      process.env.VIRGIL_TEAMS_TOKEN = "test-token-123";
      process.env.VIRGIL_TEAMS_TEAM_ID = "team-1";
      process.env.VIRGIL_TEAMS_CHANNEL_IDS = "ch-1";

      stubFetch({
        "/v1.0/me": { displayName: "Test User", id: "user-id" },
        "/channels/ch-1": {
          id: "ch-1",
          displayName: "General",
          membershipType: "standard",
        },
        "/messages": { value: [] },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([TeamsConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          TeamsModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(TeamsReaderService);
      const result = await reader.resolveRef("chat://slack/C123/1234.5678");

      expect(result.resolved).toBe(false);

      await module.close();
    });
  });
});
