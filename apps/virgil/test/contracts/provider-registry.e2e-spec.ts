import { Test } from '@nestjs/testing';
import {
  ProviderRegistryService,
  mapProviderStatusToHealthStatus,
  ProviderRegistryModule,
} from '../../src/contracts/provider-registry.module.js';
import { AdapterType } from '../../src/contracts/common.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { ProviderRegistrationConfig } from '../../src/contracts/provider-registry.types.js';
import type {
  Provider,
  ProviderMetadata,
} from '../../src/shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../../src/shared/provider.types.js';
import type { SemVer } from '../../src/shared/primitives.js';

function createMockProvider(
  id: string,
  capabilities: ProviderCapability[],
  healthStatus: ProviderStatus = ProviderStatus.CONNECTED,
): Provider {
  return {
    metadata: {
      id,
      name: `Mock ${id}`,
      version: '1.0.0' as SemVer,
      capabilities,
    } satisfies ProviderMetadata,
    status: healthStatus,
    initialize: async () => {},
    healthCheck: async () => healthStatus,
    dispose: async () => {},
  };
}

describe('ProviderRegistryService', () => {
  let service: ProviderRegistryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProviderRegistryModule],
    }).compile();

    service = moduleRef.get(ProviderRegistryService);
  });

  describe('register', () => {
    it('validates and stores a provider', () => {
      const provider = createMockProvider('gh-1', [ProviderCapability.ISSUE]);
      const config: ProviderRegistrationConfig = {
        capability: ProviderCapability.ISSUE,
        adapterType: AdapterType.API,
        config: { token: 'xxx' },
      };

      expect(() => service.register(provider, config)).not.toThrow();

      const resolved = service.resolve(ProviderCapability.ISSUE);
      expect(resolved.metadata.id).toBe('gh-1');
    });

    it('rejects invalid config via Zod', () => {
      const provider = createMockProvider('bad-1', [ProviderCapability.CHAT]);
      const invalidConfig = {
        capability: 'not_a_capability',
        adapterType: AdapterType.API,
        config: {},
      } as unknown as ProviderRegistrationConfig;

      expect(() => service.register(provider, invalidConfig)).toThrow();
    });

    it('allows multiple providers for the same capability', () => {
      const p1 = createMockProvider('gh-1', [ProviderCapability.ISSUE]);
      const p2 = createMockProvider('jira-1', [ProviderCapability.ISSUE]);
      const config = (id: string): ProviderRegistrationConfig => ({
        capability: ProviderCapability.ISSUE,
        adapterType: AdapterType.API,
        config: { id },
      });

      service.register(p1, config('gh-1'));
      service.register(p2, config('jira-1'));

      const all = service.list(ProviderCapability.ISSUE);
      expect(all).toHaveLength(2);
    });
  });

  describe('resolve', () => {
    it('resolves the first provider for a capability', () => {
      const provider = createMockProvider('slack-1', [
        ProviderCapability.CHAT,
      ]);
      service.register(provider, {
        capability: ProviderCapability.CHAT,
        adapterType: AdapterType.API,
        config: {},
      });

      const resolved = service.resolve(ProviderCapability.CHAT);
      expect(resolved.metadata.id).toBe('slack-1');
    });

    it('resolves a specific provider by capability and id', () => {
      const p1 = createMockProvider('gh-1', [ProviderCapability.ISSUE]);
      const p2 = createMockProvider('jira-1', [ProviderCapability.ISSUE]);
      const config: ProviderRegistrationConfig = {
        capability: ProviderCapability.ISSUE,
        adapterType: AdapterType.API,
        config: {},
      };

      service.register(p1, config);
      service.register(p2, config);

      const resolved = service.resolve(ProviderCapability.ISSUE, 'jira-1');
      expect(resolved.metadata.id).toBe('jira-1');
    });

    it('throws when no provider exists for a capability', () => {
      expect(() => service.resolve(ProviderCapability.EMBEDDING)).toThrow(
        /no provider registered for capability "embedding"/i,
      );
    });

    it('throws when no provider exists with the given id', () => {
      const provider = createMockProvider('gh-1', [ProviderCapability.ISSUE]);
      service.register(provider, {
        capability: ProviderCapability.ISSUE,
        adapterType: AdapterType.API,
        config: {},
      });

      expect(() =>
        service.resolve(ProviderCapability.ISSUE, 'nonexistent'),
      ).toThrow(/no provider registered with id "nonexistent"/i);
    });
  });

  describe('list', () => {
    it('returns all providers when no capability filter is given', () => {
      service.register(
        createMockProvider('gh-1', [ProviderCapability.ISSUE]),
        {
          capability: ProviderCapability.ISSUE,
          adapterType: AdapterType.API,
          config: {},
        },
      );
      service.register(
        createMockProvider('slack-1', [ProviderCapability.CHAT]),
        {
          capability: ProviderCapability.CHAT,
          adapterType: AdapterType.API,
          config: {},
        },
      );

      const all = service.list();
      expect(all).toHaveLength(2);
    });

    it('returns only providers matching the capability filter', () => {
      service.register(
        createMockProvider('gh-1', [ProviderCapability.ISSUE]),
        {
          capability: ProviderCapability.ISSUE,
          adapterType: AdapterType.API,
          config: {},
        },
      );
      service.register(
        createMockProvider('slack-1', [ProviderCapability.CHAT]),
        {
          capability: ProviderCapability.CHAT,
          adapterType: AdapterType.API,
          config: {},
        },
      );

      const issues = service.list(ProviderCapability.ISSUE);
      expect(issues).toHaveLength(1);
      expect(issues[0].metadata.id).toBe('gh-1');
    });

    it('returns empty array for unregistered capability', () => {
      expect(service.list(ProviderCapability.RETRIEVER)).toEqual([]);
    });
  });

  describe('healthAll', () => {
    it('maps ProviderStatus to ProviderHealthStatus for each provider', async () => {
      service.register(
        createMockProvider(
          'healthy-1',
          [ProviderCapability.KNOWLEDGE],
          ProviderStatus.CONNECTED,
        ),
        {
          capability: ProviderCapability.KNOWLEDGE,
          adapterType: AdapterType.FILESYSTEM,
          config: {},
        },
      );
      service.register(
        createMockProvider(
          'degraded-1',
          [ProviderCapability.CHAT],
          ProviderStatus.DEGRADED,
        ),
        {
          capability: ProviderCapability.CHAT,
          adapterType: AdapterType.API,
          config: {},
        },
      );
      service.register(
        createMockProvider(
          'disconnected-1',
          [ProviderCapability.ISSUE],
          ProviderStatus.DISCONNECTED,
        ),
        {
          capability: ProviderCapability.ISSUE,
          adapterType: AdapterType.API,
          config: {},
        },
      );

      const results = await service.healthAll();

      expect(results).toHaveLength(3);

      const healthy = results.find((r) => r.providerId === 'healthy-1');
      expect(healthy?.health.status).toBe(ProviderHealthStatus.HEALTHY);

      const degraded = results.find((r) => r.providerId === 'degraded-1');
      expect(degraded?.health.status).toBe(ProviderHealthStatus.DEGRADED);

      const disconnected = results.find(
        (r) => r.providerId === 'disconnected-1',
      );
      expect(disconnected?.health.status).toBe(
        ProviderHealthStatus.UNAVAILABLE,
      );
    });

    it('returns empty array when no providers are registered', async () => {
      const results = await service.healthAll();
      expect(results).toEqual([]);
    });

    it('includes capability and lastChecked in health results', async () => {
      service.register(
        createMockProvider('p-1', [ProviderCapability.EMBEDDING]),
        {
          capability: ProviderCapability.EMBEDDING,
          adapterType: AdapterType.API,
          config: {},
        },
      );

      const results = await service.healthAll();
      expect(results[0].capability).toBe(ProviderCapability.EMBEDDING);
      expect(results[0].health.lastChecked).toBeGreaterThan(0);
    });
  });
});

describe('mapProviderStatusToHealthStatus', () => {
  it('maps CONNECTED to HEALTHY', () => {
    expect(mapProviderStatusToHealthStatus(ProviderStatus.CONNECTED)).toBe(
      ProviderHealthStatus.HEALTHY,
    );
  });

  it('maps DEGRADED to DEGRADED', () => {
    expect(mapProviderStatusToHealthStatus(ProviderStatus.DEGRADED)).toBe(
      ProviderHealthStatus.DEGRADED,
    );
  });

  it('maps REGISTERED to UNAVAILABLE', () => {
    expect(mapProviderStatusToHealthStatus(ProviderStatus.REGISTERED)).toBe(
      ProviderHealthStatus.UNAVAILABLE,
    );
  });

  it('maps CONFIGURED to UNAVAILABLE', () => {
    expect(mapProviderStatusToHealthStatus(ProviderStatus.CONFIGURED)).toBe(
      ProviderHealthStatus.UNAVAILABLE,
    );
  });

  it('maps DISCONNECTED to UNAVAILABLE', () => {
    expect(mapProviderStatusToHealthStatus(ProviderStatus.DISCONNECTED)).toBe(
      ProviderHealthStatus.UNAVAILABLE,
    );
  });
});
