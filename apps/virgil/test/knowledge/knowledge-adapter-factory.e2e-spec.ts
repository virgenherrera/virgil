import { Test } from '@nestjs/testing';
import { KnowledgeAdapterFactory } from '../../src/knowledge/knowledge-adapter.factory.js';
import { ConfluenceApiAdapter } from '../../src/knowledge/confluence-api.adapter.js';
import { ConfluenceCdpAdapter } from '../../src/knowledge/confluence-cdp.adapter.js';
import { LocalFilesystemAdapter } from '../../src/knowledge/local-filesystem.adapter.js';
import { HTTP_CLIENT, CDP_SESSION } from '../../src/knowledge/knowledge.constants.js';
import { KnowledgeError, KnowledgeErrorCode } from '../../src/knowledge/knowledge.errors.js';
import type { IHttpClient } from '../../src/knowledge/knowledge-http-client.js';

describe('KnowledgeAdapterFactory', () => {
  let factory: KnowledgeAdapterFactory;
  const mockHttp: IHttpClient = { get: vi.fn() };
  const mockCdp = null;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeAdapterFactory,
        { provide: HTTP_CLIENT, useValue: mockHttp },
        { provide: CDP_SESSION, useValue: mockCdp },
      ],
    }).compile();

    factory = module.get(KnowledgeAdapterFactory);
  });

  describe('create', () => {
    it('creates ConfluenceApiAdapter for confluence-api type', () => {
      const provider = factory.create({
        type: 'confluence-api',
        baseUrl: 'https://wiki.example.com',
        email: 'user@example.com',
        apiToken: 'tok-123',
        spaceKey: 'ENG',
      });
      expect(provider).toBeInstanceOf(ConfluenceApiAdapter);
    });

    it('creates ConfluenceCdpAdapter for confluence-cdp type', () => {
      const provider = factory.create({
        type: 'confluence-cdp',
        baseUrl: 'https://wiki.example.com',
      });
      expect(provider).toBeInstanceOf(ConfluenceCdpAdapter);
    });

    it('creates LocalFilesystemAdapter for local-filesystem type', () => {
      const provider = factory.create({
        type: 'local-filesystem',
        rootPath: '/data/docs',
      });
      expect(provider).toBeInstanceOf(LocalFilesystemAdapter);
    });

    it('validates config through Zod schema', () => {
      expect(() =>
        factory.create({
          type: 'confluence-api',
          baseUrl: 'not-a-url',
          email: 'bad',
          apiToken: '',
          spaceKey: '',
        }),
      ).toThrow();
    });

    it('throws on unknown source type', () => {
      expect(() =>
        factory.create({ type: 'unknown' }),
      ).toThrow();
    });
  });

  describe('createAndInitialise', () => {
    it('creates and calls initialize on the provider', async () => {
      const mockProvider = {
        initialize: vi.fn().mockResolvedValue(undefined),
        metadata: { id: 'test', name: 'Test', version: '0.1.0', capabilities: [] },
      };
      const createSpy = vi.spyOn(factory, 'create').mockReturnValue(mockProvider as any);

      const result = await factory.createAndInitialise({
        type: 'local-filesystem',
        rootPath: '/data/docs',
      });

      expect(createSpy).toHaveBeenCalled();
      expect(mockProvider.initialize).toHaveBeenCalledOnce();
      expect(result).toBe(mockProvider);
    });
  });
});
