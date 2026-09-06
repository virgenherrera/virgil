import {
  RetrievalResultSchema,
  RetrievalProvenanceSchema,
} from '../../src/rag/contracts/retrieval-result.schema.js';
import {
  createContentHash,
  createTimestamp,
} from '../../src/shared/primitives.js';

function validProvenance() {
  return {
    provider: 'text-retriever',
    uri: 'chunk://abc',
    contentHash: createContentHash('test'),
    discoveredAt: createTimestamp(),
  };
}

function validResult() {
  return {
    chunkId: 'chunk-1',
    content: 'some content',
    score: 0.85,
    lexicalScore: 0.7,
    vectorScore: 0.9,
    sourceId: 'src-1',
    provenance: validProvenance(),
  };
}

describe('RetrievalProvenanceSchema', () => {
  it('parses valid provenance', () => {
    const result = RetrievalProvenanceSchema.parse(validProvenance());
    expect(result.provider).toBe('text-retriever');
    expect(result.uri).toBe('chunk://abc');
  });

  it('rejects empty provider', () => {
    const result = RetrievalProvenanceSchema.safeParse({
      ...validProvenance(),
      provider: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty URI', () => {
    const result = RetrievalProvenanceSchema.safeParse({
      ...validProvenance(),
      uri: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalResultSchema', () => {
  it('parses valid result', () => {
    const result = RetrievalResultSchema.parse(validResult());
    expect(result.chunkId).toBe('chunk-1');
    expect(result.content).toBe('some content');
    expect(result.score).toBe(0.85);
    expect(result.lexicalScore).toBe(0.7);
    expect(result.vectorScore).toBe(0.9);
    expect(result.sourceId).toBe('src-1');
  });

  it('rejects empty chunkId', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      chunkId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sourceId', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      sourceId: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts null lexicalScore', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      lexicalScore: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.lexicalScore).toBeNull();
  });

  it('accepts null vectorScore', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      vectorScore: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.vectorScore).toBeNull();
  });

  it('validates contentHash format in provenance', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      provenance: { ...validProvenance(), contentHash: 'not-a-hash' },
    });
    expect(result.success).toBe(false);
  });

  it('validates timestamp format in provenance', () => {
    const result = RetrievalResultSchema.safeParse({
      ...validResult(),
      provenance: { ...validProvenance(), discoveredAt: 'not-a-ts' },
    });
    expect(result.success).toBe(false);
  });
});
