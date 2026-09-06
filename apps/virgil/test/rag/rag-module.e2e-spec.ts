import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RagModule } from '../../src/rag/rag.module.js';
import {
  CHUNKER,
  EMBEDDING_PROVIDER,
  VECTOR_STORE,
  CODE_RETRIEVER,
} from '../../src/rag/rag.constants.js';
import type { Chunker } from '../../src/rag/ports/chunker.port.js';
import type { CodeRetriever } from '../../src/rag/ports/code-retriever.port.js';
import type { EmbeddingProvider } from '../../src/contracts/embedding-provider.types.js';
import type { VectorStore } from '../../src/contracts/vector-store.types.js';
import { LexicalSearchService } from '../../src/rag/adapters/lexical-search.service.js';
import { TextRetrieverService } from '../../src/rag/services/text-retriever.service.js';
import { HybridRetrieverService } from '../../src/rag/services/hybrid-retriever.service.js';
import { RetrievalCacheService } from '../../src/rag/services/retrieval-cache.service.js';

describe('RagModule DI wiring', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RagModule.forRoot()],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('provides CHUNKER token', () => {
    const chunker = module.get<Chunker>(CHUNKER);
    expect(chunker).toBeDefined();
    expect(typeof chunker.chunk).toBe('function');
  });

  it('provides EMBEDDING_PROVIDER token', () => {
    const provider = module.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    expect(provider).toBeDefined();
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.embedSingle).toBe('function');
  });

  it('provides VECTOR_STORE token', () => {
    const store = module.get<VectorStore>(VECTOR_STORE);
    expect(store).toBeDefined();
    expect(typeof store.upsert).toBe('function');
    expect(typeof store.search).toBe('function');
  });

  it('provides CODE_RETRIEVER token', () => {
    const retriever = module.get<CodeRetriever>(CODE_RETRIEVER);
    expect(retriever).toBeDefined();
    expect(typeof retriever.retrieveCode).toBe('function');
    expect(typeof retriever.isAvailable).toBe('function');
  });

  it('provides LexicalSearchService', () => {
    const service = module.get(LexicalSearchService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(LexicalSearchService);
  });

  it('provides TextRetrieverService', () => {
    const service = module.get(TextRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(TextRetrieverService);
  });

  it('provides HybridRetrieverService', () => {
    const service = module.get(HybridRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(HybridRetrieverService);
  });

  it('provides RetrievalCacheService', () => {
    const service = module.get(RetrievalCacheService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(RetrievalCacheService);
  });

  it('wires custom embeddingDimensions', async () => {
    const customModule = await Test.createTestingModule({
      imports: [RagModule.forRoot({ embeddingDimensions: 128 })],
    }).compile();

    const provider = customModule.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    const dims = await provider.dimensions();
    expect(dims).toBe(128);

    await customModule.close();
  });
});
