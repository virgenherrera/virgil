import { Injectable } from '@nestjs/common';
import { LocalRepoProvider } from './local-repo.provider.js';
import type { LocalRepoConfigEntryInput } from './repo-config.schema.js';
import { LocalRepoConfigEntrySchema } from './repo-config.schema.js';

@Injectable()
export class LocalRepoProviderFactory {
  create(config: LocalRepoConfigEntryInput): LocalRepoProvider {
    const validated = LocalRepoConfigEntrySchema.parse(config);
    return new LocalRepoProvider(validated);
  }

  async createAndInitialise(
    config: LocalRepoConfigEntryInput,
  ): Promise<LocalRepoProvider> {
    const provider = this.create(config);
    await provider.initialize();
    return provider;
  }
}
