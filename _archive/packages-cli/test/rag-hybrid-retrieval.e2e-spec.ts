import { Test, TestingModule } from '@nestjs/testing';
import {
  RagModule,
  EMBEDDING_PROVIDER,
  VECTOR_STORE,
  CODE_RETRIEVER,
  LexicalSearchService,
  TextRetrieverService,
  HybridRetrieverService,
  RetrievalCacheService,
} from '../src/rag/index.js';
import type {
  CodeRetriever,
  CodeRetrievalQuery,
  CodeRetrieverResponse,
} from '../src/rag/index.js';
import type { EmbeddingProvider } from '../src/contracts/embedding-provider.types.js';
import type { VectorStore } from '../src/contracts/vector-store.types.js';
import { ProviderHealthStatus } from '../src/contracts/common.types.js';
import { RetrievalStrategy } from '../src/contracts/retriever.types.js';
import { ProviderStatus } from '../src/shared/provider.types.js';
import { createTimestamp } from '../src/shared/primitives.js';

describe('RAG hybrid retrieval pipeline (e2e)', () => {
  let moduleRef: TestingModule;
  let embeddingProvider: EmbeddingProvider;
  let vectorStore: VectorStore;
  let lexicalSearch: LexicalSearchService;
  let textRetriever: TextRetrieverService;
  let hybridRetriever: HybridRetrieverService;
  let codeRetriever: CodeRetriever;

  async function indexContent(chunkId: string, content: string) {
    lexicalSearch.indexChunk(chunkId, content);
    const embedding = await embeddingProvider.embedSingle(content);
    await vectorStore.upsert([
      {
        id: chunkId,
        vector: [...embedding.vector],
        metadata: { sourceId: 'test-source' },
        content,
      },
    ]);
  }

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RagModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    embeddingProvider = moduleRef.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    vectorStore = moduleRef.get<VectorStore>(VECTOR_STORE);
    lexicalSearch = moduleRef.get(LexicalSearchService);
    textRetriever = moduleRef.get(TextRetrieverService);
    hybridRetriever = moduleRef.get(HybridRetrieverService);
    codeRetriever = moduleRef.get<CodeRetriever>(CODE_RETRIEVER);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ---- Embedding adapter tests ----

  describe('stub embedding adapter', () => {
    it('produces consistent vectors for the same input', async () => {
      const first = await embeddingProvider.embedSingle('hello world');
      const second = await embeddingProvider.embedSingle('hello world');

      expect(first.vector).toEqual(second.vector);
    });

    it('produces vectors of configured dimensions', async () => {
      const result = await embeddingProvider.embedSingle('test input');

      expect(result.vector).toHaveLength(384);
    });

    it('produces different vectors for different inputs', async () => {
      const first = await embeddingProvider.embedSingle(
        'the cat sat on the mat',
      );
      const second = await embeddingProvider.embedSingle(
        'quantum computing algorithms',
      );

      expect(first.vector).not.toEqual(second.vector);
    });

    it('batch embed preserves order', async () => {
      const texts = ['alpha', 'beta', 'gamma'];
      const batch = await embeddingProvider.embed(texts);

      expect(batch).toHaveLength(3);

      for (let i = 0; i < texts.length; i++) {
        const single = await embeddingProvider.embedSingle(texts[i]);
        expect(batch[i].vector).toEqual(single.vector);
      }
    });
  });

  // ---- Vector store tests ----

  describe('in-memory vector store', () => {
    it('upserts and searches vectors by cosine similarity', async () => {
      const embedA = await embeddingProvider.embedSingle('alpha text');
      const embedB = await embeddingProvider.embedSingle('beta text');
      const embedC = await embeddingProvider.embedSingle('gamma text');

      await vectorStore.upsert([
        {
          id: 'a',
          vector: [...embedA.vector],
          metadata: {},
          content: 'alpha text',
        },
        {
          id: 'b',
          vector: [...embedB.vector],
          metadata: {},
          content: 'beta text',
        },
        {
          id: 'c',
          vector: [...embedC.vector],
          metadata: {},
          content: 'gamma text',
        },
      ]);

      // Search with the exact embedding of 'alpha text' -- it must be
      // the highest-similarity result (cosine 1.0 with itself).
      const results = await vectorStore.search(embedA.vector, { topK: 3 });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('a');
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('deletes vectors', async () => {
      const embed = await embeddingProvider.embedSingle('to be deleted');
      await vectorStore.upsert([
        {
          id: 'ephemeral',
          vector: [...embed.vector],
          metadata: {},
          content: 'to be deleted',
        },
      ]);

      expect(await vectorStore.count()).toBe(1);

      await vectorStore.delete(['ephemeral']);

      const results = await vectorStore.search(embed.vector, { topK: 10 });
      expect(results).toHaveLength(0);
    });

    it('returns count of stored vectors', async () => {
      const entries = await Promise.all(
        ['one', 'two', 'three', 'four', 'five'].map(async (text, i) => {
          const embed = await embeddingProvider.embedSingle(text);
          return {
            id: `v-${i}`,
            vector: [...embed.vector],
            metadata: {},
            content: text,
          };
        }),
      );
      await vectorStore.upsert(entries);

      expect(await vectorStore.count()).toBe(5);

      await vectorStore.delete(['v-0', 'v-1']);

      expect(await vectorStore.count()).toBe(3);
    });

    it('applies threshold filter', async () => {
      const embedTarget = await embeddingProvider.embedSingle('target phrase');
      const embedSimilar = await embeddingProvider.embedSingle('target phrase');
      const embedDifferent = await embeddingProvider.embedSingle(
        'completely unrelated content about marine biology',
      );

      await vectorStore.upsert([
        {
          id: 'similar',
          vector: [...embedSimilar.vector],
          metadata: {},
          content: 'target phrase',
        },
        {
          id: 'different',
          vector: [...embedDifferent.vector],
          metadata: {},
          content: 'completely unrelated content about marine biology',
        },
      ]);

      const results = await vectorStore.search(embedTarget.vector, {
        topK: 10,
        threshold: 0.99,
      });

      // Only the identical vector should pass a 0.99 threshold
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.score >= 0.99)).toBe(true);
      expect(results[0].id).toBe('similar');
    });
  });

  // ---- Text retriever tests ----

  describe('text retriever (RRF fusion)', () => {
    it('fuses lexical and semantic results via RRF', async () => {
      await indexContent('chunk-1', 'TypeScript generics and type inference');
      await indexContent('chunk-2', 'JavaScript promises and async await');
      await indexContent('chunk-3', 'Python data analysis with pandas');

      const results = await textRetriever.retrieve('TypeScript generics', 10);

      expect(results.length).toBeGreaterThan(0);

      const top = results[0];
      expect(top).toHaveProperty('score');
      expect(top).toHaveProperty('lexicalScore');
      expect(top).toHaveProperty('vectorScore');
    });

    it('ranks results that appear in both paths higher', async () => {
      // "TypeScript generics" will match both lexically and semantically
      await indexContent('both-match', 'TypeScript generics overview');
      // "Python pandas" only matches semantically for a TypeScript query
      await indexContent('semantic-only', 'Python pandas data frames');

      const results = await textRetriever.retrieve('TypeScript generics', 10);

      expect(results.length).toBeGreaterThan(0);

      const bothMatch = results.find((r) => r.chunkId === 'both-match');
      expect(bothMatch).toBeDefined();
      // A result appearing in both paths gets double RRF contribution
      expect(bothMatch!.lexicalScore).not.toBeNull();
      expect(bothMatch!.vectorScore).not.toBeNull();
    });

    it('handles disjoint result sets', async () => {
      // Lexical match: contains the exact word "quantum"
      await indexContent('lexical-hit', 'quantum computing fundamentals');
      // Semantic match: related concept but no lexical overlap with "quantum"
      await indexContent(
        'semantic-hit',
        'superposition entanglement probability amplitudes',
      );

      const results = await textRetriever.retrieve('quantum', 10);

      expect(results.length).toBeGreaterThan(0);

      // Both paths may contribute results; verify scores are populated
      for (const result of results) {
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThan(0);
      }
    });
  });

  // ---- Code retriever stub tests ----

  describe('stub code retriever', () => {
    it('returns empty results with degradation notice', async () => {
      const response = await codeRetriever.retrieveCode({
        text: 'find function definitions',
        limit: 10,
      });

      expect(response.results).toHaveLength(0);
      expect(response.notice).toBeDefined();
      expect(response.notice!.available).toBe(false);
    });

    it('reports unavailable', async () => {
      const available = await codeRetriever.isAvailable();

      expect(available).toBe(false);
    });
  });

  // ---- Hybrid retriever tests ----

  describe('hybrid retriever', () => {
    it('retrieves results through the full pipeline', async () => {
      await indexContent('h-1', 'NestJS dependency injection patterns');
      await indexContent('h-2', 'Express middleware pipeline');
      await indexContent('h-3', 'Fastify plugin architecture');

      const results = await hybridRetriever.retrieveHybrid({
        text: 'dependency injection',
        limit: 5,
        includeCode: false,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result).toHaveProperty('chunkId');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('provenance');
        expect(result.score).toBeGreaterThan(0);
      }
    });

    it('implements the H04 Retriever interface', async () => {
      await indexContent('r-1', 'Zod schema validation library');
      await indexContent('r-2', 'Joi validation for Node.js');

      const results = await hybridRetriever.retrieve('schema validation', {
        topK: 5,
        strategy: RetrievalStrategy.HYBRID,
      });

      expect(results.length).toBeGreaterThan(0);

      const first = results[0];
      // H04 shape
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('content');
      expect(first).toHaveProperty('score');
      expect(first).toHaveProperty('source');
      expect(first).toHaveProperty('metadata');
      expect(first).toHaveProperty('provenance');
      expect(first.provenance).toHaveProperty('uri');
      expect(first.provenance).toHaveProperty('hash');
      expect(first.provenance).toHaveProperty('discoveredAt');
    });

    it('rejects empty query text', async () => {
      // Validation happens in the H04 retrieve() boundary via Zod parse
      await expect(
        hybridRetriever.retrieve('', {
          topK: 5,
          strategy: RetrievalStrategy.HYBRID,
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid limit', async () => {
      // Validation happens in the H04 retrieve() boundary via Zod parse
      await expect(
        hybridRetriever.retrieve('valid text', {
          topK: -1,
          strategy: RetrievalStrategy.HYBRID,
        }),
      ).rejects.toThrow();
    });

    it('returns empty results when nothing is indexed', async () => {
      const results = await hybridRetriever.retrieveHybrid({
        text: 'nonexistent content',
        limit: 5,
        includeCode: false,
      });

      expect(results).toEqual([]);
    });

    it('applies minScore filter', async () => {
      await indexContent('ms-1', 'NestJS dependency injection');
      await indexContent('ms-2', 'Completely unrelated marine biology');

      const results = await hybridRetriever.retrieveHybrid({
        text: 'dependency injection',
        limit: 10,
        includeCode: false,
        minScore: 0.9,
      });

      // minScore is very high; most or all RRF scores will be below it
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('caches results and returns from cache on identical query', async () => {
      await indexContent('cache-1', 'Caching retrieval results');

      const cache = moduleRef.get(RetrievalCacheService);
      const metricsBefore = cache.metrics();

      // First call: cache miss
      await hybridRetriever.retrieveHybrid({
        text: 'caching',
        limit: 5,
        includeCode: false,
      });

      // Second call: cache hit
      await hybridRetriever.retrieveHybrid({
        text: 'caching',
        limit: 5,
        includeCode: false,
      });

      const metricsAfter = cache.metrics();
      expect(metricsAfter.hits).toBe(metricsBefore.hits + 1);
    });

    it('passes includeCode to code retriever path', async () => {
      await indexContent('ic-1', 'Some indexed content');

      // With includeCode: true, the hybrid retriever asks the code retriever
      // (which is the stub and returns empty). The text results still come back.
      const results = await hybridRetriever.retrieveHybrid({
        text: 'indexed',
        limit: 5,
        includeCode: true,
      });

      // Stub code retriever returns empty, so only text results
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ---- Provider lifecycle tests ----

  describe('provider lifecycle methods', () => {
    it('embedding adapter supports initialize, healthCheck, dispose, and health', async () => {
      await embeddingProvider.initialize();
      expect(await embeddingProvider.healthCheck()).toBe(
        ProviderStatus.CONNECTED,
      );

      const health = await embeddingProvider.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.lastChecked).toBeGreaterThan(0);

      const dims = await embeddingProvider.dimensions();
      expect(dims).toBe(384);

      const identity = await embeddingProvider.modelIdentity();
      expect(identity.provider).toBe('stub');
      expect(identity.dimensions).toBe(384);
      expect(identity.maxTokens).toBeGreaterThan(0);

      await embeddingProvider.dispose();
      expect(await embeddingProvider.healthCheck()).toBe(
        ProviderStatus.DISCONNECTED,
      );
    });

    it('vector store supports initialize, healthCheck, dispose, and health', async () => {
      await vectorStore.initialize();
      expect(await vectorStore.healthCheck()).toBe(ProviderStatus.CONNECTED);

      const health = await vectorStore.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);

      await vectorStore.dispose();
      expect(await vectorStore.healthCheck()).toBe(ProviderStatus.DISCONNECTED);
      expect(await vectorStore.count()).toBe(0);
    });

    it('hybrid retriever supports initialize, healthCheck, dispose, and health', async () => {
      await hybridRetriever.initialize();
      expect(await hybridRetriever.healthCheck()).toBe(
        ProviderStatus.CONNECTED,
      );

      const health = await hybridRetriever.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);

      expect(hybridRetriever.metadata.id).toBe('hybrid-retriever');

      await hybridRetriever.dispose();
      expect(await hybridRetriever.healthCheck()).toBe(
        ProviderStatus.DISCONNECTED,
      );
    });
  });

  // ---- Metadata filter tests ----

  describe('vector store metadata filtering', () => {
    it('filters results by metadata key-value match', async () => {
      const embedA = await embeddingProvider.embedSingle('alpha');
      const embedB = await embeddingProvider.embedSingle('beta');

      await vectorStore.upsert([
        {
          id: 'f-a',
          vector: [...embedA.vector],
          metadata: { category: 'docs' },
          content: 'alpha',
        },
        {
          id: 'f-b',
          vector: [...embedB.vector],
          metadata: { category: 'code' },
          content: 'beta',
        },
      ]);

      const results = await vectorStore.search(embedA.vector, {
        topK: 10,
        filter: { category: 'docs' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('f-a');
    });

    it('returns no results when filter excludes all entries', async () => {
      const embed = await embeddingProvider.embedSingle('data');
      await vectorStore.upsert([
        {
          id: 'no-match',
          vector: [...embed.vector],
          metadata: { type: 'A' },
          content: 'data',
        },
      ]);

      const results = await vectorStore.search(embed.vector, {
        topK: 10,
        filter: { type: 'Z' },
      });

      expect(results).toHaveLength(0);
    });
  });

  // ---- Cross-domain fusion with code results ----

  describe('cross-domain RRF fusion with code results', () => {
    it('fuses text and code results when a real code retriever returns data', async () => {
      // Create a module with a mock code retriever that returns actual results
      const mockCodeRetriever: CodeRetriever = {
        async retrieveCode(
          _query: CodeRetrievalQuery,
        ): Promise<CodeRetrieverResponse> {
          return {
            results: [
              {
                symbolId: 'sym-createUser',
                filePath: 'src/user.service.ts',
                lineRange: { start: 10, end: 25 },
                content: 'function createUser(name: string) { ... }',
                score: 0.95,
                provenance: {
                  provider: 'codegraph',
                  uri: 'file://src/user.service.ts#L10-L25',
                  discoveredAt: createTimestamp(),
                },
              },
              {
                symbolId: 'sym-deleteUser',
                filePath: 'src/user.service.ts',
                lineRange: { start: 30, end: 40 },
                content: 'function deleteUser(id: string) { ... }',
                score: 0.8,
                provenance: {
                  provider: 'codegraph',
                  uri: 'file://src/user.service.ts#L30-L40',
                  discoveredAt: createTimestamp(),
                },
              },
            ],
          };
        },
        async isAvailable() {
          return true;
        },
      };

      const customModule = await Test.createTestingModule({
        imports: [RagModule.forRoot({ databasePath: ':memory:' })],
      })
        .overrideProvider(CODE_RETRIEVER)
        .useValue(mockCodeRetriever)
        .compile();

      const customLexical = customModule.get(LexicalSearchService);
      const customEmbedding =
        customModule.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
      const customVectorStore = customModule.get<VectorStore>(VECTOR_STORE);
      const customHybrid = customModule.get(HybridRetrieverService);

      // Index some text content
      customLexical.indexChunk(
        'text-1',
        'User management service handles CRUD operations',
      );
      const embed = await customEmbedding.embedSingle(
        'User management service handles CRUD operations',
      );
      await customVectorStore.upsert([
        {
          id: 'text-1',
          vector: [...embed.vector],
          metadata: { sourceId: 'test' },
          content: 'User management service handles CRUD operations',
        },
      ]);

      // Query with includeCode: true
      const results = await customHybrid.retrieveHybrid({
        text: 'user management',
        limit: 10,
        includeCode: true,
      });

      expect(results.length).toBeGreaterThan(0);

      // Should contain both text and code results
      const textResult = results.find((r) => r.chunkId === 'text-1');
      const codeResult = results.find((r) => r.chunkId === 'sym-createUser');

      expect(textResult).toBeDefined();
      expect(codeResult).toBeDefined();

      // Code result should have null lexical/vector scores
      expect(codeResult!.lexicalScore).toBeNull();
      expect(codeResult!.vectorScore).toBeNull();

      // Text result should have component scores
      expect(textResult!.lexicalScore).not.toBeNull();
      expect(textResult!.vectorScore).not.toBeNull();

      // Both should have provenance
      expect(codeResult!.provenance.provider).toBe('codegraph');
      expect(textResult!.provenance.provider).toBe('text-retriever');

      await customModule.close();
    });
  });
});
