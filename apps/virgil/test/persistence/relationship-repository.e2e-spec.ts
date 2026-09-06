import type { TestingModule } from '@nestjs/testing';
import { RelationshipRepository } from '../../src/persistence/repositories/relationship.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('RelationshipRepository', () => {
  let module: TestingModule;
  let relRepo: RelationshipRepository;
  let artifactA: string;
  let artifactB: string;
  let artifactC: string;

  beforeEach(async () => {
    module = await createTestModule();
    relRepo = module.get(RelationshipRepository);
    const sourceRepo = module.get(SourceRepository);
    const artifactRepo = module.get(ArtifactRepository);

    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com',
      displayName: 'Source',
      refreshIntervalSeconds: 3600,
    });

    const makeArtifact = (hash: string) =>
      artifactRepo.insert({
        sourceId: source.id,
        contentHash: createContentHash(hash),
        contentLength: hash.length,
        mimeType: 'text/plain',
        title: hash,
        sourceUri: `file://${hash}`,
        normalizedContent: hash,
        providerId: 'p1',
        providerCapability: 'ingest',
      });

    artifactA = makeArtifact('artifact-a').id;
    artifactB = makeArtifact('artifact-b').id;
    artifactC = makeArtifact('artifact-c').id;
  });

  afterEach(async () => {
    await module.close();
  });

  it('creates a relationship', () => {
    const rel = relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });
    expect(rel.sourceArtifactId).toBe(artifactA);
    expect(rel.targetArtifactId).toBe(artifactB);
    expect(rel.relationshipType).toBe('references');
  });

  it('creates a relationship with metadata', () => {
    const rel = relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
      metadata: { context: 'import statement' },
    });
    expect(rel.metadata).toEqual({ context: 'import statement' });
  });

  it('finds outgoing relationships', () => {
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactC,
      relationshipType: 'derives_from',
    });

    const all = relRepo.findOutgoing(artifactA);
    expect(all.length).toBe(2);

    const filtered = relRepo.findOutgoing(artifactA, 'references');
    expect(filtered.length).toBe(1);
    expect(filtered[0].targetArtifactId).toBe(artifactB);
  });

  it('finds incoming relationships', () => {
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });

    const incoming = relRepo.findIncoming(artifactB);
    expect(incoming.length).toBe(1);
    expect(incoming[0].sourceArtifactId).toBe(artifactA);
  });

  it('traverses multi-hop relationships', () => {
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });
    relRepo.create({
      sourceArtifactId: artifactB,
      targetArtifactId: artifactC,
      relationshipType: 'derives_from',
    });

    const nodes = relRepo.traverse(artifactA, 3);
    expect(nodes.length).toBe(2);
    expect(nodes[0].artifactId).toBe(artifactB);
    expect(nodes[0].depth).toBe(1);
    expect(nodes[1].artifactId).toBe(artifactC);
    expect(nodes[1].depth).toBe(2);
  });

  it('traversal respects maxDepth', () => {
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });
    relRepo.create({
      sourceArtifactId: artifactB,
      targetArtifactId: artifactC,
      relationshipType: 'references',
    });

    const nodes = relRepo.traverse(artifactA, 1);
    expect(nodes.length).toBe(1);
    expect(nodes[0].artifactId).toBe(artifactB);
  });

  it('traversal handles cycles without infinite recursion', () => {
    relRepo.create({
      sourceArtifactId: artifactA,
      targetArtifactId: artifactB,
      relationshipType: 'references',
    });
    relRepo.create({
      sourceArtifactId: artifactB,
      targetArtifactId: artifactA,
      relationshipType: 'references',
    });

    const nodes = relRepo.traverse(artifactA, 10);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes.length).toBeLessThanOrEqual(10);
  });
});
