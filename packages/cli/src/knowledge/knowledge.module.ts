import { Module } from '@nestjs/common';
import { ProviderRegistryModule } from '../contracts/provider-registry.module.js';
import { KnowledgeAdapterFactory } from './knowledge-adapter.factory.js';
import { FetchHttpClient } from './knowledge-http-client.js';
import { HTTP_CLIENT, CDP_SESSION } from './knowledge.constants.js';

/**
 * Hosts the Knowledge provider adapters (H13): Confluence API, Confluence CDP,
 * and Local Filesystem adapters for discovering, fetching, and indexing
 * knowledge documents.
 *
 * Imports `ProviderRegistryModule` for adapter registration.
 *
 * Exports:
 * - `KnowledgeAdapterFactory` — config-driven adapter creation.
 * - `HTTP_CLIENT` — injectable HTTP client (overridable in tests).
 * - `CDP_SESSION` — injectable CDP browser port (null by default).
 */
@Module({
  imports: [ProviderRegistryModule],
  providers: [
    KnowledgeAdapterFactory,
    {
      provide: HTTP_CLIENT,
      useClass: FetchHttpClient,
    },
    {
      provide: CDP_SESSION,
      useValue: null,
    },
  ],
  exports: [KnowledgeAdapterFactory, HTTP_CLIENT, CDP_SESSION],
})
export class KnowledgeModule {}
