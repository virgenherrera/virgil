import { Test, TestingModule } from '@nestjs/testing';
import { RagModule, CHUNKER } from '../src/rag/index.js';
import type { Chunker } from '../src/rag/index.js';

describe('RagModule > FixedWindowChunker (e2e)', () => {
  let moduleRef: TestingModule;
  let chunker: Chunker;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RagModule.forRoot({ databasePath: ':memory:' })],
    }).compile();

    chunker = moduleRef.get<Chunker>(CHUNKER);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('returns empty array for empty input', () => {
    const result = chunker.chunk('', { sourceId: 'src-1' });

    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    const result = chunker.chunk('   ', { sourceId: 'src-1' });

    expect(result).toEqual([]);
  });

  it('returns a single chunk for content shorter than window size', () => {
    const content = 'Hello world. This is a test.';
    const result = chunker.chunk(content, { sourceId: 'src-1' });

    expect(result).toHaveLength(1);

    const chunk = result[0];
    expect(chunk.sourceId).toBe('src-1');
    expect(chunk.position).toBe(0);
    expect(chunk.startOffset).toBe(0);
    expect(chunk.endOffset).toBe(content.length);
    expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces multiple overlapping chunks for long content', () => {
    // Default window is 512 tokens * 4 chars/token = 2048 chars.
    // Generate content well above that threshold.
    const sentences = Array.from(
      { length: 25 },
      (_, i) =>
        `Sentence number ${i + 1} contains enough words to contribute meaningful length to the overall document being chunked by the fixed window algorithm and must be long enough to exceed the threshold.`,
    );
    const content = sentences.join(' ');
    expect(content.length).toBeGreaterThan(3000);

    const result = chunker.chunk(content, { sourceId: 'src-long' });

    expect(result.length).toBeGreaterThanOrEqual(2);

    // Positions should increment sequentially.
    for (let i = 0; i < result.length; i++) {
      expect(result[i].position).toBe(i);
    }

    // Adjacent chunks should overlap: the start of chunk N+1 should be
    // before the end of chunk N.
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i + 1].startOffset).toBeLessThan(result[i].endOffset);
    }
  });

  it('snaps to sentence boundaries when possible', () => {
    // Build content where the window boundary falls mid-text.
    // Generate enough characters to exceed the 2048-char default window.
    const sentences = Array.from(
      { length: 20 },
      (_, i) =>
        `This is a carefully crafted sentence number ${i + 1} that is long enough to push the total length past the default chunking window size and force the chunker to split.`,
    );
    const content = sentences.join(' ');
    expect(content.length).toBeGreaterThan(2048);

    const result = chunker.chunk(content, { sourceId: 'src-snap' });
    expect(result.length).toBeGreaterThanOrEqual(2);

    // The first chunk should end at a sentence boundary (after a period),
    // not in the middle of a word.
    const firstChunkEnd = result[0].content;
    const lastChar = firstChunkEnd.trimEnd().slice(-1);
    expect(lastChar).toBe('.');
  });

  it('each chunk has a unique id and a valid content hash', () => {
    const sentences = Array.from(
      { length: 15 },
      (_, i) =>
        `Unique sentence ${i + 1} designed to produce multiple chunks for validating identity and hash properties across every resulting chunk.`,
    );
    const content = sentences.join(' ');

    const result = chunker.chunk(content, { sourceId: 'src-ids' });
    expect(result.length).toBeGreaterThanOrEqual(2);

    const ids = result.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const chunk of result) {
      expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('preserves sourceId from metadata in every chunk', () => {
    const sentences = Array.from(
      { length: 15 },
      (_, i) =>
        `Another sentence number ${i + 1} with sufficient length to guarantee multiple chunks are produced by the fixed window chunker.`,
    );
    const content = sentences.join(' ');

    const result = chunker.chunk(content, { sourceId: 'my-source-42' });
    expect(result.length).toBeGreaterThanOrEqual(2);

    for (const chunk of result) {
      expect(chunk.sourceId).toBe('my-source-42');
    }
  });
});
