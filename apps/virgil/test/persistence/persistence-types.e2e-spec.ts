import {
  timestampToIso,
  isoToTimestamp,
  nowIso,
  LifecycleState,
  LifecycleStateSchema,
  SourceSchema,
  CreateSourceInputSchema,
  ArtifactSchema,
  CreateArtifactInputSchema,
  ChunkSchema,
  ChunkContentInputSchema,
  EmbeddingStatus,
  EmbeddingStatusSchema,
  EmbeddingMetaSchema,
  CreateEmbeddingMetaInputSchema,
  RelationshipSchema,
  CreateRelationshipInputSchema,
  TaskAssociationType,
  TaskAssociationTypeSchema,
  TaskAssociationSchema,
  CreateTaskAssociationInputSchema,
  IngestArtifactInputSchema,
  RecordSourceFetchInputSchema,
  CreateProvenanceRecordInputSchema,
  RELATIONSHIP_TYPES,
} from '../../src/persistence/persistence.types.js';
import type { Timestamp } from '../../src/shared/primitives.js';
import { createContentHash, createUlid } from '../../src/shared/primitives.js';

describe('persistence types', () => {
  describe('timestampToIso / isoToTimestamp', () => {
    it('round-trips a timestamp through ISO', () => {
      const ts = Date.now() as Timestamp;
      const iso = timestampToIso(ts);
      const back = isoToTimestamp(iso);
      expect(back).toBe(ts);
    });

    it('produces a valid ISO-8601 string', () => {
      const iso = timestampToIso(1_700_000_000_000 as Timestamp);
      expect(new Date(iso).toISOString()).toBe(iso);
    });
  });

  describe('nowIso', () => {
    it('returns an ISO string close to Date.now()', () => {
      const before = Date.now();
      const iso = nowIso();
      const after = Date.now();
      const parsed = new Date(iso).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });

  describe('LifecycleState', () => {
    it('has three states', () => {
      expect(LifecycleState.HOT).toBe('hot');
      expect(LifecycleState.WARM).toBe('warm');
      expect(LifecycleState.COLD).toBe('cold');
    });

    it('validates via schema', () => {
      expect(LifecycleStateSchema.safeParse('hot').success).toBe(true);
      expect(LifecycleStateSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('SourceSchema', () => {
    it('accepts a valid source', () => {
      const result = SourceSchema.safeParse({
        id: createUlid(),
        providerType: 'git',
        providerInstanceId: 'instance-1',
        canonicalUri: 'https://example.com/repo',
        displayName: 'Example Repo',
        isStale: false,
        failureCount: 0,
        refreshIntervalSeconds: 3600,
        discoveredAt: Date.now(),
        updatedAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty providerType', () => {
      const result = CreateSourceInputSchema.safeParse({
        providerType: '',
        providerInstanceId: 'x',
        canonicalUri: 'x',
        displayName: 'x',
        refreshIntervalSeconds: 3600,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ArtifactSchema', () => {
    it('accepts a valid artifact', () => {
      const result = ArtifactSchema.safeParse({
        id: createUlid(),
        sourceId: createUlid(),
        contentHash: createContentHash('test'),
        contentLength: 4,
        mimeType: 'text/plain',
        title: 'Test',
        sourceUri: 'file://test.txt',
        normalizedContent: 'test',
        lifecycleState: 'hot',
        providerId: 'provider-1',
        providerCapability: 'ingest',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('defaults lifecycleState to hot in CreateArtifactInputSchema', () => {
      const result = CreateArtifactInputSchema.parse({
        sourceId: createUlid(),
        contentHash: createContentHash('test'),
        contentLength: 4,
        mimeType: 'text/plain',
        title: 'Test',
        sourceUri: 'file://test.txt',
        normalizedContent: 'test',
        providerId: 'provider-1',
        providerCapability: 'ingest',
      });
      expect(result.lifecycleState).toBe('hot');
    });
  });

  describe('ChunkSchema', () => {
    it('accepts a valid chunk', () => {
      const result = ChunkSchema.safeParse({
        id: createUlid(),
        artifactId: createUlid(),
        contentHash: createContentHash('chunk-content'),
        content: 'chunk-content',
        position: 0,
        startOffset: 0,
        endOffset: 13,
        createdAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('ChunkContentInputSchema omits artifactId', () => {
      const result = ChunkContentInputSchema.safeParse({
        contentHash: createContentHash('chunk'),
        content: 'chunk',
        position: 0,
        startOffset: 0,
        endOffset: 5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('EmbeddingStatus', () => {
    it('has three statuses', () => {
      expect(EmbeddingStatus.PENDING).toBe('pending');
      expect(EmbeddingStatus.READY).toBe('ready');
      expect(EmbeddingStatus.FAILED).toBe('failed');
    });

    it('validates via schema', () => {
      expect(EmbeddingStatusSchema.safeParse('pending').success).toBe(true);
      expect(EmbeddingStatusSchema.safeParse('unknown').success).toBe(false);
    });
  });

  describe('EmbeddingMetaSchema', () => {
    it('accepts valid embedding meta', () => {
      const result = EmbeddingMetaSchema.safeParse({
        id: createUlid(),
        chunkId: createUlid(),
        modelId: 'text-embedding-3-small',
        dimensions: 1536,
        status: 'pending',
      });
      expect(result.success).toBe(true);
    });

    it('defaults status to pending in create input', () => {
      const result = CreateEmbeddingMetaInputSchema.parse({
        chunkId: createUlid(),
        modelId: 'text-embedding-3-small',
        dimensions: 1536,
      });
      expect(result.status).toBe('pending');
    });
  });

  describe('RelationshipSchema', () => {
    it('accepts a valid relationship', () => {
      const result = RelationshipSchema.safeParse({
        id: createUlid(),
        sourceArtifactId: createUlid(),
        targetArtifactId: createUlid(),
        relationshipType: 'references',
        createdAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty relationshipType', () => {
      const result = CreateRelationshipInputSchema.safeParse({
        sourceArtifactId: createUlid(),
        targetArtifactId: createUlid(),
        relationshipType: '',
      });
      expect(result.success).toBe(false);
    });

    it('exports known relationship types', () => {
      expect(RELATIONSHIP_TYPES).toContain('references');
      expect(RELATIONSHIP_TYPES).toContain('derives_from');
      expect(RELATIONSHIP_TYPES.length).toBe(5);
    });
  });

  describe('TaskAssociationType', () => {
    it('has three types', () => {
      expect(TaskAssociationType.DISCOVERED_FOR).toBe('discovered_for');
      expect(TaskAssociationType.REFERENCED_BY).toBe('referenced_by');
      expect(TaskAssociationType.PRODUCED_BY).toBe('produced_by');
    });

    it('validates via schema', () => {
      expect(
        TaskAssociationTypeSchema.safeParse('discovered_for').success,
      ).toBe(true);
      expect(TaskAssociationTypeSchema.safeParse('invalid').success).toBe(
        false,
      );
    });
  });

  describe('TaskAssociationSchema', () => {
    it('accepts a valid task association', () => {
      const result = TaskAssociationSchema.safeParse({
        id: createUlid(),
        artifactId: createUlid(),
        taskId: 'TASK-123',
        taskProviderType: 'jira',
        associationType: 'discovered_for',
        createdAt: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty taskId in create input', () => {
      const result = CreateTaskAssociationInputSchema.safeParse({
        artifactId: createUlid(),
        taskId: '',
        taskProviderType: 'jira',
        associationType: 'discovered_for',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RecordSourceFetchInputSchema', () => {
    it('accepts a valid fetch input', () => {
      const result = RecordSourceFetchInputSchema.safeParse({
        id: createUlid(),
        contentHash: createContentHash('content'),
        contentLength: 7,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateProvenanceRecordInputSchema', () => {
    it('accepts a valid provenance input', () => {
      const result = CreateProvenanceRecordInputSchema.safeParse({
        artifactId: createUlid(),
        sourceId: createUlid(),
        sourceUri: 'https://example.com',
        fetchedBy: 'git-provider',
        contentHashAtFetch: createContentHash('data'),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('IngestArtifactInputSchema', () => {
    it('defaults optional arrays to empty', () => {
      const result = IngestArtifactInputSchema.parse({
        artifact: {
          sourceId: createUlid(),
          contentHash: createContentHash('test'),
          contentLength: 4,
          mimeType: 'text/plain',
          title: 'Test',
          sourceUri: 'file://test.txt',
          normalizedContent: 'test',
          providerId: 'p1',
          providerCapability: 'ingest',
        },
        provenance: {
          sourceId: createUlid(),
          sourceUri: 'file://test.txt',
          fetchedBy: 'test-provider',
          contentHashAtFetch: createContentHash('test'),
        },
      });
      expect(result.chunks).toEqual([]);
      expect(result.relationships).toEqual([]);
      expect(result.taskAssociations).toEqual([]);
    });
  });
});
