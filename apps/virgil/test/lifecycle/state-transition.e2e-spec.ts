import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LifecycleModule } from '../../src/lifecycle/lifecycle.module.js';
import {
  StateTransitionService,
  InvalidTransitionError,
} from '../../src/lifecycle/state-transition.service.js';
import { REHYDRATION_PROVIDER } from '../../src/lifecycle/lifecycle.constants.js';
import { ArtifactRepository } from '../../src/persistence/repositories/artifact.repository.js';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import type { DatabaseConnection } from '../../src/persistence/database.provider.js';
import { DATABASE_CONNECTION } from '../../src/persistence/persistence.constants.js';
import { lifecycleTransitions } from '../../src/persistence/schema/lifecycle.schema.js';
import {
  createContentHash,
  createUlid,
} from '../../src/shared/primitives.js';
import type { RehydrationProvider } from '../../src/lifecycle/lifecycle.types.js';

describe('StateTransitionService', () => {
  let module: TestingModule;
  let transitionService: StateTransitionService;
  let artifactRepo: ArtifactRepository;
  let connection: DatabaseConnection;
  let sourceId: string;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        LifecycleModule.forRoot({
          databasePath: ':memory:',
          runMigrations: true,
        }),
      ],
    }).compile();

    transitionService = module.get(StateTransitionService);
    artifactRepo = module.get(ArtifactRepository);
    connection = module.get(DATABASE_CONNECTION);

    const sourceRepo = module.get(SourceRepository);
    const source = sourceRepo.findOrCreate({
      providerType: 'git',
      providerInstanceId: 'inst-1',
      canonicalUri: 'https://example.com/repo',
      displayName: 'Test Source',
      refreshIntervalSeconds: 3600,
    });
    sourceId = source.id;
  });

  afterEach(async () => {
    await module.close();
  });

  function insertArtifact(state: 'hot' | 'warm' | 'cold' = 'hot') {
    const content = `content-${createUlid()}`;
    return artifactRepo.insert({
      sourceId,
      contentHash: createContentHash(content),
      contentLength: content.length,
      mimeType: 'text/plain',
      title: 'Test',
      sourceUri: 'file://test.txt',
      normalizedContent: content,
      providerId: 'provider-1',
      providerCapability: 'ingest',
      lifecycleState: state,
    });
  }

  function getTransitionRecords(artifactId: string) {
    return connection.db
      .select()
      .from(lifecycleTransitions)
      .all()
      .filter((r) => r.artifactId === artifactId);
  }

  it('Hot -> Warm transition succeeds and records audit', () => {
    const artifact = insertArtifact('hot');

    const updated = transitionService.transition(artifact.id, 'warm');

    expect(updated.lifecycleState).toBe('warm');

    const records = getTransitionRecords(artifact.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.previousState).toBe('hot');
    expect(records[0]!.newState).toBe('warm');
    expect(records[0]!.metricSnapshot).toBeTruthy();
  });

  it('Warm -> Hot transition succeeds', () => {
    const artifact = insertArtifact('warm');

    const updated = transitionService.transition(artifact.id, 'hot');

    expect(updated.lifecycleState).toBe('hot');
  });

  it('Warm -> Cold transition succeeds', () => {
    const artifact = insertArtifact('warm');

    const updated = transitionService.transition(artifact.id, 'cold');

    expect(updated.lifecycleState).toBe('cold');
  });

  it('rejects Hot -> Cold (invalid sync transition)', () => {
    const artifact = insertArtifact('hot');

    expect(() => transitionService.transition(artifact.id, 'cold')).toThrow(
      InvalidTransitionError,
    );
  });

  it('rejects Cold -> Warm sync (must use rehydrate)', () => {
    const artifact = insertArtifact('cold');

    expect(() => transitionService.transition(artifact.id, 'warm')).toThrow(
      InvalidTransitionError,
    );
  });

  it('throws for nonexistent artifact', () => {
    expect(() =>
      transitionService.transition('nonexistent', 'warm'),
    ).toThrow('Artifact not found');
  });

  it('rehydrate throws if artifact is not cold', async () => {
    const artifact = insertArtifact('hot');

    await expect(transitionService.rehydrate(artifact.id)).rejects.toThrow(
      'must be cold',
    );
  });

  it('rehydrate throws if no provider', async () => {
    const artifact = insertArtifact('cold');

    await expect(transitionService.rehydrate(artifact.id)).rejects.toThrow(
      'No rehydration provider',
    );
  });

  describe('with rehydration provider', () => {
    let moduleWithProvider: TestingModule;
    let svc: StateTransitionService;
    let repo: ArtifactRepository;
    let conn: DatabaseConnection;
    let providerSourceId: string;
    const mockProvider: RehydrationProvider = {
      rehydrate: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
      moduleWithProvider = await Test.createTestingModule({
        imports: [
          LifecycleModule.forRoot({
            databasePath: ':memory:',
            runMigrations: true,
          }),
        ],
      })
        .overrideProvider(REHYDRATION_PROVIDER)
        .useValue(mockProvider)
        .compile();

      svc = moduleWithProvider.get(StateTransitionService);
      repo = moduleWithProvider.get(ArtifactRepository);
      conn = moduleWithProvider.get(DATABASE_CONNECTION);

      const sr = moduleWithProvider.get(SourceRepository);
      const src = sr.findOrCreate({
        providerType: 'git',
        providerInstanceId: 'inst-2',
        canonicalUri: 'https://example.com/repo2',
        displayName: 'Test Source 2',
        refreshIntervalSeconds: 3600,
      });
      providerSourceId = src.id;

      vi.clearAllMocks();
    });

    afterEach(async () => {
      await moduleWithProvider.close();
    });

    function insertColdArtifact() {
      const content = `cold-${createUlid()}`;
      return repo.insert({
        sourceId: providerSourceId,
        contentHash: createContentHash(content),
        contentLength: content.length,
        mimeType: 'text/plain',
        title: 'Cold',
        sourceUri: 'file://cold.txt',
        normalizedContent: content,
        providerId: 'provider-1',
        providerCapability: 'ingest',
        lifecycleState: 'cold',
      });
    }

    it('rehydrate Cold -> Warm via mock provider', async () => {
      const artifact = insertColdArtifact();

      const updated = await svc.rehydrate(artifact.id);

      expect(updated.lifecycleState).toBe('warm');
      expect(mockProvider.rehydrate).toHaveBeenCalledWith(artifact.id);

      const records = conn.db.select().from(lifecycleTransitions).all();
      const record = records.find((r) => r.artifactId === artifact.id);
      expect(record).toBeDefined();
      expect(record!.previousState).toBe('cold');
      expect(record!.newState).toBe('warm');
    });

    it('rehydrate records failure when provider throws', async () => {
      const artifact = insertColdArtifact();
      vi.mocked(mockProvider.rehydrate).mockRejectedValueOnce(
        new Error('provider down'),
      );

      await expect(svc.rehydrate(artifact.id)).rejects.toThrow('provider down');

      const fresh = repo.findById(artifact.id);
      expect(fresh!.lifecycleState).toBe('cold');

      const records = conn.db.select().from(lifecycleTransitions).all();
      const record = records.find((r) => r.artifactId === artifact.id);
      expect(record).toBeDefined();
      expect(record!.previousState).toBe('cold');
      expect(record!.newState).toBe('cold');
      const snapshot = JSON.parse(record!.metricSnapshot!);
      expect(snapshot.error).toBe('provider down');
    });
  });
});
