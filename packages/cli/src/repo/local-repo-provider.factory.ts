import { Injectable } from '@nestjs/common';
import { LocalRepoProvider } from './local-repo.provider.js';
import type { LocalRepoConfigEntryInput } from './repo-config.schema.js';
import { LocalRepoConfigEntrySchema } from './repo-config.schema.js';

/**
 * NestJS-injectable factory that creates and initialises
 * `LocalRepoProvider` instances from validated configuration entries.
 *
 * This factory is the DI entry point for consuming modules: inject it,
 * call `create()` with a configuration entry, and receive an initialised
 * provider ready for use.
 */
@Injectable()
export class LocalRepoProviderFactory {
  /**
   * Creates a `LocalRepoProvider` from a raw configuration entry.
   * The configuration is validated through the Zod schema before the
   * provider is returned. Call `initialize()` on the returned provider
   * before using repository operations.
   */
  create(config: LocalRepoConfigEntryInput): LocalRepoProvider {
    const validated = LocalRepoConfigEntrySchema.parse(config);
    return new LocalRepoProvider(validated);
  }

  /**
   * Creates and immediately initialises a `LocalRepoProvider`.
   * Convenience method that combines `create()` and `initialize()`.
   */
  async createAndInitialise(
    config: LocalRepoConfigEntryInput,
  ): Promise<LocalRepoProvider> {
    const provider = this.create(config);
    await provider.initialize();
    return provider;
  }
}
