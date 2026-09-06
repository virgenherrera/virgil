import type { TestingModule } from '@nestjs/testing';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('ChunkRepository', () => {
  let module: TestingModule;
  let chunkRepo: ChunkRepository;
  let artifactId: string;

  beforeEach(async () => {
    module = await createTestModule();
    chunkRepo = module.get(ChunkRepository);
    const sourceRepo = module.get(SourceRepository);
    const artifactRepo = module.get(ArtifactRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com',
      displayName: 'Source',
      refreshIntervalSeconds: 3600,
    });
    const artifact = artifactRepo.insert({
      sourceId: source.id,
      contentHash: createContentHash('artifact-content'),
      contentLength: 16,
      mimeType: 'text/plain',
      title: 'Test',
      sourceUri: 'file://test.txt',
      normalizedContent: 'artifact-content',
      providerId: 'p1',
      providerCapability: 'ingest',
    });
    artifactId = artifact.id;
  });

  afterEach(async () => {
    await module.close();
  });

  it('inserts many chunks atomically', () => {
    const chunks = chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 7,
      },
      {
        contentHash: createContentHash('chunk-1'),
        content: 'chunk-1',
        position: 1,
        startOffset: 7,
        endOffset: 14,
      },
    ]);
    expect(chunks.length).toBe(2);
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
  });

  it('returns empty array for empty input', () => {
    const result = chunkRepo.insertMany(artifactId, []);
    expect(result).toEqual([]);
  });

  it('finds chunk by id', () => {
    const [inserted] = chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 7,
      },
    ]);
    const found = chunkRepo.findById(inserted.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe('chunk-0');
  });

  it('lists chunks by artifact in position order', () => {
    chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('c0'),
        content: 'c0',
        position: 0,
        startOffset: 0,
        endOffset: 2,
      },
      {
        contentHash: createContentHash('c1'),
        content: 'c1',
        position: 1,
        startOffset: 2,
        endOffset: 4,
      },
    ]);
    const list = chunkRepo.listByArtifact(artifactId);
    expect(list.length).toBe(2);
    expect(list[0].position).toBe(0);
    expect(list[1].position).toBe(1);
  });

  it('deletes chunks by artifact', () => {
    chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('c0'),
        content: 'c0',
        position: 0,
        startOffset: 0,
        endOffset: 2,
      },
    ]);
    const deleted = chunkRepo.deleteByArtifact(artifactId);
    expect(deleted).toBe(1);
    expect(chunkRepo.count()).toBe(0);
  });

  it('preserves chunk metadata through JSON round-trip', () => {
    const [inserted] = chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('c0'),
        content: 'c0',
        position: 0,
        startOffset: 0,
        endOffset: 2,
        metadata: { heading: 'Section 1', depth: 1 },
      },
    ]);
    const found = chunkRepo.findById(inserted.id);
    expect(found!.metadata).toEqual({ heading: 'Section 1', depth: 1 });
  });

  it('counts chunks', () => {
    expect(chunkRepo.count()).toBe(0);
    chunkRepo.insertMany(artifactId, [
      {
        contentHash: createContentHash('c0'),
        content: 'c0',
        position: 0,
        startOffset: 0,
        endOffset: 2,
      },
    ]);
    expect(chunkRepo.count()).toBe(1);
  });
});
