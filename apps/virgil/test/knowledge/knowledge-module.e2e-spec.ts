import { Test } from '@nestjs/testing';
import { KnowledgeModule } from '../../src/knowledge/knowledge.module.js';
import { KnowledgeAdapterFactory } from '../../src/knowledge/knowledge-adapter.factory.js';
import { HTTP_CLIENT, CDP_SESSION } from '../../src/knowledge/knowledge.constants.js';
import type { IHttpClient } from '../../src/knowledge/knowledge-http-client.js';
import { ProviderRegistryService } from '../../src/contracts/provider-registry.module.js';

describe('KnowledgeModule', () => {
  it('provides KnowledgeAdapterFactory', async () => {
    const module = await Test.createTestingModule({
      imports: [KnowledgeModule],
    }).compile();

    const factory = module.get(KnowledgeAdapterFactory);
    expect(factory).toBeDefined();
    expect(factory).toBeInstanceOf(KnowledgeAdapterFactory);
  });

  it('provides HTTP_CLIENT token', async () => {
    const module = await Test.createTestingModule({
      imports: [KnowledgeModule],
    }).compile();

    const httpClient = module.get<IHttpClient>(HTTP_CLIENT);
    expect(httpClient).toBeDefined();
    expect(typeof httpClient.get).toBe('function');
  });

  it('provides CDP_SESSION token as null', async () => {
    const module = await Test.createTestingModule({
      imports: [KnowledgeModule],
    }).compile();

    const cdpSession = module.get(CDP_SESSION);
    expect(cdpSession).toBeNull();
  });

  it('provides ProviderRegistryService via ProviderRegistryModule', async () => {
    const module = await Test.createTestingModule({
      imports: [KnowledgeModule],
    }).compile();

    const registry = module.get(ProviderRegistryService);
    expect(registry).toBeDefined();
    expect(registry).toBeInstanceOf(ProviderRegistryService);
  });
});
