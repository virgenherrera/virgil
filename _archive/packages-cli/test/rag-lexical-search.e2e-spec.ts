import { Test, TestingModule } from '@nestjs/testing';
import { RagModule, LexicalSearchService } from '../src/rag/index.js';
import { DATABASE_CONNECTION } from '../src/persistence/index.js';
import type { DatabaseConnection } from '../src/persistence/index.js';

describe('RagModule > LexicalSearchService (e2e)', () => {
  let moduleRef: TestingModule;
  let lexical: LexicalSearchService;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RagModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    lexical = moduleRef.get(LexicalSearchService);
    connection = moduleRef.get<DatabaseConnection>(DATABASE_CONNECTION);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('creates the FTS5 virtual table on first use', () => {
    lexical.ensureIndex();

    const row = connection.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts'",
      )
      .get() as { name: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.name).toBe('chunks_fts');
  });

  it('indexes and retrieves content by single term', () => {
    lexical.indexChunk(
      'chunk-a',
      'The quick brown fox jumps over the lazy dog',
    );
    lexical.indexChunk('chunk-b', 'A fast car races down the highway');
    lexical.indexChunk('chunk-c', 'Quantum computing advances rapidly');

    const results = lexical.search('quantum', 10);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('chunk-c');
  });

  it('returns results ranked by BM25 relevance', () => {
    lexical.indexChunk(
      'chunk-few',
      'The compiler optimizes the generated machine code for the target platform',
    );
    lexical.indexChunk(
      'chunk-many',
      'The compiler uses the compiler infrastructure to run compiler passes through the compiler pipeline and compiler backend',
    );

    const results = lexical.search('compiler', 10);

    expect(results.length).toBeGreaterThanOrEqual(2);
    // The chunk mentioning "compiler" more times should rank higher (higher score).
    const manyIdx = results.findIndex((r) => r.chunkId === 'chunk-many');
    const fewIdx = results.findIndex((r) => r.chunkId === 'chunk-few');
    expect(manyIdx).toBeLessThan(fewIdx);
  });

  it('handles multi-term queries', () => {
    lexical.indexChunk(
      'chunk-x',
      'Distributed systems rely on consensus algorithms',
    );
    lexical.indexChunk(
      'chunk-y',
      'Machine learning models need large datasets',
    );
    lexical.indexChunk(
      'chunk-z',
      'Consensus protocols in distributed databases',
    );

    const results = lexical.search('distributed consensus', 10);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map((r) => r.chunkId);
    // chunk-z mentions both terms
    expect(ids).toContain('chunk-z');
  });

  it('returns empty results for non-matching query', () => {
    lexical.indexChunk(
      'chunk-1',
      'TypeScript is a typed superset of JavaScript',
    );

    const results = lexical.search('xylophone', 10);

    expect(results).toHaveLength(0);
  });

  it('sanitizes FTS5 special characters to prevent injection', () => {
    lexical.indexChunk('chunk-safe', 'Testing safety of the search interface');

    // Should not throw even with FTS5 operator characters and keywords.
    expect(() => lexical.search('test* OR DROP TABLE', 10)).not.toThrow();

    const results = lexical.search('test* OR DROP TABLE', 10);
    // "OR", "DROP", "TABLE" are either stripped or treated as literals.
    // "test" (after stripping *) should still match.
    expect(Array.isArray(results)).toBe(true);
  });

  it('removes indexed content', () => {
    lexical.indexChunk('chunk-rm', 'Ephemeral data that will be removed soon');

    const before = lexical.search('ephemeral', 10);
    expect(before).toHaveLength(1);

    lexical.removeChunk('chunk-rm');

    const after = lexical.search('ephemeral', 10);
    expect(after).toHaveLength(0);
  });

  it('indexes multiple chunks atomically', () => {
    lexical.indexChunks([
      { chunkId: 'batch-1', content: 'Alpha protocol initiated' },
      { chunkId: 'batch-2', content: 'Beta protocol initiated' },
      { chunkId: 'batch-3', content: 'Gamma radiation detected' },
    ]);

    const alphaResults = lexical.search('alpha', 10);
    expect(alphaResults).toHaveLength(1);
    expect(alphaResults[0].chunkId).toBe('batch-1');

    const betaResults = lexical.search('beta', 10);
    expect(betaResults).toHaveLength(1);
    expect(betaResults[0].chunkId).toBe('batch-2');

    const gammaResults = lexical.search('gamma', 10);
    expect(gammaResults).toHaveLength(1);
    expect(gammaResults[0].chunkId).toBe('batch-3');
  });
});
