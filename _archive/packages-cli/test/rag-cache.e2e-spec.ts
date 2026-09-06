import { Test, TestingModule } from '@nestjs/testing';
import { RagModule, RetrievalCacheService } from '../src/rag/index.js';
import type { RetrievalResult, RetrievalQuery } from '../src/rag/index.js';
import {
  createContentHash,
  createTimestamp,
} from '../src/shared/primitives.js';

function fakeQuery(text: string): RetrievalQuery {
  return { text, limit: 10, includeCode: false };
}

function fakeResult(chunkId: string): RetrievalResult {
  return {
    chunkId,
    content: `Content for ${chunkId}`,
    score: 0.9,
    lexicalScore: 0.5,
    vectorScore: 0.8,
    sourceId: 'src-1',
    provenance: {
      provider: 'test',
      uri: `chunk://${chunkId}`,
      contentHash: createContentHash(`Content for ${chunkId}`),
      discoveredAt: createTimestamp(),
    },
  };
}

describe('RetrievalCacheService (e2e)', () => {
  let moduleRef: TestingModule;
  let cache: RetrievalCacheService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        RagModule.forRoot({
          databasePath: ':memory:',
          cacheTtlMs: 200,
          cacheMaxSize: 3,
        }),
      ],
    }).compile();

    cache = moduleRef.get(RetrievalCacheService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('returns undefined on cache miss', () => {
    const result = cache.get(fakeQuery('test'));

    expect(result).toBeUndefined();
  });

  it('returns cached results on cache hit', () => {
    const query = fakeQuery('hello');
    const results = [fakeResult('c-1'), fakeResult('c-2')];

    cache.set(query, results);
    const cached = cache.get(query);

    expect(cached).toEqual(results);
  });

  it('returns cache miss after TTL expires', async () => {
    const query = fakeQuery('ephemeral');
    cache.set(query, [fakeResult('c-ttl')]);

    // Wait longer than the 200ms TTL
    await new Promise((r) => setTimeout(r, 250));

    const result = cache.get(query);
    expect(result).toBeUndefined();
  });

  it('invalidates all entries on corpus change', () => {
    const query = fakeQuery('invalidation-test');
    cache.set(query, [fakeResult('c-inv')]);

    cache.invalidate();

    expect(cache.get(query)).toBeUndefined();
  });

  it('invalidates entries when corpus version changes', () => {
    const query = fakeQuery('version-test');
    cache.set(query, [fakeResult('c-ver')]);

    cache.updateCorpusVersion('v2');

    expect(cache.get(query)).toBeUndefined();
  });

  it('evicts LRU entries when at capacity', () => {
    const q1 = fakeQuery('first');
    const q2 = fakeQuery('second');
    const q3 = fakeQuery('third');
    const q4 = fakeQuery('fourth');

    cache.set(q1, [fakeResult('c-1')]);
    cache.set(q2, [fakeResult('c-2')]);
    cache.set(q3, [fakeResult('c-3')]);

    // This should evict q1 (the LRU entry) since capacity is 3
    cache.set(q4, [fakeResult('c-4')]);

    expect(cache.get(q1)).toBeUndefined();
    expect(cache.get(q2)).toBeDefined();
    expect(cache.get(q3)).toBeDefined();
    expect(cache.get(q4)).toBeDefined();
  });

  it('tracks hit/miss/eviction metrics', () => {
    const q1 = fakeQuery('metric-a');
    const q2 = fakeQuery('metric-b');
    const q3 = fakeQuery('metric-c');
    const q4 = fakeQuery('metric-d');

    // 1 miss
    cache.get(q1);

    // Set 3 entries (fills capacity)
    cache.set(q1, [fakeResult('m-1')]);
    cache.set(q2, [fakeResult('m-2')]);
    cache.set(q3, [fakeResult('m-3')]);

    // 1 hit
    cache.get(q1);

    // 1 eviction (q2 is LRU after q1 was just accessed)
    cache.set(q4, [fakeResult('m-4')]);

    // 1 miss (q2 was evicted)
    cache.get(q2);

    const m = cache.metrics();

    expect(m.hits).toBe(1);
    expect(m.misses).toBe(2);
    expect(m.evictions).toBe(1);
    expect(m.size).toBe(3);
  });
});
