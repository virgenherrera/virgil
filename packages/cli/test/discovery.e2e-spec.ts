import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatProvider } from '../src/contracts/chat-provider.types.js';
import {
  IssueReferenceType,
  IssueStatus,
} from '../src/contracts/issue-provider.types.js';
import type {
  IssueProvider,
  NormalisedIssue,
} from '../src/contracts/issue-provider.types.js';
import type { KnowledgeProvider } from '../src/contracts/knowledge-provider.types.js';
import type { RepoProvider } from '../src/contracts/repo-provider.types.js';
import {
  CoverageLevel,
  CrawlBoundaryService,
  CrawlConfigSchema,
  DISCOVERY_CHAT_PROVIDER,
  DISCOVERY_ISSUE_PROVIDER,
  DISCOVERY_KNOWLEDGE_PROVIDER,
  DISCOVERY_REPO_PROVIDER,
  DiscoveryIntentSchema,
  DiscoveryModule,
  DiscoveryOutputSchema,
  EvidenceRefSchema,
  GapAnalysisService,
  GapCategory,
  GapPriority,
  GapSchema,
  IntentExtractionService,
  IssueResolutionService,
  KnownKnowledgeService,
  TargetedDiscoveryService,
} from '../src/discovery/index.js';
import type {
  CrawlConfig,
  DiscoveryIntent,
  Gap,
  KnowledgeCoverageResult,
} from '../src/discovery/index.js';
import { HybridRetrieverService } from '../src/rag/services/hybrid-retriever.service.js';
import {
  createContentHash,
  createTimestamp,
} from '../src/shared/primitives.js';
import type { ContentHash, SemVer, Timestamp } from '../src/shared/primitives.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../src/shared/provider.types.js';
import type { ProviderMetadata } from '../src/shared/provider.types.js';

// ---- Shared fixtures ----

const FIXTURE_TIMESTAMP = Date.now() as Timestamp;
const FIXTURE_HASH = createContentHash('test-content');

function fixtureProviderMeta(
  id: string,
  cap: ProviderCapability,
): ProviderMetadata {
  return {
    id,
    name: `Mock ${id}`,
    version: '0.0.1' as SemVer,
    capabilities: [cap],
  };
}

function fixtureIssue(overrides?: Partial<NormalisedIssue>): NormalisedIssue {
  return {
    id: 'issue-1',
    externalId: 'GH-123',
    title: 'Fix login bug in src/auth/handler.ts',
    description:
      'See https://example.com/docs and related #dev-ops channel. Linked to PROJ-456.',
    status: IssueStatus.OPEN,
    labels: ['auth', 'bug'],
    references: [
      {
        type: IssueReferenceType.ISSUE,
        uri: 'https://github.com/org/repo/issues/99',
        label: 'Related auth issue',
      },
      {
        type: IssueReferenceType.DOCUMENT,
        uri: 'https://wiki.example.com/auth-spec',
      },
      {
        type: IssueReferenceType.PULL_REQUEST,
        uri: 'https://github.com/org/repo/pull/50',
        label: 'Auth refactor',
      },
    ],
    identity: {
      uri: 'https://github.com/org/repo/issues/123',
      hash: FIXTURE_HASH,
      discoveredAt: FIXTURE_TIMESTAMP,
    },
    metadata: {},
    ...overrides,
  };
}

function fixtureConfig(overrides?: Partial<CrawlConfig>): CrawlConfig {
  return CrawlConfigSchema.parse({
    maxDepth: 3,
    maxQueries: 20,
    maxArtifacts: 50,
    perProviderBudget: 10,
    minRelevanceScore: 0.3,
    ...overrides,
  });
}

// ---- Mock factories ----

function createMockIssueProvider(
  issue?: NormalisedIssue,
): IssueProvider {
  const fixture = issue ?? fixtureIssue();
  return {
    metadata: fixtureProviderMeta('mock-issue', ProviderCapability.ISSUE),
    status: ProviderStatus.CONNECTED,
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    healthCheck: vi
      .fn<() => Promise<ProviderStatus>>()
      .mockResolvedValue(ProviderStatus.CONNECTED),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue(fixture),
    search: vi.fn().mockResolvedValue({ items: [fixture], hasMore: false }),
    listRelated: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    health: vi.fn().mockResolvedValue({
      status: 'healthy',
      lastChecked: FIXTURE_TIMESTAMP,
    }),
  };
}

function createMockKnowledgeProvider(): KnowledgeProvider {
  return {
    metadata: fixtureProviderMeta(
      'mock-knowledge',
      ProviderCapability.KNOWLEDGE,
    ),
    status: ProviderStatus.CONNECTED,
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    healthCheck: vi
      .fn<() => Promise<ProviderStatus>>()
      .mockResolvedValue(ProviderStatus.CONNECTED),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    discover: vi.fn().mockResolvedValue({
      items: [
        {
          identity: {
            uri: 'https://wiki.example.com/doc-1',
            hash: createContentHash('knowledge-doc'),
            discoveredAt: FIXTURE_TIMESTAMP,
          },
          title: 'Knowledge doc',
          mimeType: 'text/markdown',
          content: 'doc body',
          metadata: {},
        },
      ],
      hasMore: false,
    }),
    fetch: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    health: vi.fn().mockResolvedValue({
      status: 'healthy',
      lastChecked: FIXTURE_TIMESTAMP,
    }),
  };
}

function createMockRepoProvider(): RepoProvider {
  return {
    metadata: fixtureProviderMeta(
      'mock-repo',
      ProviderCapability.REPOSITORY,
    ),
    status: ProviderStatus.CONNECTED,
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    healthCheck: vi
      .fn<() => Promise<ProviderStatus>>()
      .mockResolvedValue(ProviderStatus.CONNECTED),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue({
      items: [
        {
          path: 'src/auth/handler.ts',
          size: 1024,
          lastModified: FIXTURE_TIMESTAMP,
        },
      ],
      hasMore: false,
    }),
    readFile: vi.fn(),
    getMetadata: vi.fn(),
    getGitContext: vi.fn(),
    health: vi.fn().mockResolvedValue({
      status: 'healthy',
      lastChecked: FIXTURE_TIMESTAMP,
    }),
  };
}

function createMockChatProvider(): ChatProvider {
  return {
    metadata: fixtureProviderMeta('mock-chat', ProviderCapability.CHAT),
    status: ProviderStatus.CONNECTED,
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    healthCheck: vi
      .fn<() => Promise<ProviderStatus>>()
      .mockResolvedValue(ProviderStatus.CONNECTED),
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchMessages: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'msg-1',
          channel: 'dev-ops',
          author: 'alice',
          content: 'relevant message',
          timestamp: FIXTURE_TIMESTAMP,
          identity: {
            uri: 'slack://msg-1',
            hash: createContentHash('relevant message'),
            discoveredAt: FIXTURE_TIMESTAMP,
          },
        },
      ],
      hasMore: false,
    }),
    getThread: vi.fn(),
    listChannels: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    health: vi.fn().mockResolvedValue({
      status: 'healthy',
      lastChecked: FIXTURE_TIMESTAMP,
    }),
  };
}

function createMockRetriever(
  results: Array<{ score: number }> = [],
): Pick<HybridRetrieverService, 'retrieveHybrid'> {
  return {
    retrieveHybrid: vi.fn().mockResolvedValue(results),
  };
}

// ---- Top-level mock instances (reused across module builds) ----

let mockIssueProvider: ReturnType<typeof createMockIssueProvider>;
let mockKnowledgeProvider: ReturnType<typeof createMockKnowledgeProvider>;
let mockRepoProvider: ReturnType<typeof createMockRepoProvider>;
let mockChatProvider: ReturnType<typeof createMockChatProvider>;
let mockRetriever: ReturnType<typeof createMockRetriever>;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DiscoveryModule (e2e)', () => {
  let moduleRef: TestingModule;

  /** Builds the test module using DiscoveryModule with global mock deps. */
  async function buildModule(
    retrieverResults: Array<{ score: number }> = [],
  ): Promise<TestingModule> {
    mockIssueProvider = createMockIssueProvider();
    mockKnowledgeProvider = createMockKnowledgeProvider();
    mockRepoProvider = createMockRepoProvider();
    mockChatProvider = createMockChatProvider();
    mockRetriever = createMockRetriever(retrieverResults);

    @Global()
    @Module({
      providers: [
        {
          provide: DISCOVERY_ISSUE_PROVIDER,
          useValue: mockIssueProvider,
        },
        {
          provide: DISCOVERY_KNOWLEDGE_PROVIDER,
          useValue: mockKnowledgeProvider,
        },
        {
          provide: DISCOVERY_REPO_PROVIDER,
          useValue: mockRepoProvider,
        },
        {
          provide: DISCOVERY_CHAT_PROVIDER,
          useValue: mockChatProvider,
        },
        { provide: HybridRetrieverService, useValue: mockRetriever },
      ],
      exports: [
        DISCOVERY_ISSUE_PROVIDER,
        DISCOVERY_KNOWLEDGE_PROVIDER,
        DISCOVERY_REPO_PROVIDER,
        DISCOVERY_CHAT_PROVIDER,
        HybridRetrieverService,
      ],
    })
    class MockDepsModule {}

    moduleRef = await Test.createTestingModule({
      imports: [MockDepsModule, DiscoveryModule],
    }).compile();

    return moduleRef;
  }

  afterEach(async () => {
    await moduleRef?.close();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------
  // DI wiring
  // -------------------------------------------------------------------

  describe('DI wiring', () => {
    it('compiles with all six services resolvable through DI', async () => {
      await buildModule();

      expect(moduleRef.get(IssueResolutionService)).toBeDefined();
      expect(moduleRef.get(IntentExtractionService)).toBeDefined();
      expect(moduleRef.get(KnownKnowledgeService)).toBeDefined();
      expect(moduleRef.get(GapAnalysisService)).toBeDefined();
      expect(moduleRef.get(CrawlBoundaryService)).toBeDefined();
      expect(moduleRef.get(TargetedDiscoveryService)).toBeDefined();
    });

    it('services are distinct instances', async () => {
      await buildModule();

      const services = [
        moduleRef.get(IssueResolutionService),
        moduleRef.get(IntentExtractionService),
        moduleRef.get(KnownKnowledgeService),
        moduleRef.get(GapAnalysisService),
        moduleRef.get(CrawlBoundaryService),
        moduleRef.get(TargetedDiscoveryService),
      ];

      const unique = new Set(services);
      expect(unique.size).toBe(6);
    });
  });

  // -------------------------------------------------------------------
  // Issue Resolution (D1)
  // -------------------------------------------------------------------

  describe('Issue Resolution (D1)', () => {
    it('resolves an issue through the mock IssueProvider', async () => {
      await buildModule();
      const resolver = moduleRef.get(IssueResolutionService);
      const result = await resolver.resolve('issue-1');

      expect(result.id).toBe('issue-1');
      expect(result.title).toBe('Fix login bug in src/auth/handler.ts');
      expect(mockIssueProvider.getIssue).toHaveBeenCalledWith('issue-1');
    });

    it('propagates provider errors', async () => {
      await buildModule();
      const resolver = moduleRef.get(IssueResolutionService);
      mockIssueProvider.getIssue.mockRejectedValueOnce(
        new Error('Issue not found'),
      );

      await expect(resolver.resolve('missing')).rejects.toThrow(
        'Issue not found',
      );
    });
  });

  // -------------------------------------------------------------------
  // Intent Extraction (D2)
  // -------------------------------------------------------------------

  describe('Intent Extraction (D2)', () => {
    it('extracts label-based elements', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      expect(intent.issueId).toBe('issue-1');
      const labelKeys = intent.elements
        .filter((e) => e.key.startsWith('label:'))
        .map((e) => e.value);
      expect(labelKeys).toContain('auth');
      expect(labelKeys).toContain('bug');
    });

    it('extracts issue reference elements', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const issueRefs = intent.elements.filter((e) =>
        e.key.startsWith('issue-ref:'),
      );
      expect(issueRefs.length).toBe(1);
      expect(issueRefs[0].value).toBe(
        'https://github.com/org/repo/issues/99',
      );
    });

    it('extracts document reference elements', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const docRefs = intent.elements.filter((e) =>
        e.key.startsWith('doc-ref:'),
      );
      expect(docRefs.length).toBe(1);
      expect(docRefs[0].value).toBe('https://wiki.example.com/auth-spec');
    });

    it('extracts PR reference elements', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const prRefs = intent.elements.filter((e) =>
        e.key.startsWith('pr-ref:'),
      );
      expect(prRefs.length).toBe(1);
      expect(prRefs[0].value).toBe('https://github.com/org/repo/pull/50');
    });

    it('extracts issue keys from text (PROJ-456)', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const issueKeys = intent.elements.filter((e) =>
        e.key.startsWith('issue-key:'),
      );
      expect(issueKeys.map((k) => k.value)).toContain('PROJ-456');
    });

    it('extracts URLs from text', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const urls = intent.elements.filter((e) => e.key.startsWith('url:'));
      expect(urls.length).toBeGreaterThanOrEqual(1);
      expect(urls.map((u) => u.value)).toContain('https://example.com/docs');
    });

    it('extracts file paths from text', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const paths = intent.elements.filter((e) => e.key.startsWith('path:'));
      expect(paths.map((p) => p.value)).toContain('src/auth/handler.ts');
    });

    it('extracts channel references from text', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const channels = intent.elements.filter((e) =>
        e.key.startsWith('channel:'),
      );
      expect(channels.map((c) => c.value)).toContain('dev-ops');
    });

    it('deduplicates elements by key', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const keys = intent.elements.map((e) => e.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('produces a fallback element when issue has no extractable content', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(
        fixtureIssue({
          labels: [],
          references: [],
          title: 'Generic task',
          description: 'Nothing extractable.',
        }),
      );

      expect(intent.elements.length).toBe(1);
      expect(intent.elements[0].key).toMatch(/^title:/);
    });

    it('result validates against DiscoveryIntentSchema', async () => {
      await buildModule();
      const extractor = moduleRef.get(IntentExtractionService);
      const intent = extractor.extract(fixtureIssue());

      const parsed = DiscoveryIntentSchema.safeParse(intent);
      expect(parsed.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Known-Knowledge Query (D3)
  // -------------------------------------------------------------------

  describe('Known-Knowledge Query (D3)', () => {
    it('returns NONE coverage when retriever returns no results', async () => {
      await buildModule([]); // empty retriever results
      const service = moduleRef.get(KnownKnowledgeService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
        ],
      };

      const result = await service.assess(intent, fixtureConfig());

      expect(result.coverages).toHaveLength(1);
      expect(result.coverages[0].level).toBe(CoverageLevel.NONE);
      expect(result.coverages[0].bestScore).toBe(0);
      expect(result.insufficientKeys).toContain('label:auth');
    });

    it('returns PARTIAL coverage with one relevant result', async () => {
      await buildModule([{ score: 0.5 }]);
      const service = moduleRef.get(KnownKnowledgeService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
        ],
      };

      const result = await service.assess(intent, fixtureConfig());

      expect(result.coverages[0].level).toBe(CoverageLevel.PARTIAL);
      expect(result.coverages[0].matchCount).toBe(1);
      expect(result.insufficientKeys).toContain('label:auth');
    });

    it('returns FULL coverage with multiple high-score results', async () => {
      await buildModule([{ score: 0.8 }, { score: 0.7 }]);
      const service = moduleRef.get(KnownKnowledgeService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
        ],
      };

      const result = await service.assess(intent, fixtureConfig());

      expect(result.coverages[0].level).toBe(CoverageLevel.FULL);
      expect(result.insufficientKeys).not.toContain('label:auth');
    });

    it('filters results below minRelevanceScore', async () => {
      await buildModule([{ score: 0.1 }, { score: 0.05 }]);
      const service = moduleRef.get(KnownKnowledgeService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
        ],
      };

      const result = await service.assess(intent, fixtureConfig());

      expect(result.coverages[0].level).toBe(CoverageLevel.NONE);
      expect(result.coverages[0].matchCount).toBe(0);
    });

    it('passes includeCode for architectural-area elements', async () => {
      await buildModule([]);
      const service = moduleRef.get(KnownKnowledgeService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'path:src/auth/handler.ts',
            category: 'architectural-area',
            description: 'File path',
            value: 'src/auth/handler.ts',
          },
        ],
      };

      await service.assess(intent, fixtureConfig());

      expect(mockRetriever.retrieveHybrid).toHaveBeenCalledWith(
        expect.objectContaining({ includeCode: true }),
      );
    });
  });

  // -------------------------------------------------------------------
  // Gap Analysis (D4)
  // -------------------------------------------------------------------

  describe('Gap Analysis (D4)', () => {
    function buildIntent(): DiscoveryIntent {
      return {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
          {
            key: 'doc-ref:https://wiki.example.com/spec',
            category: 'documentation',
            description: 'Spec doc',
            value: 'https://wiki.example.com/spec',
          },
          {
            key: 'path:src/auth/handler.ts',
            category: 'architectural-area',
            description: 'Auth handler',
            value: 'src/auth/handler.ts',
          },
          {
            key: 'channel:dev-ops',
            category: 'conversation',
            description: 'Dev-ops channel',
            value: 'dev-ops',
          },
        ],
      };
    }

    it('returns fullyCovered when all elements have FULL coverage', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);

      const coverage: KnowledgeCoverageResult = {
        coverages: [
          {
            elementKey: 'label:auth',
            level: CoverageLevel.FULL,
            bestScore: 0.9,
            matchCount: 3,
          },
          {
            elementKey: 'doc-ref:https://wiki.example.com/spec',
            level: CoverageLevel.FULL,
            bestScore: 0.85,
            matchCount: 2,
          },
        ],
        insufficientKeys: [],
      };

      const result = service.analyse(
        { issueId: 'issue-1', elements: buildIntent().elements.slice(0, 2) },
        coverage,
      );

      expect(result.fullyCovered).toBe(true);
      expect(result.gaps).toHaveLength(0);
    });

    it('identifies gaps for insufficient coverage elements', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);
      const intent = buildIntent();

      const coverage: KnowledgeCoverageResult = {
        coverages: [
          {
            elementKey: 'label:auth',
            level: CoverageLevel.NONE,
            bestScore: 0,
            matchCount: 0,
          },
          {
            elementKey: 'doc-ref:https://wiki.example.com/spec',
            level: CoverageLevel.PARTIAL,
            bestScore: 0.4,
            matchCount: 1,
          },
          {
            elementKey: 'path:src/auth/handler.ts',
            level: CoverageLevel.NONE,
            bestScore: 0,
            matchCount: 0,
          },
          {
            elementKey: 'channel:dev-ops',
            level: CoverageLevel.NONE,
            bestScore: 0,
            matchCount: 0,
          },
        ],
        insufficientKeys: [
          'label:auth',
          'doc-ref:https://wiki.example.com/spec',
          'path:src/auth/handler.ts',
          'channel:dev-ops',
        ],
      };

      const result = service.analyse(intent, coverage);

      expect(result.fullyCovered).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('maps categories to correct GapCategory values', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);
      const intent = buildIntent();

      const coverage: KnowledgeCoverageResult = {
        coverages: intent.elements.map((e) => ({
          elementKey: e.key,
          level: CoverageLevel.NONE,
          bestScore: 0,
          matchCount: 0,
        })),
        insufficientKeys: intent.elements.map((e) => e.key),
      };

      const result = service.analyse(intent, coverage);

      const categories = result.gaps.map((g) => g.category);
      expect(categories).toContain(GapCategory.ARCHITECTURAL_CONTEXT);
      expect(categories).toContain(GapCategory.DOCUMENTATION);
      expect(categories).toContain(GapCategory.CODE);
      expect(categories).toContain(GapCategory.CONVERSATION);
    });

    it('assigns HIGH priority for NONE coverage and MEDIUM for PARTIAL', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth',
            value: 'auth',
          },
          {
            key: 'doc-ref:spec',
            category: 'documentation',
            description: 'Spec',
            value: 'spec',
          },
        ],
      };

      const coverage: KnowledgeCoverageResult = {
        coverages: [
          {
            elementKey: 'label:auth',
            level: CoverageLevel.NONE,
            bestScore: 0,
            matchCount: 0,
          },
          {
            elementKey: 'doc-ref:spec',
            level: CoverageLevel.PARTIAL,
            bestScore: 0.4,
            matchCount: 1,
          },
        ],
        insufficientKeys: ['label:auth', 'doc-ref:spec'],
      };

      const result = service.analyse(intent, coverage);

      const authGap = result.gaps.find((g) =>
        g.intentElementKeys.includes('label:auth'),
      );
      const docGap = result.gaps.find((g) =>
        g.intentElementKeys.includes('doc-ref:spec'),
      );

      expect(authGap?.priority).toBe(GapPriority.HIGH);
      expect(docGap?.priority).toBe(GapPriority.MEDIUM);
    });

    it('sorts gaps by priority (HIGH first)', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);

      const intent: DiscoveryIntent = {
        issueId: 'issue-1',
        elements: [
          {
            key: 'doc-ref:spec',
            category: 'documentation',
            description: 'Spec',
            value: 'spec',
          },
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth',
            value: 'auth',
          },
        ],
      };

      const coverage: KnowledgeCoverageResult = {
        coverages: [
          {
            elementKey: 'doc-ref:spec',
            level: CoverageLevel.PARTIAL,
            bestScore: 0.4,
            matchCount: 1,
          },
          {
            elementKey: 'label:auth',
            level: CoverageLevel.NONE,
            bestScore: 0,
            matchCount: 0,
          },
        ],
        insufficientKeys: ['doc-ref:spec', 'label:auth'],
      };

      const result = service.analyse(intent, coverage);

      expect(result.gaps[0].priority).toBe(GapPriority.HIGH);
    });

    it('gaps validate against GapSchema', async () => {
      await buildModule();
      const service = moduleRef.get(GapAnalysisService);
      const intent = buildIntent();

      const coverage: KnowledgeCoverageResult = {
        coverages: intent.elements.map((e) => ({
          elementKey: e.key,
          level: CoverageLevel.NONE,
          bestScore: 0,
          matchCount: 0,
        })),
        insufficientKeys: intent.elements.map((e) => e.key),
      };

      const result = service.analyse(intent, coverage);

      for (const gap of result.gaps) {
        expect(GapSchema.safeParse(gap).success).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------
  // Targeted Discovery (D5)
  // -------------------------------------------------------------------

  describe('Targeted Discovery (D5)', () => {
    function buildIssueGap(): Gap {
      return {
        id: 'gap-0',
        intentElementKeys: ['issue-ref:related'],
        category: GapCategory.ISSUE_CONTEXT,
        description: 'Missing issue context',
        providerCapabilities: [ProviderCapability.ISSUE],
        priority: GapPriority.HIGH,
      };
    }

    function buildKnowledgeGap(): Gap {
      return {
        id: 'gap-1',
        intentElementKeys: ['doc-ref:spec'],
        category: GapCategory.DOCUMENTATION,
        description: 'Missing documentation',
        providerCapabilities: [ProviderCapability.KNOWLEDGE],
        priority: GapPriority.HIGH,
      };
    }

    function buildRepoGap(): Gap {
      return {
        id: 'gap-2',
        intentElementKeys: ['path:src/auth/handler.ts'],
        category: GapCategory.CODE,
        description: 'Missing code context',
        providerCapabilities: [ProviderCapability.REPOSITORY],
        priority: GapPriority.HIGH,
      };
    }

    function buildChatGap(): Gap {
      return {
        id: 'gap-3',
        intentElementKeys: ['channel:dev-ops'],
        category: GapCategory.CONVERSATION,
        description: 'Missing chat context',
        providerCapabilities: [ProviderCapability.CHAT],
        priority: GapPriority.MEDIUM,
      };
    }

    it('discovers evidence via the issue provider', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      const result = await service.discoverForGap(
        buildIssueGap(),
        'task-1',
      );

      expect(result.gapId).toBe('gap-0');
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.queriesIssued).toBe(1);
      expect(mockIssueProvider.search).toHaveBeenCalled();
    });

    it('discovers evidence via the knowledge provider', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      const result = await service.discoverForGap(
        buildKnowledgeGap(),
        'task-1',
      );

      expect(result.evidence.length).toBeGreaterThan(0);
      expect(mockKnowledgeProvider.discover).toHaveBeenCalled();
    });

    it('discovers evidence via the repo provider', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      const result = await service.discoverForGap(
        buildRepoGap(),
        'task-1',
      );

      expect(result.evidence.length).toBeGreaterThan(0);
      expect(mockRepoProvider.listFiles).toHaveBeenCalled();
    });

    it('discovers evidence via the chat provider', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      const result = await service.discoverForGap(
        buildChatGap(),
        'task-1',
      );

      expect(result.evidence.length).toBeGreaterThan(0);
      expect(mockChatProvider.searchMessages).toHaveBeenCalled();
    });

    it('records provenance trail for each query', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());
      service.resetTrail();

      await service.discoverForGap(buildIssueGap(), 'task-1');

      expect(service.trail.length).toBe(1);
      expect(service.trail[0].provider).toBe(ProviderCapability.ISSUE);
      expect(service.trail[0].resultCount).toBeGreaterThan(0);
    });

    it('resets provenance trail', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      await service.discoverForGap(buildIssueGap(), 'task-1');
      expect(service.trail.length).toBeGreaterThan(0);

      service.resetTrail();
      expect(service.trail.length).toBe(0);
    });

    it('evidence refs validate against EvidenceRefSchema', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig());

      const result = await service.discoverForGap(
        buildIssueGap(),
        'task-1',
      );

      for (const ref of result.evidence) {
        expect(EvidenceRefSchema.safeParse(ref).success).toBe(true);
      }
    });

    it('stops when boundary blocks queries', async () => {
      await buildModule();
      const service = moduleRef.get(TargetedDiscoveryService);
      const boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig({ maxQueries: 1, perProviderBudget: 1 }));

      // First gap consumes the single allowed query
      await service.discoverForGap(buildIssueGap(), 'task-1');

      // Second gap should be blocked
      const result = await service.discoverForGap(
        buildKnowledgeGap(),
        'task-1',
      );

      expect(result.queriesIssued).toBe(0);
      expect(result.boundaryHit).toBe('query_budget_exhausted');
    });
  });

  // -------------------------------------------------------------------
  // Crawl Boundary (D7)
  // -------------------------------------------------------------------

  describe('Crawl Boundary (D7)', () => {
    let boundary: CrawlBoundaryService;

    async function setupBoundary(
      configOverrides?: Partial<CrawlConfig>,
    ): Promise<void> {
      await buildModule();
      boundary = moduleRef.get(CrawlBoundaryService);
      boundary.configure(fixtureConfig(configOverrides));
    }

    it('allows queries within budget', async () => {
      await setupBoundary({ maxQueries: 5, perProviderBudget: 3 });

      expect(boundary.canQuery('issue')).toBe(true);
      boundary.recordQuery('issue');
      expect(boundary.queriesUsed).toBe(1);
    });

    it('blocks queries when max queries exceeded', async () => {
      await setupBoundary({ maxQueries: 2 });

      boundary.recordQuery('a');
      boundary.recordQuery('b');
      expect(boundary.canQuery('c')).toBe(false);
      expect(boundary.blockingReason('c')).toBe('query_budget_exhausted');
    });

    it('blocks queries when per-provider budget exceeded', async () => {
      await setupBoundary({ perProviderBudget: 1 });

      boundary.recordQuery('issue');
      expect(boundary.canQuery('issue')).toBe(false);
      expect(boundary.blockingReason('issue')).toBe(
        'provider_budget_exhausted',
      );
    });

    it('allows artifact collection within limit', async () => {
      await setupBoundary({ maxArtifacts: 3 });

      expect(boundary.canCollectArtifact()).toBe(true);
      boundary.recordArtifact();
      boundary.recordArtifact();
      boundary.recordArtifact();
      expect(boundary.canCollectArtifact()).toBe(false);
      expect(boundary.artifactsCollected).toBe(3);
    });

    it('blocks artifacts when limit reached', async () => {
      await setupBoundary({ maxArtifacts: 1 });

      boundary.recordArtifact();
      expect(boundary.canCollectArtifact()).toBe(false);
      expect(boundary.blockingReason()).toBe('artifact_limit_reached');
    });

    it('tracks depth with deepen and ascend', async () => {
      await setupBoundary({ maxDepth: 2 });

      expect(boundary.depth).toBe(0);
      expect(boundary.canDeepen()).toBe(true);

      boundary.deepen();
      expect(boundary.depth).toBe(1);
      expect(boundary.canDeepen()).toBe(true);

      boundary.deepen();
      expect(boundary.depth).toBe(2);
      expect(boundary.canDeepen()).toBe(false);
      expect(boundary.blockingReason()).toBe('depth_limit_reached');

      boundary.ascend();
      expect(boundary.depth).toBe(1);
      expect(boundary.canDeepen()).toBe(true);
    });

    it('ascend does not go below zero', async () => {
      await setupBoundary();

      boundary.ascend();
      expect(boundary.depth).toBe(0);
    });

    it('detects circular references', async () => {
      await setupBoundary();

      expect(boundary.visitReference('ref-a')).toBe(true);
      expect(boundary.visitReference('ref-b')).toBe(true);
      expect(boundary.visitReference('ref-a')).toBe(false); // circular

      expect(boundary.circularReferences).toContain('ref-a');
    });

    it('resets all counters on reconfigure', async () => {
      await setupBoundary({ maxQueries: 5 });

      boundary.recordQuery('a');
      boundary.recordArtifact();
      boundary.deepen();
      boundary.visitReference('ref-x');

      boundary.configure(fixtureConfig());

      expect(boundary.queriesUsed).toBe(0);
      expect(boundary.artifactsCollected).toBe(0);
      expect(boundary.depth).toBe(0);
      expect(boundary.circularReferences).toHaveLength(0);
      expect(boundary.visitReference('ref-x')).toBe(true); // no longer visited
    });
  });

  // -------------------------------------------------------------------
  // Schema validation
  // -------------------------------------------------------------------

  describe('Schema validation', () => {
    it('CrawlConfigSchema accepts valid config and fills defaults', () => {
      const result = CrawlConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxDepth).toBe(3);
        expect(result.data.maxQueries).toBe(20);
        expect(result.data.maxArtifacts).toBe(50);
        expect(result.data.perProviderBudget).toBe(10);
        expect(result.data.minRelevanceScore).toBe(0.3);
      }
    });

    it('CrawlConfigSchema rejects negative maxDepth', () => {
      const result = CrawlConfigSchema.safeParse({ maxDepth: -1 });
      expect(result.success).toBe(false);
    });

    it('DiscoveryIntentSchema accepts valid intent', () => {
      const result = DiscoveryIntentSchema.safeParse({
        issueId: 'issue-1',
        elements: [
          {
            key: 'label:auth',
            category: 'component',
            description: 'Auth component',
            value: 'auth',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('DiscoveryIntentSchema rejects empty issueId', () => {
      const result = DiscoveryIntentSchema.safeParse({
        issueId: '',
        elements: [],
      });
      expect(result.success).toBe(false);
    });

    it('GapSchema accepts valid gap', () => {
      const result = GapSchema.safeParse({
        id: 'gap-0',
        intentElementKeys: ['key-1'],
        category: GapCategory.CODE,
        description: 'Missing code',
        providerCapabilities: [ProviderCapability.REPOSITORY],
        priority: GapPriority.HIGH,
      });
      expect(result.success).toBe(true);
    });

    it('GapSchema rejects gap without intentElementKeys', () => {
      const result = GapSchema.safeParse({
        id: 'gap-0',
        intentElementKeys: [],
        category: GapCategory.CODE,
        description: 'Missing code',
        providerCapabilities: [ProviderCapability.REPOSITORY],
        priority: GapPriority.HIGH,
      });
      expect(result.success).toBe(false);
    });

    it('EvidenceRefSchema accepts valid evidence', () => {
      const result = EvidenceRefSchema.safeParse({
        providerId: 'issue',
        sourceUri: 'https://github.com/org/repo/issues/1',
        contentHash: FIXTURE_HASH,
        discoveredAt: FIXTURE_TIMESTAMP,
        taskAssociation: 'task-1',
        title: 'Issue title',
        mimeType: 'application/json',
      });
      expect(result.success).toBe(true);
    });

    it('EvidenceRefSchema rejects invalid contentHash', () => {
      const result = EvidenceRefSchema.safeParse({
        providerId: 'issue',
        sourceUri: 'https://github.com/org/repo/issues/1',
        contentHash: 'not-a-valid-hash',
        discoveredAt: FIXTURE_TIMESTAMP,
        taskAssociation: 'task-1',
        title: 'Issue title',
      });
      expect(result.success).toBe(false);
    });

    it('DiscoveryOutputSchema accepts valid output', () => {
      const result = DiscoveryOutputSchema.safeParse({
        version: '1.0.0',
        issue: {
          id: 'issue-1',
          externalId: 'GH-123',
          title: 'Bug fix',
          description: 'Fix the thing',
          labels: ['bug'],
        },
        intent: {
          issueId: 'issue-1',
          elements: [
            {
              key: 'label:bug',
              category: 'component',
              description: 'Bug',
              value: 'bug',
            },
          ],
        },
        coverageSummary: { coverages: [], insufficientKeys: [] },
        resolvedEvidence: [],
        unresolvedGaps: [],
        provenanceTrail: [],
        queryHints: [],
        circularReferences: [],
      });
      expect(result.success).toBe(true);
    });

    it('DiscoveryOutputSchema rejects missing version', () => {
      const result = DiscoveryOutputSchema.safeParse({
        issue: { id: 'x', externalId: 'x', title: 'x', description: '', labels: [] },
        intent: { issueId: 'x', elements: [] },
        coverageSummary: { coverages: [], insufficientKeys: [] },
        resolvedEvidence: [],
        unresolvedGaps: [],
        provenanceTrail: [],
        queryHints: [],
        circularReferences: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
