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
import { createContentHash } from '../src/shared/primitives.js';
import type { Ulid } from '../src/shared/primitives.js';
import {
  CompactionService,
  LifecycleMetricsService,
  LifecycleModule,
  LifecyclePolicyService,
  REHYDRATION_PROVIDER,
  StateTransitionService,
} from '../src/lifecycle/index.js';
import { LifecycleConfigSchema } from '../src/lifecycle/lifecycle-config.schema.js';

/**
 * H15 Knowledge Lifecycle — end-to-end tests covering schema extension,
 * state transitions, policy evaluation, compaction, rehydration failure,
 * transition audit, config validation, and DI wiring.
 */
describe('H15 Knowledge Lifecycle (e2e)', () => {
  let moduleRef: TestingModule;
  let connection: DatabaseConnection;
  let sourceRepo: SourceRepository;
  let artifactRepo: ArtifactRepository;
  let provenanceRepo: ProvenanceRepository;
  let chunkRepo: ChunkRepository;
  let embeddingMetaRepo: EmbeddingMetaRepository;
  let metricsService: LifecycleMetricsService;
  let policyService: LifecyclePolicyService;
  let transitionService: StateTransitionService;
  let compactionService: CompactionService;
  let mockRehydrate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockRehydrate = vi.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      imports: [
        PersistenceModule.forRoot({ databasePath: ':memory:' }),
        LifecycleModule.forRoot({ databasePath: ':memory:' }),
      ],
    })
      .overrideProvider(REHYDRATION_PROVIDER)
      .useValue({ rehydrate: mockRehydrate })
      .compile();

    connection = moduleRef.get(DATABASE_CONNECTION);
    sourceRepo = moduleRef.get(SourceRepository);
    artifactRepo = moduleRef.get(ArtifactRepository);
    provenanceRepo = moduleRef.get(ProvenanceRepository);
    chunkRepo = moduleRef.get(ChunkRepository);
    embeddingMetaRepo = moduleRef.get(EmbeddingMetaRepository);
    metricsService = moduleRef.get(LifecycleMetricsService);
    policyService = moduleRef.get(LifecyclePolicyService);
    transitionService = moduleRef.get(StateTransitionService);
    compactionService = moduleRef.get(CompactionService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // ── Helpers ────────────────────────────────────────────────

  function createSource() {
    return sourceRepo.findOrCreate({
      providerType: 'filesystem',
      providerInstanceId: 'local-1',
      canonicalUri: '/repo/README.md',
      displayName: 'README',
      refreshIntervalSeconds: 3600,
    });
  }

  function createArtifact(sourceId: Ulid, content = 'hello world') {
    const { artifact } = artifactRepo.findOrCreate({
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

  function createArtifactWithChunksAndEmbeddings(
    sourceId: Ulid,
    content = 'test content',
  ) {
    const artifact = createArtifact(sourceId, content);
    const insertedChunks = chunkRepo.insertMany(artifact.id, [
      {
        contentHash: createContentHash(`chunk-0-${content}`),
        content: `chunk-0-${content}`,
        position: 0,
        startOffset: 0,
        endOffset: content.length,
      },
    ]);
    for (const chunk of insertedChunks) {
      embeddingMetaRepo.create({
        chunkId: chunk.id,
        modelId: 'text-embedding-3-small',
        dimensions: 1536,
      });
    }
    return { artifact, chunks: insertedChunks };
  }

  function addProvenance(artifactId: Ulid, sourceId: Ulid) {
    return provenanceRepo.create({
      artifactId,
      sourceId,
      sourceUri: '/repo/README.md',
      fetchedBy: 'local-indexer',
      contentHashAtFetch: createContentHash('provenance-test'),
    });
  }

  // ── D1 — Lifecycle State Schema ───────────────────────────

  describe('D1 — Lifecycle State Schema', () => {
    it('lifecycle_state column exists on artifacts with default hot', () => {
      const source = createSource();
      const artifact = createArtifact(source.id);
      expect(artifact.lifecycleState).toBe('hot');
    });

    it('lifecycle_transitions table exists', () => {
      const tables = connection.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lifecycle_transitions'",
        )
        .all();
      expect(tables).toHaveLength(1);
    });
  });

  // ── D4 — State Transitions ────────────────────────────────

  describe('D4 — State Transitions', () => {
    it('executes Hot -> Warm transition', () => {
      const source = createSource();
      const artifact = createArtifact(source.id);

      const result = transitionService.transition(artifact.id, 'warm');

      expect(result.lifecycleState).toBe('warm');
    });

    it('executes Warm -> Cold transition', () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'warm-to-cold',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');

      const result = transitionService.transition(artifact.id, 'cold');

      expect(result.lifecycleState).toBe('cold');
    });

    it('executes Warm -> Hot transition', () => {
      const source = createSource();
      const artifact = createArtifact(source.id, 'warm-to-hot');
      transitionService.transition(artifact.id, 'warm');

      const result = transitionService.transition(artifact.id, 'hot');

      expect(result.lifecycleState).toBe('hot');
    });

    it('executes Cold -> Warm rehydration', async () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'cold-to-warm',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');
      transitionService.transition(artifact.id, 'cold');

      const result = await transitionService.rehydrate(artifact.id);

      expect(result.lifecycleState).toBe('warm');
    });

    it('throws on direct Hot -> Cold transition', () => {
      const source = createSource();
      const artifact = createArtifact(source.id, 'hot-to-cold');

      expect(() =>
        transitionService.transition(artifact.id, 'cold'),
      ).toThrow(/invalid lifecycle transition.*hot.*cold/i);
    });

    it('throws on direct Cold -> Hot transition', () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'cold-to-hot',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');
      transitionService.transition(artifact.id, 'cold');

      expect(() =>
        transitionService.transition(artifact.id, 'hot'),
      ).toThrow(/invalid lifecycle transition.*cold.*hot/i);
    });
  });

  // ── D3 — Policy Engine ────────────────────────────────────

  describe('D3 — Policy Engine', () => {
    it('produces identical recommendations for identical metrics and config (determinism)', () => {
      const metrics = [
        {
          artifactId: 'a1',
          lifecycleState: 'hot' as const,
          accessCount: 0,
          lastAccessTs: null,
          hasProvenance: true,
          chunkCount: 1,
          embeddingCount: 1,
        },
        {
          artifactId: 'a2',
          lifecycleState: 'hot' as const,
          accessCount: 10,
          lastAccessTs: Date.now(),
          hasProvenance: true,
          chunkCount: 2,
          embeddingCount: 2,
        },
      ];
      const config = LifecycleConfigSchema.parse({});

      const result1 = policyService.evaluate(metrics, config);
      const result2 = policyService.evaluate(metrics, config);

      expect(result1).toEqual(result2);
    });

    it('recommends demotion for low-access artifacts', () => {
      const metrics = [
        {
          artifactId: 'a1',
          lifecycleState: 'hot' as const,
          accessCount: 0,
          lastAccessTs: null,
          hasProvenance: true,
          chunkCount: 1,
          embeddingCount: 1,
        },
        {
          artifactId: 'a2',
          lifecycleState: 'hot' as const,
          accessCount: 100,
          lastAccessTs: Date.now(),
          hasProvenance: true,
          chunkCount: 2,
          embeddingCount: 2,
        },
      ];
      const config = LifecycleConfigSchema.parse({ hot_access_threshold: 5 });

      const recommendations = policyService.evaluate(metrics, config);

      const demoted = recommendations.find((r) => r.artifactId === 'a1');
      expect(demoted).toBeDefined();
      expect(demoted!.recommendedState).toBe('warm');

      const kept = recommendations.find((r) => r.artifactId === 'a2');
      expect(kept).toBeUndefined();
    });

    it('prevents Warm -> Cold demotion for non-reconstructable artifacts', () => {
      const metrics = [
        {
          artifactId: 'a1',
          lifecycleState: 'warm' as const,
          accessCount: 0,
          lastAccessTs: null,
          hasProvenance: false,
          chunkCount: 1,
          embeddingCount: 1,
        },
      ];
      const config = LifecycleConfigSchema.parse({
        warm_access_threshold: 1,
      });

      const recommendations = policyService.evaluate(metrics, config);

      const coldRec = recommendations.find(
        (r) => r.recommendedState === 'cold',
      );
      expect(coldRec).toBeUndefined();
    });
  });

  // ── D5 — Compaction ───────────────────────────────────────

  describe('D5 — Compaction', () => {
    it('deletes chunks and embeddings from Cold artifacts', () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'compaction-delete',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');
      transitionService.transition(artifact.id, 'cold');

      const report = compactionService.compact();

      expect(report.chunksRemoved).toBeGreaterThan(0);
      expect(report.embeddingsRemoved).toBeGreaterThan(0);
      expect(report.artifactsAffected).toBe(1);
      expect(chunkRepo.listByArtifact(artifact.id)).toHaveLength(0);
    });

    it('is idempotent — second run produces no additional changes', () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'compaction-idempotent',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');
      transitionService.transition(artifact.id, 'cold');

      compactionService.compact();
      const secondReport = compactionService.compact();

      expect(secondReport.chunksRemoved).toBe(0);
      expect(secondReport.embeddingsRemoved).toBe(0);
      expect(secondReport.artifactsAffected).toBe(0);
    });

    it('reports correct metrics', () => {
      const source = createSource();
      createArtifactWithChunksAndEmbeddings(source.id, 'compaction-hot');
      const { artifact: cold } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'compaction-cold',
      );
      addProvenance(cold.id, source.id);
      transitionService.transition(cold.id, 'warm');
      transitionService.transition(cold.id, 'cold');

      const report = compactionService.compact();

      expect(report.artifactsAffected).toBe(1);
      expect(report.bytesReclaimed).toBeGreaterThanOrEqual(0);
      expect(report.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── D4 — Rehydration Failure ──────────────────────────────

  describe('D4 — Rehydration Failure', () => {
    it('leaves artifact Cold with error recorded on failed rehydration', async () => {
      const source = createSource();
      const { artifact } = createArtifactWithChunksAndEmbeddings(
        source.id,
        'rehydration-fail',
      );
      addProvenance(artifact.id, source.id);
      transitionService.transition(artifact.id, 'warm');
      transitionService.transition(artifact.id, 'cold');

      mockRehydrate.mockRejectedValueOnce(
        new Error('Provider unavailable'),
      );

      await expect(
        transitionService.rehydrate(artifact.id),
      ).rejects.toThrow(/provider unavailable/i);

      const current = artifactRepo.findById(artifact.id);
      expect(current!.lifecycleState).toBe('cold');

      // Error should be recorded in transition log
      const transitions = connection.sqlite
        .prepare(
          'SELECT * FROM lifecycle_transitions WHERE artifact_id = ? ORDER BY timestamp DESC',
        )
        .all(artifact.id) as Array<{
        previous_state: string;
        new_state: string;
        metric_snapshot: string;
      }>;

      const failedTransition = transitions.find(
        (t) => t.previous_state === 'cold' && t.new_state === 'cold',
      );
      expect(failedTransition).toBeDefined();
      expect(failedTransition!.metric_snapshot).toContain(
        'Provider unavailable',
      );
    });
  });

  // ── D1 — Transition Audit ─────────────────────────────────

  describe('D1 — Transition Audit', () => {
    it('creates a lifecycle_transitions record with metric snapshot for every transition', () => {
      const source = createSource();
      const artifact = createArtifact(source.id, 'audit-test');

      transitionService.transition(artifact.id, 'warm');

      const transitions = connection.sqlite
        .prepare(
          'SELECT * FROM lifecycle_transitions WHERE artifact_id = ?',
        )
        .all(artifact.id) as Array<{
        id: string;
        artifact_id: string;
        previous_state: string;
        new_state: string;
        timestamp: number;
        metric_snapshot: string | null;
      }>;

      expect(transitions).toHaveLength(1);
      expect(transitions[0]!.previous_state).toBe('hot');
      expect(transitions[0]!.new_state).toBe('warm');
      expect(transitions[0]!.timestamp).toBeGreaterThan(0);
      expect(transitions[0]!.metric_snapshot).toBeDefined();
    });
  });

  // ── D7 — Configuration ────────────────────────────────────

  describe('D7 — Configuration', () => {
    it('accepts valid config with defaults', () => {
      const config = LifecycleConfigSchema.parse({});

      expect(config.observation_window).toBe(7 * 24 * 60 * 60 * 1000);
      expect(config.hot_access_threshold).toBe(5);
      expect(config.warm_access_threshold).toBe(1);
      expect(config.storage_budget_bytes).toBe(500 * 1024 * 1024);
      expect(config.compaction_policy).toBe('manual');
    });

    it('accepts valid custom config', () => {
      const config = LifecycleConfigSchema.parse({
        observation_window: 86400000,
        hot_access_threshold: 10,
        warm_access_threshold: 3,
        storage_budget_bytes: 1024 * 1024,
        compaction_policy: 'on-pressure',
      });

      expect(config.hot_access_threshold).toBe(10);
      expect(config.compaction_policy).toBe('on-pressure');
    });

    it('rejects invalid config', () => {
      expect(() =>
        LifecycleConfigSchema.parse({ observation_window: -1 }),
      ).toThrow();

      expect(() =>
        LifecycleConfigSchema.parse({ compaction_policy: 'invalid' }),
      ).toThrow();
    });
  });

  // ── D7 — DI Wiring ────────────────────────────────────────

  describe('D7 — DI Wiring', () => {
    it('compiles the module with all services resolvable', () => {
      expect(metricsService).toBeDefined();
      expect(policyService).toBeDefined();
      expect(transitionService).toBeDefined();
      expect(compactionService).toBeDefined();
    });
  });
});
