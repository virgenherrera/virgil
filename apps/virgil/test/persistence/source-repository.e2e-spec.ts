import type { TestingModule } from '@nestjs/testing';
import { SourceRepository } from '../../src/persistence/repositories/source.repository.js';
import { createContentHash } from '../../src/shared/primitives.js';
import type { Timestamp } from '../../src/shared/primitives.js';
import { createTestModule } from './test-db.helper.js';

describe('SourceRepository', () => {
  let module: TestingModule;
  let repo: SourceRepository;

  beforeEach(async () => {
    module = await createTestModule();
    repo = module.get(SourceRepository);
  });

  afterEach(async () => {
    await module.close();
  });

  const input = () => ({
    providerType: 'git',
    providerInstanceId: 'instance-1',
    canonicalUri: 'https://example.com/repo',
    displayName: 'Example Repo',
    refreshIntervalSeconds: 3600,
  });

  it('creates a new source via findOrCreate', () => {
    const source = repo.findOrCreate(input());
    expect(source.providerType).toBe('git');
    expect(source.providerInstanceId).toBe('instance-1');
    expect(source.canonicalUri).toBe('https://example.com/repo');
    expect(source.displayName).toBe('Example Repo');
    expect(source.isStale).toBe(false);
    expect(source.failureCount).toBe(0);
    expect(source.refreshIntervalSeconds).toBe(3600);
  });

  it('returns existing source on duplicate identity', () => {
    const first = repo.findOrCreate(input());
    const second = repo.findOrCreate(input());
    expect(second.id).toBe(first.id);
  });

  it('finds by id', () => {
    const created = repo.findOrCreate(input());
    const found = repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for unknown id', () => {
    expect(repo.findById('nonexistent')).toBeUndefined();
  });

  it('finds by identity triple', () => {
    const created = repo.findOrCreate(input());
    const found = repo.findByIdentity('git', 'instance-1', 'https://example.com/repo');
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('records a successful fetch', () => {
    const source = repo.findOrCreate(input());
    const hash = createContentHash('content');
    const updated = repo.recordSuccessfulFetch({
      id: source.id,
      contentHash: hash,
      contentLength: 7,
    });
    expect(updated.contentHash).toBe(hash);
    expect(updated.contentLength).toBe(7);
    expect(updated.isStale).toBe(false);
    expect(updated.failureCount).toBe(0);
    expect(updated.lastCheckedAt).toBeDefined();
    expect(updated.lastSuccessfulRefreshAt).toBeDefined();
    expect(updated.nextRefreshDueAt).toBeDefined();
  });

  it('throws when recording fetch for unknown source', () => {
    expect(() =>
      repo.recordSuccessfulFetch({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        contentHash: createContentHash('x'),
        contentLength: 1,
      }),
    ).toThrow('Cannot record a fetch for unknown source');
  });

  it('records a failed fetch', () => {
    const source = repo.findOrCreate(input());
    const updated = repo.recordFailedFetch(source.id);
    expect(updated.failureCount).toBe(1);
    expect(updated.isStale).toBe(true);
    expect(updated.lastFailureAt).toBeDefined();
  });

  it('throws when recording failure for unknown source', () => {
    expect(() => repo.recordFailedFetch('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toThrow(
      'Cannot record a failure for unknown source',
    );
  });

  it('detects cache hit', () => {
    const source = repo.findOrCreate(input());
    const hash = createContentHash('content');
    repo.recordSuccessfulFetch({
      id: source.id,
      contentHash: hash,
      contentLength: 7,
    });

    expect(repo.isCacheHit(source.id, hash, 7)).toBe(true);
    expect(repo.isCacheHit(source.id, hash, 999)).toBe(false);
    expect(
      repo.isCacheHit(source.id, createContentHash('different'), 7),
    ).toBe(false);
  });

  it('returns false for cache hit on unknown source', () => {
    expect(
      repo.isCacheHit('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'hash', 1),
    ).toBe(false);
  });

  it('finds refresh-due sources', () => {
    const source = repo.findOrCreate(input());
    const hash = createContentHash('content');
    repo.recordSuccessfulFetch({
      id: source.id,
      contentHash: hash,
      contentLength: 7,
    });

    const farFuture = (Date.now() + 999_999_999) as Timestamp;
    const due = repo.findRefreshDue(farFuture);
    expect(due.length).toBe(1);
    expect(due[0].id).toBe(source.id);
  });

  it('counts sources', () => {
    expect(repo.count()).toBe(0);
    repo.findOrCreate(input());
    expect(repo.count()).toBe(1);
  });
});
