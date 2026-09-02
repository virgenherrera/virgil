import { Test, TestingModule } from '@nestjs/testing';
import {
  ArtifactRepository,
  PersistenceModule,
  SourceRepository,
} from '../src/persistence/index.js';
import { createContentHash } from '../src/shared/primitives.js';
import type { Ulid } from '../src/shared/primitives.js';

/**
 * Content-addressed deduplication (D3): identical content resolves to the
 * same artifact (cache hit), different content creates a new artifact,
 * and a content-hash collision with a mismatched length is rejected
 * rather than silently reused.
 */
describe('Content-hash deduplication (e2e)', () => {
  let moduleRef: TestingModule;
  let sourceRepository: SourceRepository;
  let artifactRepository: ArtifactRepository;
  let sourceId: Ulid;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    sourceRepository = moduleRef.get(SourceRepository);
    artifactRepository = moduleRef.get(ArtifactRepository);

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

  function artifactInput(content: string) {
    return {
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: 'doc',
      sourceUri: '/repo/doc.txt',
      normalizedContent: content,
      providerId: 'local-indexer',
      providerCapability: 'knowledge',
    };
  }

  it('is a cache miss the first time identical content is ingested', () => {
    const result = artifactRepository.findOrCreate(
      artifactInput('identical content'),
    );

    expect(result.cacheHit).toBe(false);
    expect(artifactRepository.count()).toBe(1);
  });

  it('is a cache hit — reuses the existing artifact — on identical content re-ingestion', () => {
    const first = artifactRepository.findOrCreate(
      artifactInput('identical content'),
    );
    const second = artifactRepository.findOrCreate(
      artifactInput('identical content'),
    );

    expect(second.cacheHit).toBe(true);
    expect(second.artifact.id).toBe(first.artifact.id);
    expect(artifactRepository.count()).toBe(1);
  });

  it('creates a new artifact when content differs (different hash)', () => {
    artifactRepository.findOrCreate(artifactInput('content A'));
    const result = artifactRepository.findOrCreate(artifactInput('content B'));

    expect(result.cacheHit).toBe(false);
    expect(artifactRepository.count()).toBe(2);
  });

  it('looks up an artifact directly by content hash', () => {
    const { artifact } = artifactRepository.findOrCreate(
      artifactInput('lookup me'),
    );

    expect(artifactRepository.findByContentHash(artifact.contentHash)).toEqual(
      artifact,
    );
  });

  it('treats a hash collision with a mismatched content length as an error, not a cache hit (D3)', () => {
    const input = artifactInput('original content');
    artifactRepository.findOrCreate(input);

    expect(() =>
      artifactRepository.findOrCreate({
        ...input,
        contentLength: input.contentLength + 1,
      }),
    ).toThrow(/collision/i);
  });
});
