import { Test, type TestingModule } from "@nestjs/testing";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { ProviderRegistryService } from "../providers/provider-registry.service.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import type {
  ContextProviderPort,
  ProviderHealth,
  RefResolution,
} from "../ports/context-provider.port.js";
import type { ProviderKind } from "../domain/refs.js";

function createTestProvider(
  kind: ProviderKind,
  backendId: string,
  capabilityId: string,
): ContextProviderPort {
  return {
    kind,
    backendId,
    capabilityId,
    async healthCheck(): Promise<ProviderHealth> {
      return { status: "available" };
    },
    async resolveRef(_ref: string): Promise<RefResolution> {
      return { resolved: false };
    },
  };
}

describe("provider registry", () => {
  let module: TestingModule;
  let registry: ProviderRegistryService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CapabilityRegistryModule, ProviderRegistryModule],
    }).compile();

    registry = module.get(ProviderRegistryService);
  });

  afterEach(async () => {
    await module.close();
  });

  it("starts with zero providers when no env vars set", () => {
    const all = registry.getAll();

    expect(all).toEqual([]);
  });

  it("returns empty array for getByKind with no providers", () => {
    const result = registry.getByKind("ticket");

    expect(result).toEqual([]);
  });

  it("registers a provider and retrieves it by kind", () => {
    const provider = createTestProvider("ticket", "test-jira", "ticket:jira");
    registry.register(provider);

    const result = registry.getByKind("ticket");

    expect(result).toHaveLength(1);
    expect(result[0]!.capabilityId).toBe("ticket:jira");
  });

  it("retrieves provider by capability id", () => {
    const provider = createTestProvider("org", "test-org", "org:local");
    registry.register(provider);

    const result = registry.getByCapabilityId("org:local");

    expect(result).toBeDefined();
    expect(result!.kind).toBe("org");
    expect(result!.backendId).toBe("test-org");
  });

  it("health check all returns empty map with no providers", async () => {
    const result = await registry.healthCheckAll();

    expect(result.size).toBe(0);
  });
});
