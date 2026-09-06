import {
  CrawlConfigSchema,
  IntentElementSchema,
  DiscoveryIntentSchema,
  GapSchema,
  EvidenceRefSchema,
  GapCategory,
  GapPriority,
} from '../../src/discovery/discovery.schemas.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';

describe('CrawlConfigSchema', () => {
  it('applies defaults when no values provided', () => {
    const result = CrawlConfigSchema.parse({});
    expect(result).toEqual({
      maxDepth: 3,
      maxQueries: 20,
      maxArtifacts: 50,
      perProviderBudget: 10,
      minRelevanceScore: 0.3,
    });
  });

  it('accepts valid explicit values', () => {
    const input = { maxDepth: 5, maxQueries: 30, maxArtifacts: 100, perProviderBudget: 15, minRelevanceScore: 0.5 };
    const result = CrawlConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('rejects non-positive maxDepth', () => {
    expect(() => CrawlConfigSchema.parse({ maxDepth: 0 })).toThrow();
    expect(() => CrawlConfigSchema.parse({ maxDepth: -1 })).toThrow();
  });

  it('rejects non-positive maxQueries', () => {
    expect(() => CrawlConfigSchema.parse({ maxQueries: 0 })).toThrow();
  });

  it('rejects non-positive maxArtifacts', () => {
    expect(() => CrawlConfigSchema.parse({ maxArtifacts: -5 })).toThrow();
  });

  it('rejects non-positive perProviderBudget', () => {
    expect(() => CrawlConfigSchema.parse({ perProviderBudget: 0 })).toThrow();
  });

  it('rejects minRelevanceScore out of range', () => {
    expect(() => CrawlConfigSchema.parse({ minRelevanceScore: -0.1 })).toThrow();
    expect(() => CrawlConfigSchema.parse({ minRelevanceScore: 1.1 })).toThrow();
  });

  it('accepts boundary minRelevanceScore values', () => {
    expect(CrawlConfigSchema.parse({ minRelevanceScore: 0 }).minRelevanceScore).toBe(0);
    expect(CrawlConfigSchema.parse({ minRelevanceScore: 1 }).minRelevanceScore).toBe(1);
  });

  it('rejects non-integer maxDepth', () => {
    expect(() => CrawlConfigSchema.parse({ maxDepth: 2.5 })).toThrow();
  });
});

describe('IntentElementSchema', () => {
  it('accepts valid element', () => {
    const element = { key: 'label:auth', category: 'component' as const, description: 'Auth component', value: 'auth' };
    expect(IntentElementSchema.parse(element)).toEqual(element);
  });

  it('rejects empty key', () => {
    expect(() => IntentElementSchema.parse({ key: '', category: 'component', description: 'test', value: '' })).toThrow();
  });

  it('rejects invalid category', () => {
    expect(() => IntentElementSchema.parse({ key: 'k', category: 'invalid', description: 'test', value: '' })).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => IntentElementSchema.parse({ key: 'k', category: 'component', description: '', value: '' })).toThrow();
  });

  it('accepts all valid categories', () => {
    const categories = ['component', 'documentation', 'related-issue', 'architectural-area', 'conversation'] as const;
    for (const category of categories) {
      const result = IntentElementSchema.parse({ key: 'k', category, description: 'd', value: 'v' });
      expect(result.category).toBe(category);
    }
  });
});

describe('DiscoveryIntentSchema', () => {
  it('accepts valid intent', () => {
    const intent = {
      issueId: 'PROJ-42',
      elements: [{ key: 'label:auth', category: 'component' as const, description: 'Auth', value: 'auth' }],
    };
    expect(DiscoveryIntentSchema.parse(intent)).toEqual(intent);
  });

  it('accepts empty elements array', () => {
    const intent = { issueId: 'PROJ-1', elements: [] };
    expect(DiscoveryIntentSchema.parse(intent).elements).toEqual([]);
  });

  it('rejects empty issueId', () => {
    expect(() => DiscoveryIntentSchema.parse({ issueId: '', elements: [] })).toThrow();
  });
});

describe('GapSchema', () => {
  it('accepts valid gap', () => {
    const gap = {
      id: 'gap-0',
      intentElementKeys: ['label:auth'],
      category: GapCategory.CODE,
      description: 'Missing code coverage',
      providerCapabilities: ['repository'],
      priority: GapPriority.HIGH,
    };
    expect(GapSchema.parse(gap)).toEqual(gap);
  });

  it('rejects empty intentElementKeys', () => {
    expect(() => GapSchema.parse({
      id: 'gap-0', intentElementKeys: [], category: GapCategory.CODE,
      description: 'test', providerCapabilities: ['repository'], priority: GapPriority.HIGH,
    })).toThrow();
  });

  it('rejects empty providerCapabilities', () => {
    expect(() => GapSchema.parse({
      id: 'gap-0', intentElementKeys: ['k'], category: GapCategory.CODE,
      description: 'test', providerCapabilities: [], priority: GapPriority.HIGH,
    })).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => GapSchema.parse({
      id: '', intentElementKeys: ['k'], category: GapCategory.CODE,
      description: 'test', providerCapabilities: ['repo'], priority: GapPriority.HIGH,
    })).toThrow();
  });
});

describe('EvidenceRefSchema', () => {
  it('accepts valid evidence ref', () => {
    const ref = {
      providerId: 'issue',
      sourceUri: 'https://example.com/issue/1',
      contentHash: createContentHash('test-content'),
      discoveredAt: createTimestamp(),
      taskAssociation: 'PROJ-42',
      title: 'Test Issue',
      mimeType: 'application/json',
    };
    const result = EvidenceRefSchema.parse(ref);
    expect(result.providerId).toBe('issue');
    expect(result.sourceUri).toBe('https://example.com/issue/1');
    expect(result.title).toBe('Test Issue');
  });

  it('defaults mimeType to text/plain', () => {
    const ref = {
      providerId: 'issue',
      sourceUri: 'uri',
      contentHash: createContentHash('content'),
      discoveredAt: createTimestamp(),
      taskAssociation: 'task-1',
      title: 'Test',
    };
    const result = EvidenceRefSchema.parse(ref);
    expect(result.mimeType).toBe('text/plain');
  });

  it('rejects empty providerId', () => {
    expect(() => EvidenceRefSchema.parse({
      providerId: '', sourceUri: 'uri', contentHash: createContentHash('c'),
      discoveredAt: createTimestamp(), taskAssociation: 't', title: 'T',
    })).toThrow();
  });

  it('rejects invalid contentHash', () => {
    expect(() => EvidenceRefSchema.parse({
      providerId: 'p', sourceUri: 'uri', contentHash: 'not-a-hash',
      discoveredAt: createTimestamp(), taskAssociation: 't', title: 'T',
    })).toThrow();
  });
});
