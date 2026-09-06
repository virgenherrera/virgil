import { LifecyclePolicyService } from '../../src/lifecycle/lifecycle-policy.service.js';
import { LifecycleConfigSchema } from '../../src/lifecycle/lifecycle-config.schema.js';
import type { ArtifactMetricsSnapshot } from '../../src/lifecycle/lifecycle.types.js';

describe('LifecyclePolicyService', () => {
  const service = new LifecyclePolicyService();
  const defaultConfig = LifecycleConfigSchema.parse({});

  const snapshot = (
    overrides: Partial<ArtifactMetricsSnapshot> = {},
  ): ArtifactMetricsSnapshot => ({
    artifactId: 'art-1',
    lifecycleState: 'hot',
    accessCount: 0,
    lastAccessTs: null,
    hasProvenance: false,
    chunkCount: 5,
    embeddingCount: 5,
    ...overrides,
  });

  it('recommends Hot -> Warm when access below hot_access_threshold', () => {
    const metrics = [snapshot({ accessCount: 2 })];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(1);
    expect(result[0]!.currentState).toBe('hot');
    expect(result[0]!.recommendedState).toBe('warm');
  });

  it('does NOT recommend Hot -> Warm when access >= hot_access_threshold', () => {
    const metrics = [snapshot({ accessCount: 5 })];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(0);
  });

  it('recommends Warm -> Cold when access below warm_access_threshold AND hasProvenance', () => {
    const metrics = [
      snapshot({
        lifecycleState: 'warm',
        accessCount: 0,
        hasProvenance: true,
      }),
    ];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(1);
    expect(result[0]!.currentState).toBe('warm');
    expect(result[0]!.recommendedState).toBe('cold');
  });

  it('does NOT recommend Warm -> Cold without provenance', () => {
    const metrics = [
      snapshot({
        lifecycleState: 'warm',
        accessCount: 0,
        hasProvenance: false,
      }),
    ];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(0);
  });

  it('does NOT recommend Warm -> Cold when access >= warm_access_threshold', () => {
    const metrics = [
      snapshot({
        lifecycleState: 'warm',
        accessCount: 1,
        hasProvenance: true,
      }),
    ];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(0);
  });

  it('returns empty for Cold artifacts', () => {
    const metrics = [
      snapshot({
        lifecycleState: 'cold',
        accessCount: 0,
        hasProvenance: true,
      }),
    ];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(0);
  });

  it('sorts recommendations by rehydrationCost ascending', () => {
    const metrics = [
      snapshot({ artifactId: 'expensive', chunkCount: 100, embeddingCount: 50 }),
      snapshot({ artifactId: 'cheap', chunkCount: 1, embeddingCount: 1 }),
      snapshot({ artifactId: 'medium', chunkCount: 10, embeddingCount: 5 }),
    ];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result).toHaveLength(3);
    expect(result[0]!.artifactId).toBe('cheap');
    expect(result[0]!.rehydrationCost).toBe(2);
    expect(result[1]!.artifactId).toBe('medium');
    expect(result[1]!.rehydrationCost).toBe(15);
    expect(result[2]!.artifactId).toBe('expensive');
    expect(result[2]!.rehydrationCost).toBe(150);
  });

  it('includes reason text with threshold info', () => {
    const metrics = [snapshot({ accessCount: 2 })];

    const result = service.evaluate(metrics, defaultConfig);

    expect(result[0]!.reason).toContain('2');
    expect(result[0]!.reason).toContain('5');
  });
});
