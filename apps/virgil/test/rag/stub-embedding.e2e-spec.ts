import { StubEmbeddingAdapter } from '../../src/rag/adapters/stub-embedding.adapter.js';
import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';
import { DEFAULT_EMBEDDING_DIMENSIONS } from '../../src/rag/rag.constants.js';

describe('StubEmbeddingAdapter', () => {
  let adapter: StubEmbeddingAdapter;

  beforeEach(() => {
    adapter = new StubEmbeddingAdapter();
  });

  it('embed() returns array matching input count', async () => {
    const results = await adapter.embed(['hello', 'world', 'test']);
    expect(results).toHaveLength(3);
  });

  it('embedSingle() returns a single result', async () => {
    const result = await adapter.embedSingle('hello');
    expect(result).toBeDefined();
    expect(result.vector).toBeDefined();
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.model).toContain('stub');
  });

  it('produces deterministic vectors for the same text', async () => {
    const a = await adapter.embedSingle('deterministic test');
    const b = await adapter.embedSingle('deterministic test');
    expect(a.vector).toEqual(b.vector);
  });

  it('produces different vectors for different texts', async () => {
    const a = await adapter.embedSingle('first text');
    const b = await adapter.embedSingle('second text');
    expect(a.vector).not.toEqual(b.vector);
  });

  it('vector length matches default dimensions (384)', async () => {
    const result = await adapter.embedSingle('test');
    expect(result.vector).toHaveLength(DEFAULT_EMBEDDING_DIMENSIONS);
  });

  it('vector length matches custom dimensions', async () => {
    const custom = new StubEmbeddingAdapter(128);
    const result = await custom.embedSingle('test');
    expect(result.vector).toHaveLength(128);
  });

  it('vectors are unit length (magnitude ≈ 1.0)', async () => {
    const result = await adapter.embedSingle('unit vector test');
    const magnitude = Math.sqrt(
      result.vector.reduce((sum, v) => sum + v * v, 0),
    );
    expect(Math.abs(magnitude - 1.0)).toBeLessThan(1e-6);
  });

  it('dimensions() returns configured value', async () => {
    expect(await adapter.dimensions()).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
    const custom = new StubEmbeddingAdapter(256);
    expect(await custom.dimensions()).toBe(256);
  });

  it('modelIdentity() returns stub info', async () => {
    const info = await adapter.modelIdentity();
    expect(info.provider).toBe('stub');
    expect(info.model).toContain('stub');
    expect(info.dimensions).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
    expect(info.maxTokens).toBeGreaterThan(0);
  });

  it('health() returns HEALTHY', async () => {
    const health = await adapter.health();
    expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
    expect(health.lastChecked).toBeDefined();
  });

  it('metadata has correct id and capabilities', () => {
    expect(adapter.metadata.id).toBe('stub-embedding');
    expect(adapter.metadata.capabilities).toContain(
      ProviderCapability.EMBEDDING,
    );
  });

  it('initialize() sets status to CONNECTED', async () => {
    await adapter.initialize();
    expect(await adapter.healthCheck()).toBe('connected');
  });

  it('dispose() sets status to DISCONNECTED', async () => {
    await adapter.dispose();
    expect(await adapter.healthCheck()).toBe('disconnected');
  });
});
