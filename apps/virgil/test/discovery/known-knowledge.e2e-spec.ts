import { KnownKnowledgeService } from '../../src/discovery/known-knowledge.service.js';
import { CoverageLevel } from '../../src/discovery/discovery.schemas.js';
import type { CrawlConfig, DiscoveryIntent } from '../../src/discovery/discovery.schemas.js';
import type { HybridRetrieverService } from '../../src/rag/services/hybrid-retriever.service.js';

function makeConfig(overrides: Partial<CrawlConfig> = {}): CrawlConfig {
  return {
    maxDepth: 3,
    maxQueries: 20,
    maxArtifacts: 50,
    perProviderBudget: 10,
    minRelevanceScore: 0.3,
    ...overrides,
  };
}

function makeIntent(elements: Array<{ key: string; category: string; description: string; value: string }>): DiscoveryIntent {
  return {
    issueId: 'PROJ-1',
    elements: elements.map((e) => ({
      key: e.key,
      category: e.category as 'component' | 'documentation' | 'related-issue' | 'architectural-area' | 'conversation',
      description: e.description,
      value: e.value,
    })),
  };
}

function makeRetrieverResult(score: number) {
  return { score, chunkId: 'chunk-1', content: 'content', lexicalScore: null, vectorScore: null, sourceId: 'src', provenance: { provider: 'test', uri: 'test', contentHash: 'a'.repeat(64), discoveredAt: Date.now() } };
}

describe('KnownKnowledgeService', () => {
  let service: KnownKnowledgeService;
  let mockRetriever: { retrieveHybrid: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRetriever = { retrieveHybrid: vi.fn() };
    service = new KnownKnowledgeService(mockRetriever as unknown as HybridRetrieverService);
  });

  it('returns FULL coverage when 2+ matches with high score', async () => {
    const config = makeConfig({ minRelevanceScore: 0.3 });
    mockRetriever.retrieveHybrid.mockResolvedValue([
      makeRetrieverResult(0.8),
      makeRetrieverResult(0.7),
      makeRetrieverResult(0.5),
    ]);

    const intent = makeIntent([{ key: 'label:auth', category: 'component', description: 'Auth component', value: 'auth' }]);
    const result = await service.assess(intent, config);

    expect(result.coverages[0].level).toBe(CoverageLevel.FULL);
    expect(result.coverages[0].matchCount).toBe(3);
    expect(result.insufficientKeys).not.toContain('label:auth');
  });

  it('returns PARTIAL coverage when 1 match above threshold', async () => {
    const config = makeConfig({ minRelevanceScore: 0.3 });
    mockRetriever.retrieveHybrid.mockResolvedValue([
      makeRetrieverResult(0.4),
    ]);

    const intent = makeIntent([{ key: 'label:auth', category: 'component', description: 'Auth', value: 'auth' }]);
    const result = await service.assess(intent, config);

    expect(result.coverages[0].level).toBe(CoverageLevel.PARTIAL);
    expect(result.coverages[0].matchCount).toBe(1);
    expect(result.insufficientKeys).toContain('label:auth');
  });

  it('returns NONE coverage when no matches above threshold', async () => {
    const config = makeConfig({ minRelevanceScore: 0.3 });
    mockRetriever.retrieveHybrid.mockResolvedValue([
      makeRetrieverResult(0.1),
      makeRetrieverResult(0.2),
    ]);

    const intent = makeIntent([{ key: 'label:auth', category: 'component', description: 'Auth', value: 'auth' }]);
    const result = await service.assess(intent, config);

    expect(result.coverages[0].level).toBe(CoverageLevel.NONE);
    expect(result.coverages[0].matchCount).toBe(0);
    expect(result.insufficientKeys).toContain('label:auth');
  });

  it('returns NONE coverage when no results at all', async () => {
    mockRetriever.retrieveHybrid.mockResolvedValue([]);

    const intent = makeIntent([{ key: 'k1', category: 'component', description: 'd', value: 'v' }]);
    const result = await service.assess(intent, makeConfig());

    expect(result.coverages[0].level).toBe(CoverageLevel.NONE);
    expect(result.coverages[0].bestScore).toBe(0);
  });

  it('populates insufficientKeys for non-FULL coverages', async () => {
    const config = makeConfig({ minRelevanceScore: 0.3 });
    mockRetriever.retrieveHybrid
      .mockResolvedValueOnce([makeRetrieverResult(0.8), makeRetrieverResult(0.7)])
      .mockResolvedValueOnce([makeRetrieverResult(0.4)])
      .mockResolvedValueOnce([]);

    const intent = makeIntent([
      { key: 'full', category: 'component', description: 'Full', value: 'full' },
      { key: 'partial', category: 'documentation', description: 'Partial', value: 'partial' },
      { key: 'none', category: 'related-issue', description: 'None', value: 'none' },
    ]);

    const result = await service.assess(intent, config);

    expect(result.insufficientKeys).toEqual(['partial', 'none']);
    expect(result.insufficientKeys).not.toContain('full');
  });

  it('includes code retrieval for architectural-area elements', async () => {
    mockRetriever.retrieveHybrid.mockResolvedValue([]);

    const intent = makeIntent([
      { key: 'path:src/auth', category: 'architectural-area', description: 'Auth path', value: 'src/auth' },
    ]);

    await service.assess(intent, makeConfig());

    expect(mockRetriever.retrieveHybrid).toHaveBeenCalledWith(
      expect.objectContaining({ includeCode: true }),
    );
  });

  it('does not include code retrieval for non-architectural elements', async () => {
    mockRetriever.retrieveHybrid.mockResolvedValue([]);

    const intent = makeIntent([
      { key: 'label:auth', category: 'component', description: 'Auth', value: 'auth' },
    ]);

    await service.assess(intent, makeConfig());

    expect(mockRetriever.retrieveHybrid).toHaveBeenCalledWith(
      expect.objectContaining({ includeCode: false }),
    );
  });

  it('returns PARTIAL when 2+ matches but score below double threshold', async () => {
    const config = makeConfig({ minRelevanceScore: 0.3 });
    mockRetriever.retrieveHybrid.mockResolvedValue([
      makeRetrieverResult(0.5),
      makeRetrieverResult(0.4),
    ]);

    const intent = makeIntent([{ key: 'k', category: 'component', description: 'd', value: 'v' }]);
    const result = await service.assess(intent, config);

    expect(result.coverages[0].level).toBe(CoverageLevel.PARTIAL);
  });
});
