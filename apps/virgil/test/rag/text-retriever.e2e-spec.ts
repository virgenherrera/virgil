import type { EmbeddingProvider } from '../../src/contracts/embedding-provider.types.js';
import type { VectorStore } from '../../src/contracts/vector-store.types.js';
import type { LexicalSearchService } from '../../src/rag/adapters/lexical-search.service.js';
import { TextRetrieverService } from '../../src/rag/services/text-retriever.service.js';

function createMockLexical(
  results: Array<{ chunkId: string; content: string; score: number }> = [],
): LexicalSearchService {
  return {
    search: vi.fn().mockReturnValue(results),
    ensureIndex: vi.fn(),
    indexChunk: vi.fn(),
    indexChunks: vi.fn(),
    removeChunk: vi.fn(),
  } as unknown as LexicalSearchService;
}

function createMockEmbedding(): EmbeddingProvider {
  return {
    embedSingle: vi.fn().mockResolvedValue({
      vector: [0.1, 0.2, 0.3],
      tokenCount: 5,
      model: 'test',
    }),
    embed: vi.fn(),
    dimensions: vi.fn().mockResolvedValue(3),
    modelIdentity: vi.fn(),
    health: vi.fn(),
    initialize: vi.fn(),
    healthCheck: vi.fn(),
    dispose: vi.fn(),
    metadata: { id: 'mock', name: 'Mock', version: '0.0.1' as const, capabilities: [] },
    status: 'connected' as const,
  } as unknown as EmbeddingProvider;
}

function createMockVectorStore(
  results: Array<{ id: string; score: number; metadata: Record<string, unknown>; content?: string }> = [],
): VectorStore {
  return {
    search: vi.fn().mockResolvedValue(results),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    health: vi.fn(),
    initialize: vi.fn(),
    healthCheck: vi.fn(),
    dispose: vi.fn(),
    metadata: { id: 'mock-vs', name: 'Mock VS', version: '0.0.1' as const, capabilities: [] },
    status: 'connected' as const,
  } as unknown as VectorStore;
}

describe('TextRetrieverService', () => {
  it('calls both lexical and semantic search paths', async () => {
    const lexical = createMockLexical();
    const embedding = createMockEmbedding();
    const vectorStore = createMockVectorStore();
    const service = new TextRetrieverService(lexical, embedding, vectorStore);

    await service.retrieve('test query', 5);

    expect(lexical.search).toHaveBeenCalledWith('test query', 10);
    expect(embedding.embedSingle).toHaveBeenCalledWith('test query');
    expect(vectorStore.search).toHaveBeenCalled();
  });

  it('fuses results via RRF — dual-path hit scores higher than single-path', async () => {
    const lexical = createMockLexical([
      { chunkId: 'both', content: 'shared', score: 5.0 },
      { chunkId: 'lex-only', content: 'lexical only', score: 3.0 },
    ]);
    const vectorStore = createMockVectorStore([
      { id: 'both', score: 0.95, metadata: {}, content: 'shared' },
      { id: 'vec-only', score: 0.8, metadata: {}, content: 'vector only' },
    ]);
    const service = new TextRetrieverService(lexical, createMockEmbedding(), vectorStore);

    const results = await service.retrieve('query', 10);

    const bothHit = results.find((r) => r.chunkId === 'both');
    const lexOnlyHit = results.find((r) => r.chunkId === 'lex-only');
    const vecOnlyHit = results.find((r) => r.chunkId === 'vec-only');

    expect(bothHit).toBeDefined();
    expect(lexOnlyHit).toBeDefined();
    expect(vecOnlyHit).toBeDefined();
    expect(bothHit!.score).toBeGreaterThan(lexOnlyHit!.score);
    expect(bothHit!.score).toBeGreaterThan(vecOnlyHit!.score);
  });

  it('handles empty lexical results (semantic only)', async () => {
    const lexical = createMockLexical([]);
    const vectorStore = createMockVectorStore([
      { id: 'v1', score: 0.9, metadata: {}, content: 'vector hit' },
    ]);
    const service = new TextRetrieverService(lexical, createMockEmbedding(), vectorStore);

    const results = await service.retrieve('query', 10);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('v1');
    expect(results[0].lexicalScore).toBeNull();
    expect(results[0].vectorScore).toBe(0.9);
  });

  it('handles empty semantic results (lexical only)', async () => {
    const lexical = createMockLexical([
      { chunkId: 'l1', content: 'lexical hit', score: 4.0 },
    ]);
    const vectorStore = createMockVectorStore([]);
    const service = new TextRetrieverService(lexical, createMockEmbedding(), vectorStore);

    const results = await service.retrieve('query', 10);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('l1');
    expect(results[0].lexicalScore).toBe(4.0);
    expect(results[0].vectorScore).toBeNull();
  });

  it('respects limit parameter', async () => {
    const lexical = createMockLexical([
      { chunkId: 'a', content: 'a', score: 5 },
      { chunkId: 'b', content: 'b', score: 4 },
      { chunkId: 'c', content: 'c', score: 3 },
    ]);
    const service = new TextRetrieverService(lexical, createMockEmbedding(), createMockVectorStore());

    const results = await service.retrieve('query', 2);

    expect(results).toHaveLength(2);
  });

  it('each result has the expected shape', async () => {
    const lexical = createMockLexical([
      { chunkId: 'x', content: 'hello', score: 2.5 },
    ]);
    const service = new TextRetrieverService(lexical, createMockEmbedding(), createMockVectorStore());

    const results = await service.retrieve('query', 10);

    expect(results[0]).toEqual(
      expect.objectContaining({
        chunkId: 'x',
        content: 'hello',
        score: expect.any(Number),
        lexicalScore: 2.5,
        vectorScore: null,
      }),
    );
  });
});
