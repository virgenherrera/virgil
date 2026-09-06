import { RetrievalStrategy } from '../../src/contracts/retriever.types.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { RetrievalResult } from '../../src/rag/contracts/retrieval-result.schema.js';
import type { CodeRetriever, CodeRetrievalResult } from '../../src/rag/ports/code-retriever.port.js';
import type { TextRetrievalHit } from '../../src/rag/services/text-retriever.service.js';
import type { TextRetrieverService } from '../../src/rag/services/text-retriever.service.js';
import type { RetrievalCacheService } from '../../src/rag/services/retrieval-cache.service.js';
import { HybridRetrieverService } from '../../src/rag/services/hybrid-retriever.service.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import {
  createContentHash,
  createTimestamp,
} from '../../src/shared/primitives.js';

function textHit(chunkId: string, score = 0.5): TextRetrievalHit {
  return {
    chunkId,
    content: `content-${chunkId}`,
    score,
    lexicalScore: score * 0.8,
    vectorScore: score * 0.6,
  };
}

function makeResult(chunkId: string, score = 0.5): RetrievalResult {
  return {
    chunkId,
    content: `content-${chunkId}`,
    score,
    lexicalScore: score * 0.8,
    vectorScore: score * 0.6,
    sourceId: chunkId,
    provenance: {
      provider: 'test',
      uri: `chunk://${chunkId}`,
      contentHash: createContentHash(`content-${chunkId}`),
      discoveredAt: createTimestamp(),
    },
  };
}

function createMockTextRetriever(
  hits: TextRetrievalHit[] = [],
): TextRetrieverService {
  return {
    retrieve: vi.fn().mockResolvedValue(hits),
  } as unknown as TextRetrieverService;
}

function createMockCodeRetriever(
  results: unknown[] = [],
  available = false,
): CodeRetriever {
  return {
    retrieveCode: vi.fn().mockResolvedValue({ results, notice: available ? undefined : { available: false, reason: 'stub' } }),
    isAvailable: vi.fn().mockResolvedValue(available),
  } as unknown as CodeRetriever;
}

function createMockCache(
  cachedResults?: RetrievalResult[],
): RetrievalCacheService {
  return {
    get: vi.fn().mockReturnValue(cachedResults),
    set: vi.fn(),
    invalidate: vi.fn(),
    updateCorpusVersion: vi.fn(),
    metrics: vi.fn().mockReturnValue({ hits: 0, misses: 0, evictions: 0, size: 0 }),
  } as unknown as RetrievalCacheService;
}

describe('HybridRetrieverService', () => {
  it('only calls textRetriever when includeCode is false', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1')]);
    const codeRetriever = createMockCodeRetriever();
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, codeRetriever, cache);

    await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: false });

    expect(textRetriever.retrieve).toHaveBeenCalled();
    expect(codeRetriever.retrieveCode).not.toHaveBeenCalled();
  });

  it('calls both retrievers when includeCode is true', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1')]);
    const codeRetriever = createMockCodeRetriever([], true);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, codeRetriever, cache);

    await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: true });

    expect(textRetriever.retrieve).toHaveBeenCalled();
    expect(codeRetriever.retrieveCode).toHaveBeenCalled();
  });

  it('returns cached results on cache hit', async () => {
    const cached = [makeResult('cached-1')];
    const textRetriever = createMockTextRetriever();
    const codeRetriever = createMockCodeRetriever();
    const cache = createMockCache(cached);
    const service = new HybridRetrieverService(textRetriever, codeRetriever, cache);

    const results = await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: false });

    expect(results).toEqual(cached);
    expect(textRetriever.retrieve).not.toHaveBeenCalled();
  });

  it('caches results on cache miss', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1')]);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, createMockCodeRetriever(), cache);

    await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: false });

    expect(cache.set).toHaveBeenCalled();
  });

  it('filters results below minScore', async () => {
    const textRetriever = createMockTextRetriever([
      textHit('high', 0.9),
      textHit('low', 0.001),
    ]);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, createMockCodeRetriever(), cache);

    const results = await service.retrieveHybrid({
      text: 'query',
      limit: 10,
      includeCode: false,
      minScore: 0.01,
    });

    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('high');
    expect(ids).not.toContain('low');
  });

  it('passes text results through with provenance when no code results', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1', 0.8)]);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, createMockCodeRetriever(), cache);

    const results = await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: false });

    expect(results[0].provenance).toBeDefined();
    expect(results[0].provenance.provider).toBe('text-retriever');
    expect(results[0].provenance.uri).toContain('chunk://');
  });

  it('retrieve() H04 interface maps to retrieveHybrid', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1')]);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, createMockCodeRetriever(), cache);

    const results = await service.retrieve('query', {
      topK: 5,
      strategy: RetrievalStrategy.HYBRID,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('t1');
    expect(results[0].source).toBe('fused');
  });

  it('degrades gracefully when code retriever returns empty', async () => {
    const textRetriever = createMockTextRetriever([textHit('t1'), textHit('t2')]);
    const codeRetriever = createMockCodeRetriever([], false);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, codeRetriever, cache);

    const results = await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: true });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.provenance.provider === 'text-retriever')).toBe(true);
  });

  it('initialize() sets status to CONNECTED', async () => {
    const service = new HybridRetrieverService(
      createMockTextRetriever(), createMockCodeRetriever(), createMockCache(undefined),
    );
    await service.initialize();
    expect(service.status).toBe(ProviderStatus.CONNECTED);
  });

  it('healthCheck() returns current status', async () => {
    const service = new HybridRetrieverService(
      createMockTextRetriever(), createMockCodeRetriever(), createMockCache(undefined),
    );
    const status = await service.healthCheck();
    expect(status).toBe(ProviderStatus.CONNECTED);
  });

  it('dispose() sets status to DISCONNECTED', async () => {
    const service = new HybridRetrieverService(
      createMockTextRetriever(), createMockCodeRetriever(), createMockCache(undefined),
    );
    await service.dispose();
    expect(service.status).toBe(ProviderStatus.DISCONNECTED);
  });

  it('health() returns HEALTHY status', async () => {
    const service = new HybridRetrieverService(
      createMockTextRetriever(), createMockCodeRetriever(), createMockCache(undefined),
    );
    const health = await service.health();
    expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
    expect(health.lastChecked).toBeDefined();
  });

  it('fuses text and code results via cross-domain RRF when code results exist', async () => {
    const now = createTimestamp();
    const codeResults: CodeRetrievalResult[] = [
      {
        symbolId: 'code-sym-1',
        filePath: 'src/main.ts',
        lineRange: { start: 1, end: 10 },
        content: 'function main() {}',
        score: 0.95,
        provenance: { provider: 'codegraph', uri: 'codegraph://sym/1', discoveredAt: now },
      },
      {
        symbolId: 'code-sym-2',
        filePath: 'src/util.ts',
        lineRange: { start: 5, end: 15 },
        content: 'function util() {}',
        score: 0.85,
        provenance: { provider: 'codegraph', uri: 'codegraph://sym/2', discoveredAt: now },
      },
    ];
    const textRetriever = createMockTextRetriever([textHit('t1', 0.9), textHit('t2', 0.7)]);
    const codeRetriever = createMockCodeRetriever(codeResults, true);
    const cache = createMockCache(undefined);
    const service = new HybridRetrieverService(textRetriever, codeRetriever, cache);

    const results = await service.retrieveHybrid({ text: 'query', limit: 10, includeCode: true });

    expect(results.length).toBeGreaterThanOrEqual(4);
    const codeResult = results.find((r) => r.chunkId === 'code-sym-1');
    expect(codeResult).toBeDefined();
    expect(codeResult!.provenance.provider).toBe('codegraph');
    expect(codeResult!.lexicalScore).toBeNull();
    expect(codeResult!.vectorScore).toBeNull();
    expect(codeResult!.sourceId).toBe('src/main.ts');

    const textResult = results.find((r) => r.chunkId === 't1');
    expect(textResult).toBeDefined();
    expect(textResult!.provenance.provider).toBe('text-retriever');
  });
});
