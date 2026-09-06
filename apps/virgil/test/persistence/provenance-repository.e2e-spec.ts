import type { TestingModule } from '@nestjs/testing';
import { ProvenanceRepository } from '../../src/persistence/repositories/provenance.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('ProvenanceRepository', () => {
  let module: TestingModule;
  let provenanceRepo: ProvenanceRepository;
  let sourceId: string;
  let artifactId: string;

  beforeEach(async () => {
    module = await createTestModule();
    provenanceRepo = module.get(ProvenanceRepository);
    const sourceRepo = module.get(SourceRepository);
    const artifactRepo = module.get(ArtifactRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com',
      displayName: 'Source',
      refreshIntervalSeconds: 3600,
    });
    sourceId = source.id;

    const artifact = artifactRepo.insert({
      sourceId,
      contentHash: createContentHash('artifact'),
      contentLength: 8,
      mimeType: 'text/plain',
      title: 'Test',
      sourceUri: 'file://test.txt',
      normalizedContent: 'artifact',
      providerId: 'p1',
      providerCapability: 'ingest',
    });
    artifactId = artifact.id;
  });

  afterEach(async () => {
    await module.close();
  });

  it('creates a provenance record', () => {
    const record = provenanceRepo.create({
      artifactId,
      sourceId,
      sourceUri: 'https://example.com/file.md',
      fetchedBy: 'git-provider',
      contentHashAtFetch: createContentHash('artifact'),
    });
    expect(record.artifactId).toBe(artifactId);
    expect(record.sourceUri).toBe('https://example.com/file.md');
    expect(record.fetchedBy).toBe('git-provider');
    expect(record.fetchedAt).toBeDefined();
  });

  it('lists by artifact', () => {
    provenanceRepo.create({
      artifactId,
      sourceId,
      sourceUri: 'uri-1',
      fetchedBy: 'provider-1',
      contentHashAtFetch: createContentHash('data'),
    });
    provenanceRepo.create({
      artifactId,
      sourceId,
      sourceUri: 'uri-2',
      fetchedBy: 'provider-2',
      contentHashAtFetch: createContentHash('data'),
    });

    const records = provenanceRepo.listByArtifact(artifactId);
    expect(records.length).toBe(2);
  });

  it('lists by source', () => {
    provenanceRepo.create({
      artifactId,
      sourceId,
      sourceUri: 'uri-1',
      fetchedBy: 'provider-1',
      contentHashAtFetch: createContentHash('data'),
    });

    const records = provenanceRepo.listBySource(sourceId);
    expect(records.length).toBe(1);
  });
});
