import { Test, TestingModule } from '@nestjs/testing';
import {
  PersistenceModule,
  SourceRepository,
} from '../src/persistence/index.js';
import {
  createContentHash,
  createTimestamp,
  createUlid,
} from '../src/shared/primitives.js';
import type { Timestamp } from '../src/shared/primitives.js';

/**
 * Cache identity/invalidation (D6) and refresh scheduling (D7) behavior
 * through the DI-hosted `SourceRepository`.
 */
describe('Cache identity and refresh metadata (e2e)', () => {
  let moduleRef: TestingModule;
  let sourceRepository: SourceRepository;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    sourceRepository = moduleRef.get(SourceRepository);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  let sourceSequence = 0;

  function createSource(refreshIntervalSeconds = 3600) {
    sourceSequence += 1;
    return sourceRepository.findOrCreate({
      providerType: 'confluence',
      providerInstanceId: 'space-1',
      // Distinct per call: source identity is stable by
      // (providerType, providerInstanceId, canonicalUri) — sharing a URI
      // across calls would collapse two logically distinct sources under
      // test into the same row.
      canonicalUri: `/space/page-${sourceSequence}`,
      displayName: 'Page',
      refreshIntervalSeconds,
    });
  }

  it('is never a cache hit before any fetch has been recorded', () => {
    const source = createSource();

    expect(
      sourceRepository.isCacheHit(source.id, createContentHash('x'), 1),
    ).toBe(false);
  });

  it('detects a cache hit when freshly fetched content matches the last processed content (D6)', () => {
    const source = createSource();
    const contentHash = createContentHash('unchanged content');

    sourceRepository.recordSuccessfulFetch({
      id: source.id,
      contentHash,
      contentLength: 'unchanged content'.length,
    });

    expect(
      sourceRepository.isCacheHit(
        source.id,
        contentHash,
        'unchanged content'.length,
      ),
    ).toBe(true);
  });

  it('detects a cache miss when freshly fetched content differs (D6)', () => {
    const source = createSource();
    sourceRepository.recordSuccessfulFetch({
      id: source.id,
      contentHash: createContentHash('version 1'),
      contentLength: 'version 1'.length,
    });

    expect(
      sourceRepository.isCacheHit(
        source.id,
        createContentHash('version 2'),
        'version 2'.length,
      ),
    ).toBe(false);
  });

  it('computes the next refresh deadline from the refresh interval on a successful fetch (D7)', () => {
    const source = createSource(60);
    const before = Date.now();

    const updated = sourceRepository.recordSuccessfulFetch({
      id: source.id,
      contentHash: createContentHash('content'),
      contentLength: 'content'.length,
    });

    expect(updated.nextRefreshDueAt).toBeDefined();
    expect(updated.nextRefreshDueAt as number).toBeGreaterThanOrEqual(
      before + 59_000,
    );
    expect(updated.failureCount).toBe(0);
    expect(updated.isStale).toBe(false);
  });

  it('increments the failure count and marks the source stale on a failed fetch (D6)', () => {
    const source = createSource();

    const afterOneFailure = sourceRepository.recordFailedFetch(source.id);
    expect(afterOneFailure.failureCount).toBe(1);
    expect(afterOneFailure.isStale).toBe(true);

    const afterTwoFailures = sourceRepository.recordFailedFetch(source.id);
    expect(afterTwoFailures.failureCount).toBe(2);
  });

  it('resets the failure count on the next successful fetch', () => {
    const source = createSource();
    sourceRepository.recordFailedFetch(source.id);
    sourceRepository.recordFailedFetch(source.id);

    const recovered = sourceRepository.recordSuccessfulFetch({
      id: source.id,
      contentHash: createContentHash('recovered'),
      contentLength: 'recovered'.length,
    });

    expect(recovered.failureCount).toBe(0);
    expect(recovered.isStale).toBe(false);
  });

  it('finds sources past their refresh deadline (D9 candidate C — compound cache-hit/staleness query)', () => {
    const overdue = createSource(1);
    const notYetDue = createSource(3600);

    sourceRepository.recordSuccessfulFetch({
      id: overdue.id,
      contentHash: createContentHash('overdue'),
      contentLength: 'overdue'.length,
    });
    sourceRepository.recordSuccessfulFetch({
      id: notYetDue.id,
      contentHash: createContentHash('fresh'),
      contentLength: 'fresh'.length,
    });

    const asOf = (Date.now() + 5_000) as Timestamp;
    const due = sourceRepository.findRefreshDue(asOf);

    expect(due.map((source) => source.id)).toContain(overdue.id);
    expect(due.map((source) => source.id)).not.toContain(notYetDue.id);
  });

  it('excludes sources that have never been successfully fetched from the refresh-due query', () => {
    createSource(1);

    expect(sourceRepository.findRefreshDue(createTimestamp())).toEqual([]);
  });

  it('throws when recording a fetch for an unknown source', () => {
    expect(() =>
      sourceRepository.recordSuccessfulFetch({
        id: createUlid(),
        contentHash: createContentHash('x'),
        contentLength: 1,
      }),
    ).toThrow(/unknown source/);
  });

  it('throws when recording a failure for an unknown source', () => {
    expect(() => sourceRepository.recordFailedFetch(createUlid())).toThrow(
      /unknown source/,
    );
  });
});
