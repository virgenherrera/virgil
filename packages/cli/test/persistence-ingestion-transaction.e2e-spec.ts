import { Test, TestingModule } from '@nestjs/testing';
import {
  ArtifactRepository,
  ChunkRepository,
  IngestionRepository,
  PersistenceModule,
  ProvenanceRepository,
  RelationshipRepository,
  SourceRepository,
  TaskAssociationRepository,
} from '../src/persistence/index.js';
import { createContentHash, createUlid } from '../src/shared/primitives.js';
import type { Ulid } from '../src/shared/primitives.js';

/**
 * Atomic multi-table ingestion (D8, the content ingestion lifecycle's
 * "atomic multi-table writes" invariant) through `IngestionRepository`:
 * artifact + provenance + chunks + relationships + task associations
 * committed as a single `better-sqlite3` transaction, and rolled back
 * entirely on partial failure.
 */
describe('Ingestion transaction atomicity (e2e)', () => {
  let moduleRef: TestingModule;
  let sourceRepository: SourceRepository;
  let artifactRepository: ArtifactRepository;
  let provenanceRepository: ProvenanceRepository;
  let chunkRepository: ChunkRepository;
  let relationshipRepository: RelationshipRepository;
  let taskAssociationRepository: TaskAssociationRepository;
  let ingestionRepository: IngestionRepository;
  let sourceId: Ulid;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    sourceRepository = moduleRef.get(SourceRepository);
    artifactRepository = moduleRef.get(ArtifactRepository);
    provenanceRepository = moduleRef.get(ProvenanceRepository);
    chunkRepository = moduleRef.get(ChunkRepository);
    relationshipRepository = moduleRef.get(RelationshipRepository);
    taskAssociationRepository = moduleRef.get(TaskAssociationRepository);
    ingestionRepository = moduleRef.get(IngestionRepository);

    const source = sourceRepository.findOrCreate({
      providerType: 'filesystem',
      providerInstanceId: 'local-1',
      canonicalUri: '/repo',
      displayName: 'repo',
      refreshIntervalSeconds: 3600,
    });
    sourceId = source.id;
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  function existingArtifact(content: string) {
    return artifactRepository.findOrCreate({
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: content,
      sourceUri: `/repo/${content}.txt`,
      normalizedContent: content,
      providerId: 'local-indexer',
      providerCapability: 'knowledge',
    }).artifact;
  }

  it('commits artifact + provenance + chunks + relationships + task associations atomically', () => {
    const target = existingArtifact('related doc');
    const content = 'brand new document body';

    const result = ingestionRepository.ingest({
      artifact: {
        sourceId,
        contentHash: createContentHash(content),
        contentLength: content.length,
        mimeType: 'text/plain',
        title: 'New Document',
        sourceUri: '/repo/new-document.txt',
        normalizedContent: content,
        providerId: 'local-indexer',
        providerCapability: 'knowledge',
      },
      provenance: {
        sourceId,
        sourceUri: '/repo/new-document.txt',
        fetchedBy: 'local-indexer',
        contentHashAtFetch: createContentHash(content),
      },
      chunks: [
        {
          contentHash: createContentHash('chunk-a'),
          content: 'chunk-a',
          position: 0,
          startOffset: 0,
          endOffset: 7,
        },
      ],
      relationships: [
        { targetArtifactId: target.id, relationshipType: 'references' },
      ],
      taskAssociations: [
        {
          taskId: 'JIRA-1',
          taskProviderType: 'jira',
          associationType: 'discovered_for',
        },
      ],
    });

    expect(result.artifact.id).toBeDefined();
    expect(result.chunks).toHaveLength(1);
    expect(result.relationships).toHaveLength(1);
    expect(result.taskAssociations).toHaveLength(1);

    expect(
      provenanceRepository.listByArtifact(result.artifact.id),
    ).toHaveLength(1);
    expect(chunkRepository.listByArtifact(result.artifact.id)).toHaveLength(1);
    expect(
      relationshipRepository.findOutgoing(result.artifact.id),
    ).toHaveLength(1);
    expect(
      taskAssociationRepository.findByArtifact(result.artifact.id),
    ).toHaveLength(1);
  });

  it('skips re-inserting chunks on a cache hit but still records provenance (lifecycle invariant)', () => {
    const content = 'stable content';
    const firstIngest = ingestionRepository.ingest({
      artifact: {
        sourceId,
        contentHash: createContentHash(content),
        contentLength: content.length,
        mimeType: 'text/plain',
        title: 'Doc',
        sourceUri: '/repo/doc.txt',
        normalizedContent: content,
        providerId: 'local-indexer',
        providerCapability: 'knowledge',
      },
      provenance: {
        sourceId,
        sourceUri: '/repo/doc.txt',
        fetchedBy: 'local-indexer',
        contentHashAtFetch: createContentHash(content),
      },
      chunks: [
        {
          contentHash: createContentHash('chunk-a'),
          content: 'chunk-a',
          position: 0,
          startOffset: 0,
          endOffset: 7,
        },
      ],
    });

    const secondIngest = ingestionRepository.ingest({
      artifact: {
        sourceId,
        contentHash: createContentHash(content),
        contentLength: content.length,
        mimeType: 'text/plain',
        title: 'Doc',
        sourceUri: '/repo/doc.txt',
        normalizedContent: content,
        providerId: 'local-indexer',
        providerCapability: 'knowledge',
      },
      provenance: {
        sourceId,
        sourceUri: '/repo/doc.txt',
        fetchedBy: 'local-indexer',
        contentHashAtFetch: createContentHash(content),
      },
      chunks: [
        {
          contentHash: createContentHash('chunk-a-would-be-recomputed'),
          content: 'chunk-a-would-be-recomputed',
          position: 0,
          startOffset: 0,
          endOffset: 7,
        },
      ],
    });

    expect(secondIngest.artifact.id).toBe(firstIngest.artifact.id);
    expect(secondIngest.chunks).toEqual([]);
    expect(
      chunkRepository.listByArtifact(secondIngest.artifact.id),
    ).toHaveLength(1);
    expect(
      provenanceRepository.listByArtifact(secondIngest.artifact.id),
    ).toHaveLength(2);
  });

  it('rolls back the entire transaction when one write in the batch violates a foreign key', () => {
    const content = 'will not survive';
    const artifactCountBefore = artifactRepository.count();
    // A freshly generated, well-formed ULID that was never inserted, so
    // the failure is a genuine SQLite foreign-key constraint violation,
    // not a Zod rejection before the transaction even starts.
    const nonExistentArtifactId = createUlid();

    expect(() =>
      ingestionRepository.ingest({
        artifact: {
          sourceId,
          contentHash: createContentHash(content),
          contentLength: content.length,
          mimeType: 'text/plain',
          title: 'Doc',
          sourceUri: '/repo/doc.txt',
          normalizedContent: content,
          providerId: 'local-indexer',
          providerCapability: 'knowledge',
        },
        provenance: {
          sourceId,
          sourceUri: '/repo/doc.txt',
          fetchedBy: 'local-indexer',
          contentHashAtFetch: createContentHash(content),
        },
        chunks: [],
        relationships: [
          {
            targetArtifactId: nonExistentArtifactId,
            relationshipType: 'references',
          },
        ],
      }),
    ).toThrow();

    expect(artifactRepository.count()).toBe(artifactCountBefore);
    expect(
      artifactRepository.findByContentHash(createContentHash(content)),
    ).toBeUndefined();
  });
});
