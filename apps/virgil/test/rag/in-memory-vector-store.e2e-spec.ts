import { InMemoryVectorStore } from '../../src/rag/adapters/in-memory-vector-store.adapter.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import type { VectorEntry } from '../../src/contracts/vector-store.types.js';

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  function makeEntry(
    id: string,
    vector: number[],
    metadata: Record<string, unknown> = {},
    content?: string,
  ): VectorEntry {
    return { id, vector, metadata, content };
  }

  it('upsert adds entries and count() reflects size', async () => {
    await store.upsert([
      makeEntry('a', [1, 0, 0]),
      makeEntry('b', [0, 1, 0]),
    ]);
    expect(await store.count()).toBe(2);
  });

  it('upsert same id overwrites without increasing count', async () => {
    await store.upsert([makeEntry('a', [1, 0, 0])]);
    await store.upsert([makeEntry('a', [0, 1, 0])]);
    expect(await store.count()).toBe(1);
  });

  it('search returns results sorted by cosine similarity descending', async () => {
    await store.upsert([
      makeEntry('exact', [1, 0, 0], {}, 'exact match'),
      makeEntry('partial', [0.7, 0.7, 0], {}, 'partial match'),
      makeEntry('orthogonal', [0, 0, 1], {}, 'orthogonal'),
    ]);

    const results = await store.search([1, 0, 0], { topK: 10 });
    expect(results.length).toBe(3);
    expect(results[0].id).toBe('exact');
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it('search with topK limits results', async () => {
    await store.upsert([
      makeEntry('a', [1, 0, 0]),
      makeEntry('b', [0.9, 0.1, 0]),
      makeEntry('c', [0.5, 0.5, 0]),
    ]);

    const results = await store.search([1, 0, 0], { topK: 2 });
    expect(results).toHaveLength(2);
  });

  it('search with threshold filters low-score results', async () => {
    await store.upsert([
      makeEntry('high', [1, 0, 0]),
      makeEntry('low', [0, 0, 1]),
    ]);

    const results = await store.search([1, 0, 0], {
      topK: 10,
      threshold: 0.5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('high');
  });

  it('search with filter matches metadata', async () => {
    await store.upsert([
      makeEntry('a', [1, 0, 0], { type: 'doc' }),
      makeEntry('b', [0.9, 0.1, 0], { type: 'code' }),
    ]);

    const results = await store.search([1, 0, 0], {
      topK: 10,
      filter: { type: 'code' },
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b');
  });

  it('search empty store returns empty array', async () => {
    const results = await store.search([1, 0, 0], { topK: 10 });
    expect(results).toEqual([]);
  });

  it('delete removes entries and count() decrements', async () => {
    await store.upsert([
      makeEntry('a', [1, 0, 0]),
      makeEntry('b', [0, 1, 0]),
    ]);
    await store.delete(['a']);
    expect(await store.count()).toBe(1);
  });

  it('health() returns HEALTHY', async () => {
    const health = await store.health();
    expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
  });

  it('dispose() clears store', async () => {
    await store.upsert([makeEntry('a', [1, 0, 0])]);
    await store.dispose();
    expect(await store.count()).toBe(0);
  });

  it('initialize() sets status to CONNECTED', async () => {
    await store.initialize();
    expect(await store.healthCheck()).toBe('connected');
  });

  it('healthCheck() returns current status', async () => {
    expect(await store.healthCheck()).toBe('connected');
    await store.dispose();
    expect(await store.healthCheck()).toBe('disconnected');
  });
});
