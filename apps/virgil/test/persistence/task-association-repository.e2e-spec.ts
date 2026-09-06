import type { TestingModule } from '@nestjs/testing';
import { TaskAssociationRepository } from '../../src/persistence/repositories/task-association.repository.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { TaskAssociationType } from '../../src/persistence/persistence.types.js';
import { createContentHash } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('TaskAssociationRepository', () => {
  let module: TestingModule;
  let taskRepo: TaskAssociationRepository;
  let artifactId: string;

  beforeEach(async () => {
    module = await createTestModule();
    taskRepo = module.get(TaskAssociationRepository);
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

  it('creates a task association', () => {
    const assoc = taskRepo.create({
      artifactId,
      taskId: 'TASK-123',
      taskProviderType: 'jira',
      associationType: TaskAssociationType.DISCOVERED_FOR,
    });
    expect(assoc.taskId).toBe('TASK-123');
    expect(assoc.taskProviderType).toBe('jira');
    expect(assoc.associationType).toBe('discovered_for');
  });

  it('finds by task id', () => {
    taskRepo.create({
      artifactId,
      taskId: 'TASK-123',
      taskProviderType: 'jira',
      associationType: TaskAssociationType.DISCOVERED_FOR,
    });
    const found = taskRepo.findByTask('TASK-123');
    expect(found.length).toBe(1);
    expect(found[0].artifactId).toBe(artifactId);
  });

  it('finds by artifact id', () => {
    taskRepo.create({
      artifactId,
      taskId: 'TASK-123',
      taskProviderType: 'jira',
      associationType: TaskAssociationType.DISCOVERED_FOR,
    });
    taskRepo.create({
      artifactId,
      taskId: 'TASK-456',
      taskProviderType: 'github',
      associationType: TaskAssociationType.REFERENCED_BY,
    });

    const found = taskRepo.findByArtifact(artifactId);
    expect(found.length).toBe(2);
  });
});
