import {
  RetrievalQuerySchema,
  RetrievalFiltersSchema,
} from '../../src/rag/contracts/retrieval-query.schema.js';

describe('RetrievalFiltersSchema', () => {
  it('accepts empty object', () => {
    const result = RetrievalFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = RetrievalFiltersSchema.parse({
      sourceIds: ['src-1', 'src-2'],
      providers: ['git'],
      afterDate: 1000,
      beforeDate: 2000,
    });
    expect(result.sourceIds).toEqual(['src-1', 'src-2']);
    expect(result.providers).toEqual(['git']);
    expect(result.afterDate).toBe(1000);
    expect(result.beforeDate).toBe(2000);
  });

  it('rejects empty strings in sourceIds', () => {
    const result = RetrievalFiltersSchema.safeParse({ sourceIds: [''] });
    expect(result.success).toBe(false);
  });

  it('rejects empty strings in providers', () => {
    const result = RetrievalFiltersSchema.safeParse({ providers: [''] });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalQuerySchema', () => {
  it('parses valid query with all fields', () => {
    const result = RetrievalQuerySchema.parse({
      text: 'search term',
      filters: { sourceIds: ['s1'] },
      limit: 5,
      minScore: 0.5,
      includeCode: true,
    });
    expect(result.text).toBe('search term');
    expect(result.limit).toBe(5);
    expect(result.minScore).toBe(0.5);
    expect(result.includeCode).toBe(true);
    expect(result.filters?.sourceIds).toEqual(['s1']);
  });

  it('applies defaults: limit=10, includeCode=false', () => {
    const result = RetrievalQuerySchema.parse({ text: 'hello' });
    expect(result.limit).toBe(10);
    expect(result.includeCode).toBe(false);
    expect(result.filters).toBeUndefined();
    expect(result.minScore).toBeUndefined();
  });

  it('rejects empty text', () => {
    const result = RetrievalQuerySchema.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative limit', () => {
    const result = RetrievalQuerySchema.safeParse({ text: 'x', limit: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero limit', () => {
    const result = RetrievalQuerySchema.safeParse({ text: 'x', limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer limit', () => {
    const result = RetrievalQuerySchema.safeParse({ text: 'x', limit: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects minScore below 0', () => {
    const result = RetrievalQuerySchema.safeParse({
      text: 'x',
      minScore: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects minScore above 1', () => {
    const result = RetrievalQuerySchema.safeParse({
      text: 'x',
      minScore: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts minScore at boundaries 0 and 1', () => {
    expect(
      RetrievalQuerySchema.safeParse({ text: 'x', minScore: 0 }).success,
    ).toBe(true);
    expect(
      RetrievalQuerySchema.safeParse({ text: 'x', minScore: 1 }).success,
    ).toBe(true);
  });
});
