import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PersistenceModule } from '../../src/persistence/persistence.module.js';
import { LexicalSearchService } from '../../src/rag/adapters/lexical-search.service.js';

describe('LexicalSearchService', () => {
  let module: TestingModule;
  let service: LexicalSearchService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [PersistenceModule.forRoot({ databasePath: ':memory:' })],
      providers: [LexicalSearchService],
    }).compile();

    service = module.get(LexicalSearchService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('ensureIndex() creates FTS5 table without error', () => {
    expect(() => service.ensureIndex()).not.toThrow();
  });

  it('ensureIndex() is idempotent', () => {
    service.ensureIndex();
    expect(() => service.ensureIndex()).not.toThrow();
  });

  it('indexChunk + search finds the indexed content', () => {
    service.indexChunk('chunk-1', 'The quick brown fox jumps over the lazy dog');
    const results = service.search('quick fox', 10);
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('chunk-1');
    expect(results[0].content).toContain('quick brown fox');
  });

  it('indexChunks (batch) indexes multiple atomically', () => {
    service.indexChunks([
      { chunkId: 'c1', content: 'Alpha bravo charlie' },
      { chunkId: 'c2', content: 'Delta echo foxtrot' },
      { chunkId: 'c3', content: 'Golf hotel india' },
    ]);

    const results = service.search('echo foxtrot', 10);
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('c2');
  });

  it('indexChunks with empty array is a no-op', () => {
    expect(() => service.indexChunks([])).not.toThrow();
  });

  it('removeChunk removes from index', () => {
    service.indexChunk('chunk-1', 'searchable content here');
    const before = service.search('searchable', 10);
    expect(before).toHaveLength(1);

    service.removeChunk('chunk-1');
    const after = service.search('searchable', 10);
    expect(after).toHaveLength(0);
  });

  it('search returns BM25-scored results with score > 0', () => {
    service.indexChunk('c1', 'TypeScript programming language');
    const results = service.search('TypeScript', 10);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('search with no matches returns empty', () => {
    service.indexChunk('c1', 'Hello world');
    const results = service.search('xyznonexistent', 10);
    expect(results).toHaveLength(0);
  });

  it('sanitizes FTS5 operators from query', () => {
    service.indexChunk('c1', 'The quick brown fox');

    const results = service.search('quick* AND "brown" OR NOT fox', 10);
    expect(results).toHaveLength(1);
  });

  it('returns empty for query with only FTS5 operators', () => {
    service.indexChunk('c1', 'Some content');
    const results = service.search('AND OR NOT NEAR * + -', 10);
    expect(results).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    service.indexChunks([
      { chunkId: 'c1', content: 'common word appears here' },
      { chunkId: 'c2', content: 'common word also here' },
      { chunkId: 'c3', content: 'common word everywhere' },
    ]);

    const results = service.search('common word', 2);
    expect(results).toHaveLength(2);
  });
});
