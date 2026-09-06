import { Injectable, Module } from '@nestjs/common';
import { createTimestamp } from '../shared/primitives.js';
import type { Provider, ProviderCapability } from '../shared/provider.types.js';
import { ProviderStatus } from '../shared/provider.types.js';
import type { ProviderHealth } from './common.types.js';
import { ProviderHealthStatus } from './common.types.js';
import type {
  AggregatedProviderHealth,
  ProviderRegistrationConfig,
  ProviderRegistry,
} from './provider-registry.types.js';
import { ProviderRegistrationConfigSchema } from './provider-registry.types.js';

interface RegisteredProvider {
  readonly provider: Provider;
  readonly config: ProviderRegistrationConfig;
}

/**
 * Maps the base `Provider` connection lifecycle (`ProviderStatus`) onto the
 * richer, operator-facing `ProviderHealthStatus` reported by
 * {@link ProviderRegistryService.healthAll}.
 */
export function mapProviderStatusToHealthStatus(
  status: ProviderStatus,
): ProviderHealthStatus {
  switch (status) {
    case ProviderStatus.CONNECTED:
      return ProviderHealthStatus.HEALTHY;
    case ProviderStatus.DEGRADED:
      return ProviderHealthStatus.DEGRADED;
    case ProviderStatus.REGISTERED:
    case ProviderStatus.CONFIGURED:
    case ProviderStatus.DISCONNECTED:
      return ProviderHealthStatus.UNAVAILABLE;
  }
}

/**
 * NestJS-hosted implementation of the portable {@link ProviderRegistry}
 * contract (`provider-registry.types.ts`). This is the one concrete
 * implementation in the provider-contracts module: it coordinates whichever
 * adapters are registered per capability without depending on any specific
 * adapter family (API, PW CDP browser automation, local filesystem) — see
 * `packages/cli/docs/port-adapter-architecture.md`.
 */
@Injectable()
export class ProviderRegistryService implements ProviderRegistry {
  private readonly providersByCapability = new Map<
    ProviderCapability,
    Map<string, RegisteredProvider>
  >();

  register<ProviderInstance extends Provider>(
    provider: ProviderInstance,
    config: ProviderRegistrationConfig,
  ): void {
    const validatedConfig = ProviderRegistrationConfigSchema.parse(config);
    const byId =
      this.providersByCapability.get(validatedConfig.capability) ??
      new Map<string, RegisteredProvider>();
    byId.set(provider.metadata.id, { provider, config: validatedConfig });
    this.providersByCapability.set(validatedConfig.capability, byId);
  }

  resolve<ProviderInstance extends Provider>(
    capability: ProviderCapability,
    id?: string,
  ): ProviderInstance {
    const byId = this.providersByCapability.get(capability);
    if (!byId || byId.size === 0) {
      throw new Error(`No provider registered for capability "${capability}"`);
    }

    if (id !== undefined) {
      const entry = byId.get(id);
      if (!entry) {
        throw new Error(
          `No provider registered with id "${id}" for capability "${capability}"`,
        );
      }
      return entry.provider as ProviderInstance;
    }

    const [first] = byId.values();
    return first.provider as ProviderInstance;
  }

  list(capability?: ProviderCapability): readonly Provider[] {
    if (capability !== undefined) {
      const byId = this.providersByCapability.get(capability);
      return byId ? Array.from(byId.values(), (entry) => entry.provider) : [];
    }

    return Array.from(this.providersByCapability.values()).flatMap((byId) =>
      Array.from(byId.values(), (entry) => entry.provider),
    );
  }

  async healthAll(): Promise<readonly AggregatedProviderHealth[]> {
    const results: AggregatedProviderHealth[] = [];

    for (const [capability, byId] of this.providersByCapability) {
      for (const { provider } of byId.values()) {
        const status = await provider.healthCheck();
        const health: ProviderHealth = {
          status: mapProviderStatusToHealthStatus(status),
          lastChecked: createTimestamp(),
        };
        results.push({ providerId: provider.metadata.id, capability, health });
      }
    }

    return results;
  }
}

/**
 * Hosts {@link ProviderRegistryService} as a NestJS module. Adapter modules
 * (H05, H12–H14) import this module and inject `ProviderRegistryService` to
 * register their concrete provider instances.
 */
@Module({
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class ProviderRegistryModule {}
