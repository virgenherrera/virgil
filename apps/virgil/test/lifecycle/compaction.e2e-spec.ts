import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LifecycleModule } from '../../src/lifecycle/lifecycle.module.js';
import { CompactionService } from '../../src/lifecycle/compaction.service.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { EmbeddingMetaRepository } from '../../src/persistence/repositories/embedding-meta.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import {
  createContentHash,
  createUlid,
} from '../../src/shared/primitives.js';

describe('CompactionService', () => {
  let module: TestingModule;
  let compactionService: CompactionService;
  let artifactRepo: ArtifactRepository;
  let chunkRepo: ChunkRepository;
  let embeddingRepo: EmbeddingMetaRepository;
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

    compactionService = module.get(CompactionService);
    artifactRepo = module.get(ArtifactRepository);
    chunkRepo = module.get(ChunkRepository);
    embeddingRepo = module.get(EmbeddingMetaRepository);

    const sourceRepo = module.get(SourceRepository);
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

  function insertArtifactWithChunks(
    state: 'hot' | 'warm' | 'cold',
    chunkCount = 2,
  ) {
    const content = `content-${createUlid()}`;
    const artifact = artifactRepo.insert({
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: `Artifact ${state}`,
      sourceUri: 'file://test.txt',
      normalizedContent: content,
      providerId: 'provider-1',
      providerCapability: 'ingest',
      lifecycleState: state,
    });

    const chunkInputs = Array.from({ length: chunkCount }, (_, i) => ({
      contentHash: createContentHash(`${content}-chunk-${i}`),
      content: `chunk-${i}`,
      position: i,
      startOffset: i * 7,
      endOffset: (i + 1) * 7,
    }));

    const chunks = chunkRepo.insertMany(artifact.id, chunkInputs);

    for (const chunk of chunks) {
      embeddingRepo.create({
        chunkId: chunk.id,
        modelId: 'test-model',
        dimensions: 128,
      });
    }

    return { artifact, chunks };
  }

  it('compacts Cold artifacts — deletes chunks and cascades embeddings', () => {
    const { artifact: coldArtifact } = insertArtifactWithChunks('cold', 3);

    const report = compactionService.compact();

    expect(report.artifactsAffected).toBe(1);
    expect(report.chunksRemoved).toBe(3);
    expect(report.embeddingsRemoved).toBe(3);
    expect(report.elapsedMs).toBeGreaterThanOrEqual(0);

    const remainingChunks = chunkRepo.listByArtifact(coldArtifact.id);
    expect(remainingChunks).toHaveLength(0);
  });

  it('preserves Hot/Warm artifact chunks', () => {
    const { artifact: hotArtifact } = insertArtifactWithChunks('hot', 2);
    const { artifact: warmArtifact } = insertArtifactWithChunks('warm', 2);
    insertArtifactWithChunks('cold', 1);

    compactionService.compact();

    expect(chunkRepo.listByArtifact(hotArtifact.id)).toHaveLength(2);
    expect(chunkRepo.listByArtifact(warmArtifact.id)).toHaveLength(2);
  });

  it('reports bytes reclaimed >= 0 after VACUUM', () => {
    insertArtifactWithChunks('cold', 5);

    const report = compactionService.compact();

    expect(report.bytesReclaimed).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent on second run', () => {
    insertArtifactWithChunks('cold', 3);

    const first = compactionService.compact();
    expect(first.artifactsAffected).toBe(1);
    expect(first.chunksRemoved).toBe(3);

    const second = compactionService.compact();
    expect(second.artifactsAffected).toBe(0);
    expect(second.chunksRemoved).toBe(0);
    expect(second.embeddingsRemoved).toBe(0);
  });
});
