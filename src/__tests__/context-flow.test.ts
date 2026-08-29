import { Test, type TestingModule } from "@nestjs/testing";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { RefResolverModule } from "../domain/ref-resolver.module.js";
import { RefResolverService } from "../domain/ref-resolver.service.js";
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
