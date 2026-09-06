import {
  createContentHash,
  createTimestamp,
} from '../../src/shared/primitives.js';
import { RetrievalQuerySchema } from '../../src/rag/contracts/retrieval-query.schema.js';
import type { RetrievalResult } from '../../src/rag/contracts/retrieval-result.schema.js';
import { RetrievalCacheService } from '../../src/rag/services/retrieval-cache.service.js';

function makeResult(chunkId: string): RetrievalResult {
  return {
    chunkId,
    content: `content-${chunkId}`,
    score: 0.9,
    lexicalScore: 0.8,
    vectorScore: 0.7,
    sourceId: `source-${chunkId}`,
    provenance: {
      provider: 'test',
      uri: `chunk://${chunkId}`,
      contentHash: createContentHash(`content-${chunkId}`),
      discoveredAt: createTimestamp(),
    },
  };
}

function makeQuery(text: string, filters?: Record<string, unknown>) {
  return RetrievalQuerySchema.parse({ text, ...(filters && { filters }) });
}

describe('RetrievalCacheService', () => {
  let cache: RetrievalCacheService;

  beforeEach(() => {
    cache = new RetrievalCacheService();
  });

  it('returns undefined on cache miss', () => {
    const query = makeQuery('unknown');
    expect(cache.get(query)).toBeUndefined();
  });

  it('returns cached results on cache hit', () => {
    const query = makeQuery('hello');
    const results = [makeResult('c1')];
    cache.set(query, results);
    expect(cache.get(query)).toEqual(results);
  });

  it('expires entries after TTL', async () => {
    const shortCache = new RetrievalCacheService(50, 100);
    const query = makeQuery('ttl-test');
    shortCache.set(query, [makeResult('c2')]);

    expect(shortCache.get(query)).toBeDefined();
    await new Promise((r) => setTimeout(r, 60));
    expect(shortCache.get(query)).toBeUndefined();
  });

  it('invalidates on corpus version change', () => {
    const query = makeQuery('version-test');
    cache.set(query, [makeResult('c3')]);

    expect(cache.get(query)).toBeDefined();
    cache.updateCorpusVersion('v2');
    expect(cache.get(query)).toBeUndefined();
  });

  it('invalidate() clears all entries', () => {
    cache.set(makeQuery('a'), [makeResult('c4')]);
    cache.set(makeQuery('b'), [makeResult('c5')]);

    cache.invalidate();
    expect(cache.get(makeQuery('a'))).toBeUndefined();
    expect(cache.get(makeQuery('b'))).toBeUndefined();
  });

  it('evicts LRU entry when at capacity', () => {
    const smallCache = new RetrievalCacheService(300_000, 2);
    const q1 = makeQuery('first');
    const q2 = makeQuery('second');
    const q3 = makeQuery('third');

    smallCache.set(q1, [makeResult('c6')]);
    smallCache.set(q2, [makeResult('c7')]);
    smallCache.set(q3, [makeResult('c8')]);

    expect(smallCache.get(q1)).toBeUndefined();
    expect(smallCache.get(q2)).toBeDefined();
    expect(smallCache.get(q3)).toBeDefined();
  });

  it('reports metrics correctly', () => {
    const query = makeQuery('metrics');
    cache.get(query); // miss
    cache.set(query, [makeResult('c9')]);
    cache.get(query); // hit

    const m = cache.metrics();
    expect(m.misses).toBe(1);
    expect(m.hits).toBe(1);
    expect(m.size).toBe(1);
  });

  it('reports eviction count in metrics', () => {
    const smallCache = new RetrievalCacheService(300_000, 1);
    smallCache.set(makeQuery('x'), [makeResult('c10')]);
    smallCache.set(makeQuery('y'), [makeResult('c11')]);

    expect(smallCache.metrics().evictions).toBe(1);
  });

  it('treats queries with different filters as different cache keys', () => {
    const q1 = makeQuery('same-text', { sourceIds: ['a'] });
    const q2 = makeQuery('same-text', { sourceIds: ['b'] });

    cache.set(q1, [makeResult('c12')]);
    expect(cache.get(q2)).toBeUndefined();
    expect(cache.get(q1)).toBeDefined();
  });
});
