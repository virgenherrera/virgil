import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import { ProviderCapability } from '../shared/provider.types.js';
import type { AdapterType, ProviderHealth } from './common.types.js';
import { AdapterTypeSchema } from './common.types.js';

/**
 * Registration configuration accompanying a provider instance when it is
 * added to a {@link ProviderRegistry}.
 */
export interface ProviderRegistrationConfig {
  readonly capability: ProviderCapability;
  readonly adapterType: AdapterType;
  readonly config: Readonly<Record<string, unknown>>;
}

/** Validates the shape of a {@link ProviderRegistrationConfig}. */
export const ProviderRegistrationConfigSchema = z.object({
  capability: z.nativeEnum(ProviderCapability),
  adapterType: AdapterTypeSchema,
  config: z.record(z.string(), z.unknown()),
});

export type ProviderRegistrationConfigShape = z.infer<
  typeof ProviderRegistrationConfigSchema
>;

/** A single provider's health, attributed to its id and capability. */
export interface AggregatedProviderHealth {
  readonly providerId: string;
  readonly capability: ProviderCapability;
  readonly health: ProviderHealth;
}

/**
 * @experimental Portable contract for registering, resolving, and
 * enumerating providers within a workspace.
 *
 * Deliberately independent of NestJS DI so it can be implemented by any
 * host runtime; `ProviderRegistryModule` (in `provider-registry.module.ts`)
 * is the NestJS-hosted implementation used by the CLI.
 */
export interface ProviderRegistry {
  /** Registers `provider` under `config.capability`, validating `config` first. */
  register<ProviderInstance extends Provider>(
    provider: ProviderInstance,
    config: ProviderRegistrationConfig,
  ): void;
  /**
   * Resolves the active provider for `capability`. When `id` is given,
   * resolves that specific provider; otherwise resolves the first
   * registered provider for the capability. Throws when no match exists.
   */
  resolve<ProviderInstance extends Provider>(
    capability: ProviderCapability,
    id?: string,
  ): ProviderInstance;
  /** Lists all registered providers, optionally filtered by `capability`. */
  list(capability?: ProviderCapability): readonly Provider[];
  /** Returns aggregated health across every registered provider. */
  healthAll(): Promise<readonly AggregatedProviderHealth[]>;
}
