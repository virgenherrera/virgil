import {
  ArtifactLifecycleInfoSchema,
  StorageMetricsSchema,
  AggregateStatsSchema,
} from '../../src/lifecycle/lifecycle-metrics.port.js';

describe('Lifecycle type schemas', () => {
  describe('ArtifactLifecycleInfoSchema', () => {
    it('validates correct data', () => {
      const result = ArtifactLifecycleInfoSchema.parse({
        artifactId: 'art-1',
        lifecycleState: 'hot',
        accessCount: 5,
        lastAccessTs: Date.now(),
        hasProvenance: true,
        chunkCount: 3,
        embeddingCount: 3,
      });

      expect(result.artifactId).toBe('art-1');
      expect(result.lifecycleState).toBe('hot');
      expect(result.hasProvenance).toBe(true);
    });

    it('accepts null lastAccessTs', () => {
      const result = ArtifactLifecycleInfoSchema.parse({
        artifactId: 'art-1',
        lifecycleState: 'warm',
        accessCount: 0,
        lastAccessTs: null,
        hasProvenance: false,
        chunkCount: 0,
        embeddingCount: 0,
      });

      expect(result.lastAccessTs).toBeNull();
    });

    it('rejects invalid lifecycle state', () => {
      expect(() =>
        ArtifactLifecycleInfoSchema.parse({
          artifactId: 'art-1',
          lifecycleState: 'archived',
          accessCount: 0,
          lastAccessTs: null,
          hasProvenance: false,
          chunkCount: 0,
          embeddingCount: 0,
        }),
      ).toThrow();
    });

    it('rejects negative accessCount', () => {
      expect(() =>
        ArtifactLifecycleInfoSchema.parse({
          artifactId: 'art-1',
          lifecycleState: 'hot',
          accessCount: -1,
          lastAccessTs: null,
          hasProvenance: false,
          chunkCount: 0,
          embeddingCount: 0,
        }),
      ).toThrow();
    });
  });

  describe('StorageMetricsSchema', () => {
    it('validates correct data', () => {
      const result = StorageMetricsSchema.parse({
        dbSizeBytes: 4096,
        embeddingFootprintBytes: 1024,
        chunkCount: 10,
        artifactCountByState: { hot: 3, warm: 2, cold: 1 },
      });

      expect(result.dbSizeBytes).toBe(4096);
      expect(result.artifactCountByState.hot).toBe(3);
    });
  });

  describe('AggregateStatsSchema', () => {
    it('validates correct data', () => {
      const result = AggregateStatsSchema.parse({
        countByState: { hot: 5 },
        storageByState: { hot: 100 },
        avgLatencyByState: { hot: 12.5 },
      });

      expect(result.countByState.hot).toBe(5);
      expect(result.avgLatencyByState.hot).toBe(12.5);
    });
  });
});
