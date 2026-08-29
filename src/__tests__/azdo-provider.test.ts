import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppConfigModule } from "../config/app-config.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { CapabilityRegistryService } from "../capabilities/capability-registry.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { AzdoConfig } from "../providers/ticket/azdo/azdo.config.js";
import { AzdoModule } from "../providers/ticket/azdo/azdo.module.js";
import { AzdoReaderService } from "../providers/ticket/azdo/azdo-reader.service.js";
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

describe("azdo provider", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("absent env", () => {
    it("registers no provider when no VIRGIL_AZDO_* vars set", async () => {
      delete process.env.VIRGIL_AZDO_ORG_URL;
      delete process.env.VIRGIL_AZDO_PROJECT;
      delete process.env.VIRGIL_AZDO_PAT;

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
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
    it("throws ConfigurationError when only VIRGIL_AZDO_PAT set", () => {
      process.env.VIRGIL_AZDO_PAT = "partial-pat";
      delete process.env.VIRGIL_AZDO_ORG_URL;
      delete process.env.VIRGIL_AZDO_PROJECT;

      expect(() => AzdoModule.registerIfConfigured()).toThrow(
        ConfigurationError,
      );
      expect(() => AzdoModule.registerIfConfigured()).toThrow(
        /Partial Azure DevOps configuration detected/,
      );
    });
  });

  describe("full env + health check", () => {
    it("registers provider and marks capability available on healthy API", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "test-pat-123";

      stubFetch({
        "/_apis/projects/test-project": {
          id: "proj-id",
          name: "test-project",
          state: "wellFormed",
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const registry = module.get(ProviderRegistryService);
      const providers = registry.getByKind("ticket");
      expect(providers).toHaveLength(1);
      expect(providers[0]!.capabilityId).toBe("ticket-azdo");
      expect(providers[0]!.backendId).toBe("azdo");

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const azdoCap = capabilities.find((c) => c.id === "ticket-azdo");
      expect(azdoCap).toBeDefined();
      expect(azdoCap!.status).toBe("available");

      await module.close();
    });

    it("marks capability degraded when health check fails", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "bad-pat";

      stubFetch({}); // all requests return 404

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const capabilityRegistry = module.get(CapabilityRegistryService);
      const capabilities = capabilityRegistry.list();
      const azdoCap = capabilities.find((c) => c.id === "ticket-azdo");
      expect(azdoCap).toBeDefined();
      expect(azdoCap!.status).toBe("degraded");

      await module.close();
    });
  });

  describe("snapshot", () => {
    it("returns work items with correct refs", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "test-pat-123";

      stubFetch({
        "/_apis/projects/test-project": {
          id: "proj-id",
          name: "test-project",
          state: "wellFormed",
        },
        "/wit/wiql": {
          workItems: [{ id: 42, url: "" }, { id: 43, url: "" }],
        },
        "/wit/workitems": {
          count: 2,
          value: [
            {
              id: 42,
              fields: {
                "System.Title": "Fix login bug",
                "System.State": "Active",
                "System.AssignedTo": { displayName: "Alice" },
                "System.WorkItemType": "Bug",
                "System.AreaPath": "test-project\\Web",
                "System.IterationPath": "test-project\\Sprint 1",
                "System.CreatedDate": "2024-01-15T10:00:00Z",
                "System.ChangedDate": "2024-01-16T12:00:00Z",
              },
            },
            {
              id: 43,
              fields: {
                "System.Title": "Add dark mode",
                "System.State": "New",
                "System.AssignedTo": null,
                "System.WorkItemType": "User Story",
                "System.AreaPath": "test-project",
                "System.IterationPath": "test-project\\Sprint 2",
                "System.CreatedDate": "2024-01-17T08:00:00Z",
                "System.ChangedDate": "2024-01-17T08:00:00Z",
              },
            },
          ],
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(AzdoReaderService);
      const result = await reader.snapshot({ maxItems: 30 });

      expect(result.schemaVersion).toBe("1.0.0");
      expect(result.generatedAt).toBeDefined();
      expect(result.data.orgUrl).toBe("https://dev.azure.com/test-org");
      expect(result.data.project).toBe("test-project");
      expect(result.data.workItems).toHaveLength(2);

      const first = result.data.workItems[0]!;
      expect(first.ref).toBe("ticket://azdo/42");
      expect(first.id).toBe(42);
      expect(first.title).toBe("Fix login bug");
      expect(first.state).toBe("Active");
      expect(first.assignedTo).toBe("Alice");
      expect(first.workItemType).toBe("Bug");
      expect(first.areaPath).toBe("test-project\\Web");
      expect(first.iterationPath).toBe("test-project\\Sprint 1");
      expect(first.createdDate).toBe("2024-01-15T10:00:00Z");
      expect(first.changedDate).toBe("2024-01-16T12:00:00Z");

      const second = result.data.workItems[1]!;
      expect(second.ref).toBe("ticket://azdo/43");
      expect(second.assignedTo).toBeNull();
      expect(second.workItemType).toBe("User Story");

      await module.close();
    });

    it("handles empty WIQL result", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "test-pat-123";

      stubFetch({
        "/_apis/projects/test-project": {
          id: "proj-id",
          name: "test-project",
          state: "wellFormed",
        },
        "/wit/wiql": {
          workItems: [],
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(AzdoReaderService);
      const result = await reader.snapshot({ maxItems: 30 });

      expect(result.data.workItems).toEqual([]);

      await module.close();
    });
  });

  describe("resolveRef", () => {
    it("resolves an azdo work item ref", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "test-pat-123";

      stubFetch({
        "/_apis/projects/test-project": {
          id: "proj-id",
          name: "test-project",
          state: "wellFormed",
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(AzdoReaderService);
      const result = await reader.resolveRef("ticket://azdo/42");

      expect(result.resolved).toBe(true);
      expect(result.uri).toBe(
        "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
      );

      await module.close();
    });

    it("returns resolved: false for non-azdo refs", async () => {
      process.env.VIRGIL_AZDO_ORG_URL = "https://dev.azure.com/test-org";
      process.env.VIRGIL_AZDO_PROJECT = "test-project";
      process.env.VIRGIL_AZDO_PAT = "test-pat-123";

      stubFetch({
        "/_apis/projects/test-project": {
          id: "proj-id",
          name: "test-project",
          state: "wellFormed",
        },
      });

      const module = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot([AzdoConfig]),
          CapabilityRegistryModule,
          ProviderRegistryModule,
          AzdoModule.registerIfConfigured(),
        ],
      }).compile();

      await module.init();

      const reader = module.get(AzdoReaderService);
      const result = await reader.resolveRef("ticket://github/42");

      expect(result.resolved).toBe(false);

      await module.close();
    });
  });
});
