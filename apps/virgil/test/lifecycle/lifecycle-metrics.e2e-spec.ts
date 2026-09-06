import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LifecycleModule } from '../../src/lifecycle/lifecycle.module.js';
import { LifecycleMetricsService } from '../../src/lifecycle/lifecycle-metrics.service.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { EmbeddingMetaRepository } from '../../src/persistence/repositories/embedding-meta.repository.js';
import { ProvenanceRepository } from '../../src/persistence/repositories/provenance.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import {
  createContentHash,
  createUlid,
} from '../../src/shared/primitives.js';

describe('LifecycleMetricsService', () => {
  let module: TestingModule;
  let metricsService: LifecycleMetricsService;
  let artifactRepo: ArtifactRepository;
  let chunkRepo: ChunkRepository;
  let embeddingRepo: EmbeddingMetaRepository;
  let provenanceRepo: ProvenanceRepository;
  let sourceRepo: SourceRepository;
  let sourceId: string;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        LifecycleModule.forRoot({
          databasePath: ':memory:',
          runMigrations: true,
        }),
      ],
    }).compile();

    metricsService = module.get(LifecycleMetricsService);
    artifactRepo = module.get(ArtifactRepository);
    chunkRepo = module.get(ChunkRepository);
    embeddingRepo = module.get(EmbeddingMetaRepository);
    provenanceRepo = module.get(ProvenanceRepository);
    sourceRepo = module.get(SourceRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com/repo',
      displayName: 'Test Source',
      refreshIntervalSeconds: 3600,
    });
    sourceId = source.id;
  });

  afterEach(async () => {
    await module.close();
  });

  function insertArtifact(
    state: 'hot' | 'warm' | 'cold' = 'hot',
    content = `content-${createUlid()}`,
  ) {
    return artifactRepo.insert({
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: 'Test Artifact',
      sourceUri: 'file://test.txt',
      normalizedContent: content,
      providerId: 'provider-1',
      providerCapability: 'ingest',
      lifecycleState: state,
    });
  }

  it('recordAccess increments access count', () => {
    const artifact = insertArtifact();

    metricsService.recordAccess(artifact.id, 10);
    metricsService.recordAccess(artifact.id, 20);

    const metrics = metricsService.getPerArtifactMetrics();
    const m = metrics.find((x) => x.artifactId === artifact.id);

    expect(m).toBeDefined();
    expect(m!.accessCount).toBe(2);
    expect(m!.lastAccessTs).toBeGreaterThan(0);
  });

  it('getStorageMetrics returns db size, chunk count, embedding footprint, artifact counts by state', () => {
    insertArtifact('hot');
    insertArtifact('hot');
    insertArtifact('warm');

    const coldArtifact = insertArtifact('cold');
    const chunks = chunkRepo.insertMany(coldArtifact.id, [
      {
        contentHash: createContentHash('chunk-1'),
        content: 'chunk-1',
        position: 0,
        startOffset: 0,
        endOffset: 7,
      },
    ]);

    embeddingRepo.create({
      chunkId: chunks[0]!.id,
      modelId: 'test-model',
      dimensions: 128,
    });

    const storage = metricsService.getStorageMetrics();

    expect(storage.dbSizeBytes).toBeGreaterThan(0);
    expect(storage.chunkCount).toBe(1);
    expect(storage.embeddingFootprintBytes).toBe(128 * 4);
    expect(storage.artifactCountByState.hot).toBe(2);
    expect(storage.artifactCountByState.warm).toBe(1);
    expect(storage.artifactCountByState.cold).toBe(1);
  });

  it('getPerArtifactMetrics returns per-artifact snapshots with chunk/embedding counts', () => {
    const artifact = insertArtifact('hot');
    const chunks = chunkRepo.insertMany(artifact.id, [
      {
        contentHash: createContentHash('c1'),
        content: 'c1',
        position: 0,
        startOffset: 0,
        endOffset: 2,
      },
      {
        contentHash: createContentHash('c2'),
        content: 'c2',
        position: 1,
        startOffset: 2,
        endOffset: 4,
      },
    ]);

    embeddingRepo.create({
      chunkId: chunks[0]!.id,
      modelId: 'model-1',
      dimensions: 256,
    });

    provenanceRepo.create({
      artifactId: artifact.id,
      sourceId,
      sourceUri: 'file://test.txt',
      fetchedBy: 'test',
      contentHashAtFetch: createContentHash('c1c2'),
    });

    const metrics = metricsService.getPerArtifactMetrics();
    const m = metrics.find((x) => x.artifactId === artifact.id);

    expect(m).toBeDefined();
    expect(m!.chunkCount).toBe(2);
    expect(m!.embeddingCount).toBe(1);
    expect(m!.hasProvenance).toBe(true);
    expect(m!.lifecycleState).toBe('hot');
  });

  it('createMetricSnapshot returns JSON string with access data', () => {
    const artifact = insertArtifact();

    metricsService.recordAccess(artifact.id, 42);

    const json = metricsService.createMetricSnapshot(artifact.id);
    const parsed = JSON.parse(json);

    expect(parsed.timestamp).toBeGreaterThan(0);
    expect(parsed.accessCount).toBe(1);
    expect(parsed.lastAccessTs).toBeGreaterThan(0);
  });

  it('createMetricSnapshot returns zeroes for unaccessed artifact', () => {
    const artifact = insertArtifact();
    const json = metricsService.createMetricSnapshot(artifact.id);
    const parsed = JSON.parse(json);

    expect(parsed.accessCount).toBe(0);
    expect(parsed.lastAccessTs).toBeNull();
  });

  it('getAggregateStats aggregates correctly', () => {
    const a1 = insertArtifact('hot');
    const a2 = insertArtifact('hot');
    insertArtifact('warm');

    chunkRepo.insertMany(a1.id, [
      {
        contentHash: createContentHash('ch-agg'),
        content: 'ch-agg',
        position: 0,
        startOffset: 0,
        endOffset: 6,
      },
    ]);

    metricsService.recordAccess(a1.id, 100);
    metricsService.recordAccess(a2.id, 200);

    const stats = metricsService.getAggregateStats();

    expect(stats.countByState.hot).toBe(2);
    expect(stats.countByState.warm).toBe(1);
    expect(stats.storageByState.hot).toBeGreaterThanOrEqual(1);
    expect(stats.avgLatencyByState.hot).toBeGreaterThan(0);
  });
});
