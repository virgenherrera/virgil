import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdapterType,
  ProviderMetadataSchema,
  ProviderRegistryModule,
  ProviderRegistryService,
} from '../src/contracts/index.js';
import type { KnowledgeDocument, KnowledgeProvider } from '../src/contracts/index.js';
import type { DiscoveryScope, PaginatedResult } from '../src/contracts/index.js';
import type { ProviderHealth } from '../src/contracts/index.js';
import { ProviderHealthStatus } from '../src/contracts/index.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../src/shared/provider.types.js';
import { createTimestamp } from '../src/shared/primitives.js';
import type { SemVer } from '../src/shared/primitives.js';

/**
 * Minimal in-memory `KnowledgeProvider` adapter, standing in for a real
 * vendor adapter, used to prove the DI-hosted `ProviderRegistry` contract
 * end-to-end through the NestJS container. `status` is configurable so a
 * fleet of mocks can exercise every `ProviderStatus` -> `ProviderHealthStatus`
 * mapping via `ProviderRegistryService.healthAll()`.
 */
class MockKnowledgeProvider implements KnowledgeProvider {
  readonly metadata: KnowledgeProvider['metadata'];

  constructor(
    id: string,
    public status: ProviderStatus,
  ) {
    this.metadata = {
      id,
      name: `Mock Knowledge Provider (${id})`,
      version: '1.0.0' as SemVer,
      capabilities: [ProviderCapability.KNOWLEDGE],
    };
  }

  async initialize(): Promise<void> {
    this.status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.status;
  }

  async dispose(): Promise<void> {
    this.status = ProviderStatus.DISCONNECTED;
  }

  async discover(
    _scope: DiscoveryScope,
  ): Promise<PaginatedResult<KnowledgeDocument>> {
    return { items: [], hasMore: false };
  }

  async fetch(): Promise<KnowledgeDocument> {
    throw new Error('not implemented in mock');
  }

  async list(): Promise<PaginatedResult<KnowledgeDocument>> {
    return { items: [], hasMore: false };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      lastChecked: createTimestamp(),
    };
  }
}

/**
 * Stand-in for an adapter module's registrar: injects the DI-hosted
 * `ProviderRegistryService` and registers provider instances against it,
 * mirroring how H05/H12–H14 adapter modules are expected to wire up.
 */
@Injectable()
class MockProviderRegistrar {
  readonly primary = new MockKnowledgeProvider(
    'mock-knowledge-provider',
    ProviderStatus.CONNECTED,
  );

  constructor(private readonly registry: ProviderRegistryService) {}

  register(): void {
    this.registry.register(this.primary, {
      capability: ProviderCapability.KNOWLEDGE,
      adapterType: AdapterType.API,
      config: {},
    });
  }

  registerWithStatus(id: string, status: ProviderStatus): MockKnowledgeProvider {
    const provider = new MockKnowledgeProvider(id, status);
    this.registry.register(provider, {
      capability: ProviderCapability.KNOWLEDGE,
      adapterType: AdapterType.API,
      config: {},
    });
    return provider;
  }
}

@Module({
  imports: [ProviderRegistryModule],
  providers: [MockProviderRegistrar],
  exports: [MockProviderRegistrar],
})
class MockAdapterModule {}

describe('ProviderRegistry contract (e2e)', () => {
  let moduleRef: TestingModule;
  let registry: ProviderRegistryService;
  let registrar: MockProviderRegistrar;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [MockAdapterModule],
    }).compile();

    registry = moduleRef.get(ProviderRegistryService);
    registrar = moduleRef.get(MockProviderRegistrar);
    registrar.register();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('resolves ProviderRegistryService through the DI container', () => {
    expect(registry).toBeInstanceOf(ProviderRegistryService);
  });

  it("validates a registered provider's metadata against ProviderMetadataSchema", () => {
    const parsed = ProviderMetadataSchema.parse(registrar.primary.metadata);

    expect(parsed.id).toBe(registrar.primary.metadata.id);
    expect(parsed.version).toBe('1.0.0');
  });

  it('discovers a provider registered by an injected adapter module through list()', () => {
    const providers = registry.list(ProviderCapability.KNOWLEDGE);

    expect(providers).toHaveLength(1);
    expect(providers[0]).toBe(registrar.primary);
  });

  it('lists every registered provider across capabilities when called without one', () => {
    registrar.registerWithStatus('mock-repo-provider', ProviderStatus.DEGRADED);

    expect(registry.list()).toHaveLength(2);
  });

  it('returns an empty list for a capability with no registered providers', () => {
    expect(registry.list(ProviderCapability.CHAT)).toEqual([]);
  });

  it('resolves the registered provider by capability', () => {
    const resolved = registry.resolve<KnowledgeProvider>(
      ProviderCapability.KNOWLEDGE,
    );

    expect(resolved).toBe(registrar.primary);
  });

  it('resolves the registered provider by capability and explicit id', () => {
    const resolved = registry.resolve<KnowledgeProvider>(
      ProviderCapability.KNOWLEDGE,
      registrar.primary.metadata.id,
    );

    expect(resolved).toBe(registrar.primary);
  });

  it('throws when resolving an unregistered capability', () => {
    expect(() => registry.resolve(ProviderCapability.CHAT)).toThrow(
      /No provider registered for capability/,
    );
  });

  it('throws when resolving an unregistered id under a known capability', () => {
    expect(() =>
      registry.resolve(ProviderCapability.KNOWLEDGE, 'does-not-exist'),
    ).toThrow(/No provider registered with id/);
  });

  it('aggregates health across every registered provider', async () => {
    const health = await registry.healthAll();

    expect(health).toEqual([
      {
        providerId: registrar.primary.metadata.id,
        capability: ProviderCapability.KNOWLEDGE,
        health: {
          status: ProviderHealthStatus.HEALTHY,
          lastChecked: expect.any(Number),
        },
      },
    ]);
  });

  it.each([
    [ProviderStatus.CONNECTED, ProviderHealthStatus.HEALTHY],
    [ProviderStatus.DEGRADED, ProviderHealthStatus.DEGRADED],
    [ProviderStatus.REGISTERED, ProviderHealthStatus.UNAVAILABLE],
    [ProviderStatus.CONFIGURED, ProviderHealthStatus.UNAVAILABLE],
    [ProviderStatus.DISCONNECTED, ProviderHealthStatus.UNAVAILABLE],
  ])(
    'maps ProviderStatus.%s to ProviderHealthStatus.%s through healthAll()',
    async (status, expectedHealthStatus) => {
      const provider = registrar.registerWithStatus(`mock-${status}`, status);

      const health = await registry.healthAll();
      const entry = health.find((h) => h.providerId === provider.metadata.id);

      expect(entry?.health.status).toBe(expectedHealthStatus);
    },
  );
});
