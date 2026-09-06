import { FixedWindowChunker } from '../../src/rag/adapters/fixed-window-chunker.adapter.js';
import {
  APPROXIMATE_CHARS_PER_TOKEN,
  DEFAULT_CHUNK_OVERLAP_RATIO,
  DEFAULT_CHUNK_TOKEN_SIZE,
} from '../../src/rag/rag.constants.js';
import type { ChunkMetadataInput } from '../../src/rag/ports/chunker.port.js';

describe('FixedWindowChunker', () => {
  let chunker: FixedWindowChunker;
  const metadata: ChunkMetadataInput = { sourceId: 'src-1' };

  beforeEach(() => {
    chunker = new FixedWindowChunker();
  });

  it('returns empty array for empty string', () => {
    expect(chunker.chunk('', metadata)).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(chunker.chunk('   \n\t  ', metadata)).toEqual([]);
  });

  it('returns one chunk for single short sentence', () => {
    const result = chunker.chunk('Hello world.', metadata);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Hello world.');
    expect(result[0].position).toBe(0);
    expect(result[0].sourceId).toBe('src-1');
  });

  it('returns one chunk for content shorter than step size', () => {
    const maxChars = DEFAULT_CHUNK_TOKEN_SIZE * APPROXIMATE_CHARS_PER_TOKEN;
    const stepChars =
      maxChars - Math.floor(maxChars * DEFAULT_CHUNK_OVERLAP_RATIO);
    const content = 'a'.repeat(stepChars);
    const result = chunker.chunk(content, metadata);
    expect(result).toHaveLength(1);
    expect(result[0].content.length).toBe(stepChars);
  });

  it('produces overlapping chunks for long content', () => {
    const maxChars = DEFAULT_CHUNK_TOKEN_SIZE * APPROXIMATE_CHARS_PER_TOKEN;
    const content = 'word '.repeat(Math.ceil((maxChars * 2) / 5));
    const result = chunker.chunk(content, metadata);
    expect(result.length).toBeGreaterThan(1);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].startOffset).toBeLessThan(result[i - 1].endOffset);
    }
  });

  it('snaps to sentence boundary when possible', () => {
    const maxChars = DEFAULT_CHUNK_TOKEN_SIZE * APPROXIMATE_CHARS_PER_TOKEN;
    const sentence = 'This is a sentence. ';
    const repetitions = Math.ceil((maxChars * 1.5) / sentence.length);
    const content = sentence.repeat(repetitions);
    const result = chunker.chunk(content, metadata);

    expect(result.length).toBeGreaterThan(1);
    const firstChunkEnd = result[0].content;
    expect(firstChunkEnd.trimEnd().endsWith('.')).toBe(true);
  });

  it('assigns incrementing positions starting from 0', () => {
    const maxChars = DEFAULT_CHUNK_TOKEN_SIZE * APPROXIMATE_CHARS_PER_TOKEN;
    const content = 'x '.repeat(maxChars);
    const result = chunker.chunk(content, metadata);

    for (let i = 0; i < result.length; i++) {
      expect(result[i].position).toBe(i);
    }
  });

  it('generates valid ULID ids', () => {
    const result = chunker.chunk('Some content here.', metadata);
    expect(result[0].id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('generates contentHash as branded string', () => {
    const result = chunker.chunk('Some content here.', metadata);
    expect(typeof result[0].contentHash).toBe('string');
    expect(result[0].contentHash.length).toBeGreaterThan(0);
  });

  it('estimates tokenCount as approximately content.length / 4', () => {
    const content = 'This is a test sentence for token counting.';
    const result = chunker.chunk(content, metadata);
    const expected = Math.ceil(content.length / APPROXIMATE_CHARS_PER_TOKEN);
    expect(result[0].tokenCount).toBe(expected);
  });

  it('respects custom token size and overlap ratio', () => {
    const smallChunker = new FixedWindowChunker(64, 0.25);
    const maxChars = 64 * APPROXIMATE_CHARS_PER_TOKEN;
    const content = 'a'.repeat(maxChars * 3);
    const result = smallChunker.chunk(content, metadata);
    expect(result.length).toBeGreaterThan(1);

    for (const chunk of result) {
      expect(chunk.content.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('snaps to sentence ender at exact boundary position', () => {
    const maxChars = DEFAULT_CHUNK_TOKEN_SIZE * APPROXIMATE_CHARS_PER_TOKEN;
    const filler = 'x'.repeat(maxChars - 1);
    const content = filler + '.' + 'y'.repeat(maxChars);
    const result = chunker.chunk(content, metadata);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].content.endsWith('.')).toBe(true);
  });
});
