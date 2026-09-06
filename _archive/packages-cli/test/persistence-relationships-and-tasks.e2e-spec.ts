import { Test, TestingModule } from '@nestjs/testing';
import {
  ArtifactRepository,
  PersistenceModule,
  RelationshipRepository,
  SourceRepository,
  TaskAssociationRepository,
} from '../src/persistence/index.js';
import { createContentHash } from '../src/shared/primitives.js';
import type { Ulid } from '../src/shared/primitives.js';

/**
 * Relationship graph (D4) and task association (D5) behavior through the
 * DI-hosted repository layer: bidirectional traversal, multi-hop
 * recursive traversal (D9 candidate B), and forward/reverse task queries.
 */
describe('Relationship graph and task associations (e2e)', () => {
  let moduleRef: TestingModule;
  let sourceRepository: SourceRepository;
  let artifactRepository: ArtifactRepository;
  let relationshipRepository: RelationshipRepository;
  let taskAssociationRepository: TaskAssociationRepository;
  let sourceId: Ulid;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    sourceRepository = moduleRef.get(SourceRepository);
    artifactRepository = moduleRef.get(ArtifactRepository);
    relationshipRepository = moduleRef.get(RelationshipRepository);
    taskAssociationRepository = moduleRef.get(TaskAssociationRepository);

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

  function artifact(content: string) {
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

  it('creates a relationship and traverses it bidirectionally (D4)', () => {
    const a = artifact('A');
    const b = artifact('B');

    const relationship = relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'references',
      metadata: { note: 'A cites B' },
    });

    expect(relationshipRepository.findOutgoing(a.id)).toEqual([relationship]);
    expect(relationshipRepository.findIncoming(b.id)).toEqual([relationship]);
    expect(relationshipRepository.findOutgoing(b.id)).toEqual([]);
    expect(relationshipRepository.findIncoming(a.id)).toEqual([]);
  });

  it('filters outgoing/incoming relationships by type', () => {
    const a = artifact('A');
    const b = artifact('B');
    const c = artifact('C');

    relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'references',
    });
    relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: c.id,
      relationshipType: 'derives_from',
    });

    expect(
      relationshipRepository.findOutgoing(a.id, 'references'),
    ).toHaveLength(1);
    expect(
      relationshipRepository.findOutgoing(a.id, 'derives_from'),
    ).toHaveLength(1);
    expect(relationshipRepository.findOutgoing(a.id)).toHaveLength(2);
    expect(
      relationshipRepository.findIncoming(c.id, 'derives_from'),
    ).toHaveLength(1);
  });

  it('accepts an application-layer relationship type outside the documented known set (D4 extensibility)', () => {
    const a = artifact('A');
    const b = artifact('B');

    const relationship = relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'custom_relation_type',
    });

    expect(relationship.relationshipType).toBe('custom_relation_type');
  });

  it('traverses a multi-hop chain via the recursive CTE (D9 candidate B)', () => {
    const a = artifact('A');
    const b = artifact('B');
    const c = artifact('C');
    const d = artifact('D');

    relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'references',
    });
    relationshipRepository.create({
      sourceArtifactId: b.id,
      targetArtifactId: c.id,
      relationshipType: 'references',
    });
    relationshipRepository.create({
      sourceArtifactId: c.id,
      targetArtifactId: d.id,
      relationshipType: 'references',
    });

    const traversal = relationshipRepository.traverse(a.id, 5);

    expect(traversal.map((node) => node.artifactId)).toEqual([
      b.id,
      c.id,
      d.id,
    ]);
    expect(traversal.map((node) => node.depth)).toEqual([1, 2, 3]);
  });

  it('respects maxDepth and stops before the full chain', () => {
    const a = artifact('A');
    const b = artifact('B');
    const c = artifact('C');

    relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'references',
    });
    relationshipRepository.create({
      sourceArtifactId: b.id,
      targetArtifactId: c.id,
      relationshipType: 'references',
    });

    const traversal = relationshipRepository.traverse(a.id, 1);

    expect(traversal.map((node) => node.artifactId)).toEqual([b.id]);
  });

  it('terminates on a relationship cycle instead of recursing infinitely', () => {
    const a = artifact('A');
    const b = artifact('B');

    relationshipRepository.create({
      sourceArtifactId: a.id,
      targetArtifactId: b.id,
      relationshipType: 'references',
    });
    relationshipRepository.create({
      sourceArtifactId: b.id,
      targetArtifactId: a.id,
      relationshipType: 'references',
    });

    const traversal = relationshipRepository.traverse(a.id, 10);

    expect(traversal.length).toBeGreaterThan(0);
    expect(traversal.length).toBeLessThan(20);
  });

  it('returns no traversal results for an artifact with no outgoing relationships', () => {
    const isolated = artifact('isolated');

    expect(relationshipRepository.traverse(isolated.id)).toEqual([]);
  });

  it('associates an artifact with a task and answers both directions (D5)', () => {
    const doc = artifact('doc');

    const association = taskAssociationRepository.create({
      artifactId: doc.id,
      taskId: 'JIRA-123',
      taskProviderType: 'jira',
      associationType: 'discovered_for',
    });

    expect(taskAssociationRepository.findByTask('JIRA-123')).toEqual([
      association,
    ]);
    expect(taskAssociationRepository.findByArtifact(doc.id)).toEqual([
      association,
    ]);
  });

  it('associates one artifact with multiple tasks and one task with multiple artifacts (D5)', () => {
    const docA = artifact('doc-a');
    const docB = artifact('doc-b');

    taskAssociationRepository.create({
      artifactId: docA.id,
      taskId: 'JIRA-1',
      taskProviderType: 'jira',
      associationType: 'discovered_for',
    });
    taskAssociationRepository.create({
      artifactId: docA.id,
      taskId: 'JIRA-2',
      taskProviderType: 'jira',
      associationType: 'referenced_by',
    });
    taskAssociationRepository.create({
      artifactId: docB.id,
      taskId: 'JIRA-1',
      taskProviderType: 'jira',
      associationType: 'produced_by',
    });

    expect(taskAssociationRepository.findByArtifact(docA.id)).toHaveLength(2);
    expect(taskAssociationRepository.findByTask('JIRA-1')).toHaveLength(2);
  });

  it('rejects a malformed relationship input at the repository boundary (Zod validation)', () => {
    const a = artifact('A');
    const b = artifact('B');

    expect(() =>
      relationshipRepository.create({
        sourceArtifactId: a.id,
        targetArtifactId: b.id,
        relationshipType: '',
      }),
    ).toThrow();
  });

  it('rejects a malformed task association input at the repository boundary (Zod validation)', () => {
    const doc = artifact('doc');

    expect(() =>
      taskAssociationRepository.create({
        artifactId: doc.id,
        taskId: 'JIRA-1',
        taskProviderType: 'jira',
        associationType: 'not-a-real-type' as never,
      }),
    ).toThrow();
  });
});
