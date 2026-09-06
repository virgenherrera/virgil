import { Inject, Injectable } from '@nestjs/common';
import type { KnowledgeProvider } from '../contracts/knowledge-provider.types.js';
import { KnowledgeError, KnowledgeErrorCode } from './knowledge.errors.js';
import { ConfluenceApiAdapter } from './confluence-api.adapter.js';
import { ConfluenceCdpAdapter } from './confluence-cdp.adapter.js';
import { LocalFilesystemAdapter } from './local-filesystem.adapter.js';
import {
  KnowledgeSourceConfigSchema,
  type KnowledgeSourceConfig,
} from './knowledge-source.schema.js';
import { HTTP_CLIENT, CDP_SESSION } from './knowledge.constants.js';
import type { IHttpClient } from './knowledge-http-client.js';
import type { CdpBrowserPort } from './confluence-page.pom.js';

/**
 * Config-driven factory that resolves a {@link KnowledgeProvider} adapter
 * by source type.
 *
 * Adding a new adapter = implement the interface + register a case in
 * `create()`. The factory validates the config with Zod before construction.
 */
@Injectable()
export class KnowledgeAdapterFactory {
  constructor(
    @Inject(HTTP_CLIENT) private readonly http: IHttpClient,
    @Inject(CDP_SESSION) private readonly cdp: CdpBrowserPort | null,
  ) {}

  /**
   * Creates and returns a configured (but not yet initialised) provider
   * for the given source configuration.
   *
   * @param rawConfig - Unvalidated source configuration object.
   * @returns A {@link KnowledgeProvider} ready for `initialize()`.
   * @throws {KnowledgeError} with code `UNSUPPORTED_TYPE` for unknown source types.
   */
  create(rawConfig: unknown): KnowledgeProvider {
    const config = KnowledgeSourceConfigSchema.parse(
      rawConfig,
    ) as KnowledgeSourceConfig;

    switch (config.type) {
      case 'confluence-api':
        return new ConfluenceApiAdapter(config, this.http);

      case 'confluence-cdp':
        return new ConfluenceCdpAdapter(config, this.cdp);

      case 'local-filesystem':
        return new LocalFilesystemAdapter(config);

      default:
        throw new KnowledgeError(
          KnowledgeErrorCode.UNSUPPORTED_TYPE,
          `Unsupported knowledge source type: ${(config as { type: string }).type}`,
        );
    }
  }

  /**
   * Creates and immediately initialises a knowledge provider.
   * Convenience method combining `create()` and `initialize()`.
   */
  async createAndInitialise(rawConfig: unknown): Promise<KnowledgeProvider> {
    const provider = this.create(rawConfig);
    await provider.initialize();
    return provider;
  }
}
