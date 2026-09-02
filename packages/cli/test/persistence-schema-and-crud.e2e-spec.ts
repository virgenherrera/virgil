import { Test, TestingModule } from '@nestjs/testing';
import {
  ArtifactRepository,
  ChunkRepository,
  DATABASE_CONNECTION,
  EmbeddingMetaRepository,
  PersistenceModule,
  ProvenanceRepository,
  SourceRepository,
} from '../src/persistence/index.js';
import type { DatabaseConnection } from '../src/persistence/index.js';
import {
  createContentHash,
  createTimestamp,
} from '../src/shared/primitives.js';
import type { Ulid } from '../src/shared/primitives.js';

/**
 * Schema creation/migration (D10) and CRUD (D1, D2, D3) through the
 * DI-hosted repository layer, on a fresh in-memory SQLite database per
 * test. Every repository is resolved through the NestJS container, never
 * constructed directly.
 */
describe('Persistence schema and CRUD (e2e)', () => {
  let moduleRef: TestingModule;
  let connection: DatabaseConnection;
  let sourceRepository: SourceRepository;
  let artifactRepository: ArtifactRepository;
  let provenanceRepository: ProvenanceRepository;
  let chunkRepository: ChunkRepository;
  let embeddingMetaRepository: EmbeddingMetaRepository;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    connection = moduleRef.get(DATABASE_CONNECTION);
    sourceRepository = moduleRef.get(SourceRepository);
    artifactRepository = moduleRef.get(ArtifactRepository);
    provenanceRepository = moduleRef.get(ProvenanceRepository);
    chunkRepository = moduleRef.get(ChunkRepository);
    embeddingMetaRepository = moduleRef.get(EmbeddingMetaRepository);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  function createSource() {
    return sourceRepository.findOrCreate({
      providerType: 'filesystem',
      providerInstanceId: 'local-1',
      canonicalUri: '/repo/README.md',
      displayName: 'README',
      refreshIntervalSeconds: 3600,
    });
  }

  function createArtifact(sourceId: Ulid, content = 'hello world') {
    const { artifact } = artifactRepository.findOrCreate({
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: 'README',
      sourceUri: '/repo/README.md',
      normalizedContent: content,
      providerId: 'local-indexer',
      providerCapability: 'knowledge',
    });
    return artifact;
  }

  it('applies migrations on a fresh database, creating every D1 table', () => {
    const tableNames = connection.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();

    expect(tableNames).toEqual(
      [
        'artifacts',
        'chunks',
        'embedding_meta',
        'provenance_records',
        'relationships',
        'sources',
        'task_associations',
      ].sort(),
    );
  });

  it('creates a source and resolves it back by its stable identity triple (D2)', () => {
    const created = createSource();

    const resolved = sourceRepository.findByIdentity(
      'filesystem',
      'local-1',
      '/repo/README.md',
    );

    expect(resolved).toEqual(created);
    expect(sourceRepository.findById(created.id)).toEqual(created);
  });

  it('resolves the same source record on re-ingestion instead of creating a duplicate (D2)', () => {
    const first = createSource();
    const second = createSource();

    expect(second.id).toBe(first.id);
    expect(sourceRepository.count()).toBe(1);
  });

  it('creates and reads an artifact through the repository layer (D1)', () => {
    const source = createSource();
    const artifact = createArtifact(source.id);

    expect(artifactRepository.findById(artifact.id)).toEqual(artifact);
    expect(artifact.mimeType).toBe('text/plain');
    expect(artifact.lifecycleState).toBe('hot');
  });

  it('lists artifacts by source (D2)', () => {
    const source = createSource();
    createArtifact(source.id, 'content A');
    createArtifact(source.id, 'content B');

    expect(artifactRepository.listBySource(source.id)).toHaveLength(2);
  });

  it('updates an artifact lifecycle state', () => {
    const source = createSource();
    const artifact = createArtifact(source.id);

    const updated = artifactRepository.updateLifecycleState(
      artifact.id,
      'warm',
    );

    expect(updated.lifecycleState).toBe('warm');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(artifact.updatedAt);
  });

  it('throws when updating the lifecycle state of an unknown artifact', () => {
    expect(() =>
      artifactRepository.updateLifecycleState('unknown-id', 'cold'),
    ).toThrow(/unknown artifact/);
  });

  it('records provenance for an artifact and answers "where did this come from?" (D2)', () => {
    const source = createSource();
    const artifact = createArtifact(source.id);

    const record = provenanceRepository.create({
      artifactId: artifact.id,
      sourceId: source.id,
      sourceUri: source.canonicalUri,
      fetchedBy: 'local-indexer',
      contentHashAtFetch: artifact.contentHash,
    });

    expect(provenanceRepository.listByArtifact(artifact.id)).toEqual([record]);
    expect(provenanceRepository.listBySource(source.id)).toEqual([record]);
  });

  it('inserts and lists chunks for an artifact in position order (D1)', () => {
    const source = createSource();
    const artifact = createArtifact(source.id, 'a'.repeat(40));

    const inserted = chunkRepository.insertMany(artifact.id, [
      {
        contentHash: createContentHash('chunk-1'),
        content: 'chunk-1',
        position: 1,
        startOffset: 20,
        endOffset: 40,
      },
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 20,
        metadata: { heading: 'Intro' },
      },
    ]);

    expect(inserted).toHaveLength(2);

    const listed = chunkRepository.listByArtifact(artifact.id);
    expect(listed.map((chunk) => chunk.position)).toEqual([0, 1]);
    expect(listed[0]?.metadata).toEqual({ heading: 'Intro' });
    expect(chunkRepository.count()).toBe(2);
  });

  it('returns an empty array from insertMany without touching the database (D9 candidate A)', () => {
    const source = createSource();
    const artifact = createArtifact(source.id);

    expect(chunkRepository.insertMany(artifact.id, [])).toEqual([]);
    expect(chunkRepository.count()).toBe(0);
  });

  it('finds a single chunk by id', () => {
    const source = createSource();
    const artifact = createArtifact(source.id, 'a'.repeat(20));
    const [inserted] = chunkRepository.insertMany(artifact.id, [
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 10,
      },
    ]);

    expect(chunkRepository.findById(inserted!.id)).toEqual(inserted);
    expect(chunkRepository.findById('unknown-id')).toBeUndefined();
  });

  it('deletes every chunk belonging to an artifact', () => {
    const source = createSource();
    const artifact = createArtifact(source.id, 'a'.repeat(20));
    chunkRepository.insertMany(artifact.id, [
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 10,
      },
    ]);

    const deleted = chunkRepository.deleteByArtifact(artifact.id);

    expect(deleted).toBe(1);
    expect(chunkRepository.listByArtifact(artifact.id)).toEqual([]);
  });

  it('creates embedding metadata for a chunk and updates its status (H07 boundary — identity only)', () => {
    const source = createSource();
    const artifact = createArtifact(source.id, 'a'.repeat(10));
    const [chunk] = chunkRepository.insertMany(artifact.id, [
      {
        contentHash: createContentHash('chunk-0'),
        content: 'chunk-0',
        position: 0,
        startOffset: 0,
        endOffset: 10,
      },
    ]);

    const meta = embeddingMetaRepository.create({
      chunkId: chunk!.id,
      modelId: 'text-embedding-3-small',
      dimensions: 1536,
    });

    expect(meta.status).toBe('pending');
    expect(embeddingMetaRepository.findByChunk(chunk!.id)).toEqual(meta);

    const updated = embeddingMetaRepository.updateStatus(meta.id, 'ready');
    expect(updated.status).toBe('ready');
    expect(updated.generatedAt).toBeDefined();

    const explicitTimestamp = createTimestamp();
    const withExplicitTimestamp = embeddingMetaRepository.updateStatus(
      meta.id,
      'failed',
      explicitTimestamp,
    );
    expect(withExplicitTimestamp.status).toBe('failed');
    expect(withExplicitTimestamp.generatedAt).toBe(explicitTimestamp);
  });

  it('throws when updating the status of unknown embedding metadata', () => {
    expect(() =>
      embeddingMetaRepository.updateStatus('unknown-id', 'ready'),
    ).toThrow(/unknown embedding metadata/);
  });

  it('rejects a malformed source input at the repository boundary (Zod validation)', () => {
    expect(() =>
      sourceRepository.findOrCreate({
        providerType: '',
        providerInstanceId: 'local-1',
        canonicalUri: '/repo/README.md',
        displayName: 'README',
        refreshIntervalSeconds: 3600,
      }),
    ).toThrow();
  });

  it('rejects a malformed artifact input at the repository boundary (Zod validation)', () => {
    const source = createSource();

    expect(() =>
      artifactRepository.insert({
        sourceId: source.id,
        contentHash: 'not-a-valid-hash' as never,
        contentLength: 5,
        mimeType: 'text/plain',
        title: 'x',
        sourceUri: 'x',
        normalizedContent: 'x',
        providerId: 'x',
        providerCapability: 'knowledge',
        lifecycleState: 'hot',
      }),
    ).toThrow();
  });
});
