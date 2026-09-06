import { z } from 'zod';
import type { Provider } from '../shared/provider.types.js';
import { ProviderCapability } from '../shared/provider.types.js';
import type { AdapterType, ProviderHealth } from './common.types.js';
import { AdapterTypeSchema } from './common.types.js';

export interface ProviderRegistrationConfig {
  readonly capability: ProviderCapability;
  readonly adapterType: AdapterType;
  readonly config: Readonly<Record<string, unknown>>;
}

export const ProviderRegistrationConfigSchema = z.object({
  capability: z.nativeEnum(ProviderCapability),
  adapterType: AdapterTypeSchema,
  config: z.record(z.string(), z.unknown()),
});

export type ProviderRegistrationConfigShape = z.infer<
  typeof ProviderRegistrationConfigSchema
>;

export interface AggregatedProviderHealth {
  readonly providerId: string;
  readonly capability: ProviderCapability;
  readonly health: ProviderHealth;
}

export interface ProviderRegistry {
  register<ProviderInstance extends Provider>(
    provider: ProviderInstance,
    config: ProviderRegistrationConfig,
  ): void;

  resolve<ProviderInstance extends Provider>(
    capability: ProviderCapability,
    id?: string,
  ): ProviderInstance;

  list(capability?: ProviderCapability): readonly Provider[];

  healthAll(): Promise<readonly AggregatedProviderHealth[]>;
}
