import type { TestingModule } from '@nestjs/testing';
import { EmbeddingMetaRepository } from '../../src/persistence/repositories/embedding-meta.repository.js';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { EmbeddingStatus } from '../../src/persistence/persistence.types.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('EmbeddingMetaRepository', () => {
  let module: TestingModule;
  let embeddingRepo: EmbeddingMetaRepository;
  let chunkId: string;

  beforeEach(async () => {
    module = await createTestModule();
    embeddingRepo = module.get(EmbeddingMetaRepository);
    const sourceRepo = module.get(SourceRepository);
    const artifactRepo = module.get(ArtifactRepository);
    const chunkRepo = module.get(ChunkRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com',
      displayName: 'Source',
      refreshIntervalSeconds: 3600,
    });
    const artifact = artifactRepo.insert({
      sourceId: source.id,
      contentHash: createContentHash('artifact'),
      contentLength: 8,
      mimeType: 'text/plain',
      title: 'Test',
      sourceUri: 'file://test.txt',
      normalizedContent: 'artifact',
      providerId: 'p1',
      providerCapability: 'ingest',
    });
    const [chunk] = chunkRepo.insertMany(artifact.id, [
      {
        contentHash: createContentHash('chunk'),
        content: 'chunk',
        position: 0,
        startOffset: 0,
        endOffset: 5,
      },
    ]);
    chunkId = chunk.id;
  });

  afterEach(async () => {
    await module.close();
  });

  it('creates embedding metadata with default pending status', () => {
    const meta = embeddingRepo.create({
      chunkId,
      modelId: 'text-embedding-3-small',
      dimensions: 1536,
    });
    expect(meta.status).toBe(EmbeddingStatus.PENDING);
    expect(meta.modelId).toBe('text-embedding-3-small');
    expect(meta.dimensions).toBe(1536);
    expect(meta.generatedAt).toBeUndefined();
  });

  it('finds by id', () => {
    const created = embeddingRepo.create({
      chunkId,
      modelId: 'model-1',
      dimensions: 768,
    });
    const found = embeddingRepo.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('finds by chunk id', () => {
    embeddingRepo.create({
      chunkId,
      modelId: 'model-1',
      dimensions: 768,
    });
    const found = embeddingRepo.findByChunk(chunkId);
    expect(found).toBeDefined();
    expect(found!.chunkId).toBe(chunkId);
  });

  it('updates status to ready', () => {
    const created = embeddingRepo.create({
      chunkId,
      modelId: 'model-1',
      dimensions: 768,
    });
    const updated = embeddingRepo.updateStatus(created.id, EmbeddingStatus.READY);
    expect(updated.status).toBe(EmbeddingStatus.READY);
    expect(updated.generatedAt).toBeDefined();
  });

  it('updates status to failed', () => {
    const created = embeddingRepo.create({
      chunkId,
      modelId: 'model-1',
      dimensions: 768,
    });
    const updated = embeddingRepo.updateStatus(created.id, EmbeddingStatus.FAILED);
    expect(updated.status).toBe(EmbeddingStatus.FAILED);
  });

  it('throws when updating unknown embedding', () => {
    expect(() =>
      embeddingRepo.updateStatus('01ARZ3NDEKTSV4RRFFQ69G5FAV', EmbeddingStatus.READY),
    ).toThrow('Cannot update unknown embedding metadata');
  });
});
