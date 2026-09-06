import { CrawlBoundaryService } from '../../src/discovery/crawl-boundary.service.js';
import type { CrawlConfig } from '../../src/discovery/discovery.schemas.js';

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

describe('CrawlBoundaryService', () => {
  let service: CrawlBoundaryService;

  beforeEach(() => {
    service = new CrawlBoundaryService();
    service.configure(makeConfig());
  });

  describe('configure()', () => {
    it('resets all state on reconfigure', () => {
      service.recordQuery('p1');
      service.recordArtifact();
      service.deepen();
      service.visitReference('ref-1');

      service.configure(makeConfig());

      expect(service.queriesUsed).toBe(0);
      expect(service.artifactsCollected).toBe(0);
      expect(service.depth).toBe(0);
      expect(service.circularReferences).toEqual([]);
      expect(service.canQuery('p1')).toBe(true);
    });
  });

  describe('canQuery / recordQuery', () => {
    it('allows queries within budget', () => {
      expect(service.canQuery('p1')).toBe(true);
      service.recordQuery('p1');
      expect(service.queriesUsed).toBe(1);
    });

    it('blocks when total query budget exhausted', () => {
      service.configure(makeConfig({ maxQueries: 2 }));
      service.recordQuery('p1');
      service.recordQuery('p2');
      expect(service.canQuery('p3')).toBe(false);
    });

    it('blocks when per-provider budget exhausted', () => {
      service.configure(makeConfig({ perProviderBudget: 2 }));
      service.recordQuery('p1');
      service.recordQuery('p1');
      expect(service.canQuery('p1')).toBe(false);
      expect(service.canQuery('p2')).toBe(true);
    });
  });

  describe('canCollectArtifact / recordArtifact', () => {
    it('allows artifacts within limit', () => {
      expect(service.canCollectArtifact()).toBe(true);
      service.recordArtifact();
      expect(service.artifactsCollected).toBe(1);
    });

    it('blocks when artifact limit reached', () => {
      service.configure(makeConfig({ maxArtifacts: 2 }));
      service.recordArtifact();
      service.recordArtifact();
      expect(service.canCollectArtifact()).toBe(false);
    });
  });

  describe('canDeepen / deepen / ascend', () => {
    it('allows deepening within limit', () => {
      expect(service.canDeepen()).toBe(true);
      service.deepen();
      expect(service.depth).toBe(1);
    });

    it('blocks at max depth', () => {
      service.configure(makeConfig({ maxDepth: 2 }));
      service.deepen();
      service.deepen();
      expect(service.canDeepen()).toBe(false);
    });

    it('ascend decreases depth', () => {
      service.deepen();
      service.deepen();
      service.ascend();
      expect(service.depth).toBe(1);
    });

    it('ascend does not go below zero', () => {
      service.ascend();
      expect(service.depth).toBe(0);
    });
  });

  describe('visitReference', () => {
    it('returns true for new references', () => {
      expect(service.visitReference('ref-1')).toBe(true);
    });

    it('returns false for already-visited references', () => {
      service.visitReference('ref-1');
      expect(service.visitReference('ref-1')).toBe(false);
    });

    it('records circular references', () => {
      service.visitReference('ref-1');
      service.visitReference('ref-1');
      expect(service.circularReferences).toEqual(['ref-1']);
    });

    it('tracks multiple circular references', () => {
      service.visitReference('ref-1');
      service.visitReference('ref-2');
      service.visitReference('ref-1');
      service.visitReference('ref-2');
      expect(service.circularReferences).toEqual(['ref-1', 'ref-2']);
    });
  });

  describe('blockingReason', () => {
    it('returns undefined when no limits hit', () => {
      expect(service.blockingReason()).toBeUndefined();
    });

    it('returns query_budget_exhausted', () => {
      service.configure(makeConfig({ maxQueries: 1 }));
      service.recordQuery('p1');
      expect(service.blockingReason()).toBe('query_budget_exhausted');
    });

    it('returns artifact_limit_reached', () => {
      service.configure(makeConfig({ maxArtifacts: 1 }));
      service.recordArtifact();
      expect(service.blockingReason()).toBe('artifact_limit_reached');
    });

    it('returns depth_limit_reached', () => {
      service.configure(makeConfig({ maxDepth: 1 }));
      service.deepen();
      expect(service.blockingReason()).toBe('depth_limit_reached');
    });

    it('returns provider_budget_exhausted for specific provider', () => {
      service.configure(makeConfig({ perProviderBudget: 1 }));
      service.recordQuery('p1');
      expect(service.blockingReason('p1')).toBe('provider_budget_exhausted');
    });

    it('does not return provider_budget_exhausted for other providers', () => {
      service.configure(makeConfig({ perProviderBudget: 1 }));
      service.recordQuery('p1');
      expect(service.blockingReason('p2')).toBeUndefined();
    });
  });

  describe('getters', () => {
    it('depth returns current depth', () => {
      expect(service.depth).toBe(0);
      service.deepen();
      expect(service.depth).toBe(1);
    });

    it('queriesUsed returns total queries', () => {
      expect(service.queriesUsed).toBe(0);
      service.recordQuery('p1');
      service.recordQuery('p2');
      expect(service.queriesUsed).toBe(2);
    });

    it('artifactsCollected returns total artifacts', () => {
      expect(service.artifactsCollected).toBe(0);
      service.recordArtifact();
      expect(service.artifactsCollected).toBe(1);
    });

    it('circularReferences returns a copy', () => {
      service.visitReference('ref-1');
      service.visitReference('ref-1');
      const refs = service.circularReferences;
      expect(refs).toEqual(['ref-1']);
      // Verify it is a copy
      expect(refs).not.toBe(service.circularReferences);
    });
  });
});
