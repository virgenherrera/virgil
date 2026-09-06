import { GapAnalysisService } from '../../src/discovery/gap-analysis.service.js';
import { CoverageLevel, GapCategory, GapPriority } from '../../src/discovery/discovery.schemas.js';
import type { DiscoveryIntent, KnowledgeCoverageResult } from '../../src/discovery/discovery.schemas.js';
import { ProviderCapability } from '../../src/shared/provider.types.js';

function makeIntent(elements: Array<{ key: string; category: string; value: string }>): DiscoveryIntent {
  return {
    issueId: 'PROJ-1',
    elements: elements.map((e) => ({
      key: e.key,
      category: e.category as 'component' | 'documentation' | 'related-issue' | 'architectural-area' | 'conversation',
      description: `Description for ${e.key}`,
      value: e.value,
    })),
  };
}

function makeCoverage(
  coverages: Array<{ elementKey: string; level: CoverageLevel; bestScore: number; matchCount: number }>,
  insufficientKeys: string[],
): KnowledgeCoverageResult {
  return { coverages, insufficientKeys };
}

describe('GapAnalysisService', () => {
  let service: GapAnalysisService;

  beforeEach(() => {
    service = new GapAnalysisService();
  });

  it('returns empty gaps and fullyCovered=true when all elements are fully covered', () => {
    const intent = makeIntent([{ key: 'label:auth', category: 'component', value: 'auth' }]);
    const coverage = makeCoverage(
      [{ elementKey: 'label:auth', level: CoverageLevel.FULL, bestScore: 0.9, matchCount: 3 }],
      [],
    );

    const result = service.analyse(intent, coverage);

    expect(result.fullyCovered).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  it('creates a gap for insufficient element', () => {
    const intent = makeIntent([{ key: 'label:auth', category: 'component', value: 'auth' }]);
    const coverage = makeCoverage(
      [{ elementKey: 'label:auth', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }],
      ['label:auth'],
    );

    const result = service.analyse(intent, coverage);

    expect(result.fullyCovered).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].intentElementKeys).toEqual(['label:auth']);
  });

  it('groups elements with same category and value into one gap', () => {
    const intent = makeIntent([
      { key: 'k1', category: 'component', value: 'auth' },
      { key: 'k2', category: 'component', value: 'auth' },
    ]);
    const coverage = makeCoverage(
      [
        { elementKey: 'k1', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 },
        { elementKey: 'k2', level: CoverageLevel.PARTIAL, bestScore: 0.2, matchCount: 1 },
      ],
      ['k1', 'k2'],
    );

    const result = service.analyse(intent, coverage);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].intentElementKeys).toEqual(['k1', 'k2']);
  });

  it('creates separate gaps for different categories', () => {
    const intent = makeIntent([
      { key: 'k1', category: 'component', value: 'auth' },
      { key: 'k2', category: 'documentation', value: 'readme' },
    ]);
    const coverage = makeCoverage(
      [
        { elementKey: 'k1', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 },
        { elementKey: 'k2', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 },
      ],
      ['k1', 'k2'],
    );

    const result = service.analyse(intent, coverage);
    expect(result.gaps).toHaveLength(2);
  });

  it('sorts gaps by priority: HIGH before MEDIUM', () => {
    const intent = makeIntent([
      { key: 'k-partial', category: 'component', value: 'partial' },
      { key: 'k-none', category: 'documentation', value: 'none' },
    ]);
    const coverage = makeCoverage(
      [
        { elementKey: 'k-partial', level: CoverageLevel.PARTIAL, bestScore: 0.2, matchCount: 1 },
        { elementKey: 'k-none', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 },
      ],
      ['k-partial', 'k-none'],
    );

    const result = service.analyse(intent, coverage);

    expect(result.gaps[0].priority).toBe(GapPriority.HIGH);
    expect(result.gaps[1].priority).toBe(GapPriority.MEDIUM);
  });

  it('assigns HIGH priority for NONE coverage', () => {
    const intent = makeIntent([{ key: 'k', category: 'component', value: 'v' }]);
    const coverage = makeCoverage(
      [{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }],
      ['k'],
    );

    const result = service.analyse(intent, coverage);
    expect(result.gaps[0].priority).toBe(GapPriority.HIGH);
  });

  it('assigns MEDIUM priority for PARTIAL coverage', () => {
    const intent = makeIntent([{ key: 'k', category: 'component', value: 'v' }]);
    const coverage = makeCoverage(
      [{ elementKey: 'k', level: CoverageLevel.PARTIAL, bestScore: 0.4, matchCount: 1 }],
      ['k'],
    );

    const result = service.analyse(intent, coverage);
    expect(result.gaps[0].priority).toBe(GapPriority.MEDIUM);
  });

  describe('category mapping', () => {
    it('maps component to ARCHITECTURAL_CONTEXT', () => {
      const intent = makeIntent([{ key: 'k', category: 'component', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].category).toBe(GapCategory.ARCHITECTURAL_CONTEXT);
    });

    it('maps documentation to DOCUMENTATION', () => {
      const intent = makeIntent([{ key: 'k', category: 'documentation', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].category).toBe(GapCategory.DOCUMENTATION);
    });

    it('maps architectural-area to CODE', () => {
      const intent = makeIntent([{ key: 'k', category: 'architectural-area', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].category).toBe(GapCategory.CODE);
    });

    it('maps related-issue to ISSUE_CONTEXT', () => {
      const intent = makeIntent([{ key: 'k', category: 'related-issue', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].category).toBe(GapCategory.ISSUE_CONTEXT);
    });

    it('maps conversation to CONVERSATION', () => {
      const intent = makeIntent([{ key: 'k', category: 'conversation', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].category).toBe(GapCategory.CONVERSATION);
    });
  });

  describe('provider capability mapping', () => {
    it('maps DOCUMENTATION to KNOWLEDGE', () => {
      const intent = makeIntent([{ key: 'k', category: 'documentation', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].providerCapabilities).toEqual([ProviderCapability.KNOWLEDGE]);
    });

    it('maps CODE to REPOSITORY', () => {
      const intent = makeIntent([{ key: 'k', category: 'architectural-area', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].providerCapabilities).toEqual([ProviderCapability.REPOSITORY]);
    });

    it('maps ISSUE_CONTEXT to ISSUE', () => {
      const intent = makeIntent([{ key: 'k', category: 'related-issue', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].providerCapabilities).toEqual([ProviderCapability.ISSUE]);
    });

    it('maps CONVERSATION to CHAT', () => {
      const intent = makeIntent([{ key: 'k', category: 'conversation', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].providerCapabilities).toEqual([ProviderCapability.CHAT]);
    });

    it('maps ARCHITECTURAL_CONTEXT to REPOSITORY + KNOWLEDGE', () => {
      const intent = makeIntent([{ key: 'k', category: 'component', value: 'v' }]);
      const coverage = makeCoverage([{ elementKey: 'k', level: CoverageLevel.NONE, bestScore: 0, matchCount: 0 }], ['k']);
      expect(service.analyse(intent, coverage).gaps[0].providerCapabilities).toEqual([ProviderCapability.REPOSITORY, ProviderCapability.KNOWLEDGE]);
    });
  });
});
