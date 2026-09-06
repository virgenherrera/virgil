import type { TestingModule } from '@nestjs/testing';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { createContentHash, createUlid } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('ArtifactRepository', () => {
  let module: TestingModule;
  let artifactRepo: ArtifactRepository;
  let sourceRepo: SourceRepository;
  let sourceId: string;

  beforeEach(async () => {
    module = await createTestModule();
    artifactRepo = module.get(ArtifactRepository);
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

  const artifactInput = (overrides: Record<string, unknown> = {}) => ({
    sourceId,
    contentHash: createContentHash('test-content'),
    contentLength: 12,
    mimeType: 'text/plain',
    title: 'Test Artifact',
    sourceUri: 'file://test.txt',
    normalizedContent: 'test-content',
    providerId: 'provider-1',
    providerCapability: 'ingest',
    ...overrides,
  });

  it('inserts a new artifact', () => {
    const artifact = artifactRepo.insert(artifactInput());
    expect(artifact.title).toBe('Test Artifact');
    expect(artifact.mimeType).toBe('text/plain');
    expect(artifact.lifecycleState).toBe('hot');
    expect(artifact.contentHash).toBe(createContentHash('test-content'));
  });

  it('finds artifact by id', () => {
    const created = artifactRepo.insert(artifactInput());
    const found = artifactRepo.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for unknown id', () => {
    expect(artifactRepo.findById('nonexistent')).toBeUndefined();
  });

  it('finds artifact by content hash', () => {
    const created = artifactRepo.insert(artifactInput());
    const found = artifactRepo.findByContentHash(created.contentHash);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('findOrCreate returns existing on matching hash', () => {
    const first = artifactRepo.insert(artifactInput());
    const result = artifactRepo.findOrCreate(artifactInput());
    expect(result.cacheHit).toBe(true);
    expect(result.artifact.id).toBe(first.id);
  });

  it('findOrCreate creates new when no match', () => {
    const result = artifactRepo.findOrCreate(
      artifactInput({ contentHash: createContentHash('unique') }),
    );
    expect(result.cacheHit).toBe(false);
    expect(result.artifact.title).toBe('Test Artifact');
  });

  it('findOrCreate detects hash collision', () => {
    artifactRepo.insert(artifactInput());
    expect(() =>
      artifactRepo.findOrCreate(
        artifactInput({ contentLength: 999 }),
      ),
    ).toThrow('Content hash collision detected');
  });

  it('updates lifecycle state', () => {
    const created = artifactRepo.insert(artifactInput());
    const updated = artifactRepo.updateLifecycleState(created.id, 'warm');
    expect(updated.lifecycleState).toBe('warm');
  });

  it('throws when updating unknown artifact', () => {
    expect(() =>
      artifactRepo.updateLifecycleState('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'warm'),
    ).toThrow('Cannot update unknown artifact');
  });

  it('lists artifacts by source', () => {
    artifactRepo.insert(artifactInput());
    artifactRepo.insert(
      artifactInput({
        contentHash: createContentHash('another'),
        title: 'Second',
      }),
    );
    const list = artifactRepo.listBySource(sourceId);
    expect(list.length).toBe(2);
  });

  it('counts artifacts', () => {
    expect(artifactRepo.count()).toBe(0);
    artifactRepo.insert(artifactInput());
    expect(artifactRepo.count()).toBe(1);
  });
});
