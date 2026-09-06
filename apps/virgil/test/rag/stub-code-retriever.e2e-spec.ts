import { StubCodeRetriever } from '../../src/rag/adapters/stub-code-retriever.adapter.js';

describe('StubCodeRetriever', () => {
  let retriever: StubCodeRetriever;

  beforeEach(() => {
    retriever = new StubCodeRetriever();
  });

  it('retrieveCode returns empty results with degradation notice', async () => {
    const response = await retriever.retrieveCode({
      text: 'some query',
      limit: 10,
    });
    expect(response.results).toEqual([]);
    expect(response.notice).toBeDefined();
  });

  it('notice.available is false', async () => {
    const response = await retriever.retrieveCode({
      text: 'test',
      limit: 5,
    });
    expect(response.notice!.available).toBe(false);
  });

  it('notice.reason contains non-empty string', async () => {
    const response = await retriever.retrieveCode({
      text: 'test',
      limit: 5,
    });
    expect(response.notice!.reason.length).toBeGreaterThan(0);
  });

  it('isAvailable() returns false', async () => {
    expect(await retriever.isAvailable()).toBe(false);
  });
});
