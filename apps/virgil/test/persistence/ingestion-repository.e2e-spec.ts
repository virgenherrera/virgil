import type { TestingModule } from '@nestjs/testing';
import { IngestionRepository } from '../../src/persistence/repositories/ingestion.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { ChunkRepository } from '../../src/persistence/repositories/chunk.repository.js';
import { ProvenanceRepository } from '../../src/persistence/repositories/provenance.repository.js';
import { RelationshipRepository } from '../../src/persistence/repositories/relationship.repository.js';
import { TaskAssociationRepository } from '../../src/persistence/repositories/task-association.repository.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('IngestionRepository', () => {
  let module: TestingModule;
  let ingestionRepo: IngestionRepository;
  let sourceRepo: SourceRepository;
  let artifactRepo: ArtifactRepository;
  let chunkRepo: ChunkRepository;
  let provenanceRepo: ProvenanceRepository;
  let sourceId: string;

  beforeEach(async () => {
    module = await createTestModule();
    ingestionRepo = module.get(IngestionRepository);
    sourceRepo = module.get(SourceRepository);
    artifactRepo = module.get(ArtifactRepository);
    chunkRepo = module.get(ChunkRepository);
    provenanceRepo = module.get(ProvenanceRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com',
      displayName: 'Source',
      refreshIntervalSeconds: 3600,
    });
    sourceId = source.id;
  });

  afterEach(async () => {
    await module.close();
  });

  const contentHash = createContentHash('test-content');

  const ingestionInput = (overrides: Record<string, unknown> = {}) => ({
    artifact: {
      sourceId,
      contentHash,
      contentLength: 12,
      mimeType: 'text/plain',
      title: 'Test Artifact',
      sourceUri: 'file://test.txt',
      normalizedContent: 'test-content',
      providerId: 'provider-1',
      providerCapability: 'ingest',
      ...overrides,
    },
    provenance: {
      sourceId,
      sourceUri: 'file://test.txt',
      fetchedBy: 'git-provider',
      contentHashAtFetch: contentHash,
    },
    chunks: [
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
    ],
  });

  it('atomically creates artifact, provenance, and chunks', () => {
    const result = ingestionRepo.ingest(ingestionInput());

    expect(result.artifact.title).toBe('Test Artifact');
    expect(result.provenance.fetchedBy).toBe('git-provider');
    expect(result.chunks.length).toBe(2);

    expect(artifactRepo.count()).toBe(1);
    expect(chunkRepo.count()).toBe(2);
    expect(provenanceRepo.listByArtifact(result.artifact.id).length).toBe(1);
  });

  it('skips chunk insertion on cache hit', () => {
    const first = ingestionRepo.ingest(ingestionInput());
    const second = ingestionRepo.ingest(ingestionInput());

    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.chunks.length).toBe(0);
    expect(chunkRepo.count()).toBe(2);
    expect(provenanceRepo.listByArtifact(first.artifact.id).length).toBe(2);
  });

  it('includes relationships in the transaction', () => {
    const otherArtifact = artifactRepo.insert({
      sourceId,
      contentHash: createContentHash('other'),
      contentLength: 5,
      mimeType: 'text/plain',
      title: 'Other',
      sourceUri: 'file://other.txt',
      normalizedContent: 'other',
      providerId: 'p1',
      providerCapability: 'ingest',
    });

    const result = ingestionRepo.ingest({
      ...ingestionInput({
        contentHash: createContentHash('with-relationships'),
        contentLength: 18,
      }),
      relationships: [
        {
          targetArtifactId: otherArtifact.id,
          relationshipType: 'references',
        },
      ],
    });

    expect(result.relationships.length).toBe(1);
    expect(result.relationships[0].targetArtifactId).toBe(otherArtifact.id);
  });

  it('includes task associations in the transaction', () => {
    const result = ingestionRepo.ingest({
      ...ingestionInput({
        contentHash: createContentHash('with-tasks'),
        contentLength: 10,
      }),
      taskAssociations: [
        {
          taskId: 'TASK-1',
          taskProviderType: 'jira',
          associationType: 'discovered_for' as const,
        },
      ],
    });

    expect(result.taskAssociations.length).toBe(1);
    expect(result.taskAssociations[0].taskId).toBe('TASK-1');
  });

  it('defaults optional arrays to empty', () => {
    const result = ingestionRepo.ingest({
      artifact: {
        sourceId,
        contentHash: createContentHash('minimal'),
        contentLength: 7,
        mimeType: 'text/plain',
        title: 'Minimal',
        sourceUri: 'file://min.txt',
        normalizedContent: 'minimal',
        providerId: 'p1',
        providerCapability: 'ingest',
      },
      provenance: {
        sourceId,
        sourceUri: 'file://min.txt',
        fetchedBy: 'provider',
        contentHashAtFetch: createContentHash('minimal'),
      },
    });

    expect(result.chunks).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.taskAssociations).toEqual([]);
  });
});
