import { TargetedDiscoveryService } from '../../src/discovery/targeted-discovery.service.js';
import { CrawlBoundaryService } from '../../src/discovery/crawl-boundary.service.js';
import type { Gap } from '../../src/discovery/discovery.schemas.js';
import { GapCategory, GapPriority } from '../../src/discovery/discovery.schemas.js';
import type { IssueProvider } from '../../src/contracts/issue-provider.types.js';
import type { KnowledgeProvider } from '../../src/contracts/knowledge-provider.types.js';
import type { RepoProvider } from '../../src/contracts/repo-provider.types.js';
import type { ChatProvider } from '../../src/contracts/chat-provider.types.js';
import { ProviderCapability, ProviderStatus } from '../../src/shared/provider.types.js';
import { createContentHash, createTimestamp } from '../../src/shared/primitives.js';
import type { SemVer } from '../../src/shared/primitives.js';
import type { CrawlConfig } from '../../src/discovery/discovery.schemas.js';

const PROVIDER_BASE = {
  initialize: vi.fn(),
  healthCheck: vi.fn(),
  dispose: vi.fn(),
  metadata: { id: 'test', name: 'test', version: '0.1.0' as SemVer, capabilities: [] },
  status: ProviderStatus.CONNECTED,
};

function makeIssueProvider(): IssueProvider {
  return {
    ...PROVIDER_BASE,
    getIssue: vi.fn(),
    search: vi.fn(),
    listRelated: vi.fn(),
    health: vi.fn(),
  };
}

function makeKnowledgeProvider(): KnowledgeProvider {
  return {
    ...PROVIDER_BASE,
    discover: vi.fn(),
    fetch: vi.fn(),
    list: vi.fn(),
    health: vi.fn(),
  };
}

function makeRepoProvider(): RepoProvider {
  return {
    ...PROVIDER_BASE,
    listFiles: vi.fn(),
    readFile: vi.fn(),
    getMetadata: vi.fn(),
    getGitContext: vi.fn(),
    health: vi.fn(),
  };
}

function makeChatProvider(): ChatProvider {
  return {
    ...PROVIDER_BASE,
    searchMessages: vi.fn(),
    getThread: vi.fn(),
    listChannels: vi.fn(),
    health: vi.fn(),
  };
}

function makeGap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: 'gap-0',
    intentElementKeys: ['label:auth'],
    category: GapCategory.ISSUE_CONTEXT,
    description: 'Missing issue context',
    providerCapabilities: [ProviderCapability.ISSUE],
    priority: GapPriority.HIGH,
    ...overrides,
  };
}

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

function makeIdentity(uri: string) {
  return { uri, hash: createContentHash(uri), discoveredAt: createTimestamp() };
}

describe('TargetedDiscoveryService', () => {
  let service: TargetedDiscoveryService;
  let issueProvider: IssueProvider;
  let knowledgeProvider: KnowledgeProvider;
  let repoProvider: RepoProvider;
  let chatProvider: ChatProvider;
  let boundaries: CrawlBoundaryService;

  beforeEach(() => {
    issueProvider = makeIssueProvider();
    knowledgeProvider = makeKnowledgeProvider();
    repoProvider = makeRepoProvider();
    chatProvider = makeChatProvider();
    boundaries = new CrawlBoundaryService();
    boundaries.configure(makeConfig());

    service = new TargetedDiscoveryService(
      issueProvider,
      knowledgeProvider,
      repoProvider,
      chatProvider,
      boundaries,
    );
  });

  it('discovers evidence from issue provider', async () => {
    vi.mocked(issueProvider.search).mockResolvedValue({
      items: [{ id: '1', externalId: 'e1', title: 'Issue 1', description: '', status: 'open', labels: [], references: [], identity: makeIdentity('issue://1'), metadata: {} }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].providerId).toBe(ProviderCapability.ISSUE);
    expect(result.evidence[0].sourceUri).toBe('issue://1');
    expect(result.queriesIssued).toBe(1);
  });

  it('discovers evidence from knowledge provider', async () => {
    vi.mocked(knowledgeProvider.discover).mockResolvedValue({
      items: [{ identity: makeIdentity('doc://1'), title: 'Doc 1', mimeType: 'text/markdown', content: 'content', metadata: {} }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.KNOWLEDGE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].providerId).toBe(ProviderCapability.KNOWLEDGE);
    expect(result.evidence[0].mimeType).toBe('text/markdown');
  });

  it('discovers evidence from repo provider', async () => {
    vi.mocked(repoProvider.listFiles).mockResolvedValue({
      items: [{ path: 'src/auth.ts', mimeType: 'text/typescript', size: 100, lastModified: createTimestamp() }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.REPOSITORY] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].providerId).toBe(ProviderCapability.REPOSITORY);
    expect(result.evidence[0].sourceUri).toBe('src/auth.ts');
  });

  it('discovers evidence from chat provider', async () => {
    vi.mocked(chatProvider.searchMessages).mockResolvedValue({
      items: [{
        id: 'msg-1', channel: 'dev', author: 'alice', content: 'hello',
        timestamp: createTimestamp(), identity: makeIdentity('chat://msg-1'),
      }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.CHAT] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].providerId).toBe(ProviderCapability.CHAT);
    expect(result.evidence[0].title).toBe('Message by alice in dev');
  });

  it('stops when canQuery returns false', async () => {
    boundaries.configure(makeConfig({ maxQueries: 0 }));

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toEqual([]);
    expect(result.boundaryHit).toBe('query_budget_exhausted');
    expect(issueProvider.search).not.toHaveBeenCalled();
  });

  it('stops when canCollectArtifact returns false', async () => {
    boundaries.configure(makeConfig({ maxArtifacts: 0 }));

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toEqual([]);
    expect(result.boundaryHit).toBe('artifact_limit_reached');
  });

  it('skips circular references', async () => {
    vi.mocked(issueProvider.search).mockResolvedValue({
      items: [
        { id: '1', externalId: 'e1', title: 'Issue 1', description: '', status: 'open', labels: [], references: [], identity: makeIdentity('issue://1'), metadata: {} },
        { id: '2', externalId: 'e2', title: 'Issue 2', description: '', status: 'open', labels: [], references: [], identity: makeIdentity('issue://1'), metadata: {} },
      ],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(1);
    expect(boundaries.circularReferences).toEqual(['issue://1']);
  });

  it('handles failed queries gracefully', async () => {
    vi.mocked(issueProvider.search).mockRejectedValue(new Error('Network error'));

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toEqual([]);
    expect(result.queriesIssued).toBe(0);
    expect(service.trail).toHaveLength(1);
    expect(service.trail[0].resultCount).toBe(0);
  });

  it('records provenance trail entries', async () => {
    vi.mocked(issueProvider.search).mockResolvedValue({
      items: [{ id: '1', externalId: 'e1', title: 'Issue', description: '', status: 'open', labels: [], references: [], identity: makeIdentity('issue://1'), metadata: {} }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    await service.discoverForGap(gap, 'task-1');

    expect(service.trail).toHaveLength(1);
    expect(service.trail[0].provider).toBe(ProviderCapability.ISSUE);
    expect(service.trail[0].resultCount).toBe(1);
  });

  it('resetTrail clears provenance', async () => {
    vi.mocked(issueProvider.search).mockResolvedValue({ items: [], hasMore: false });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.ISSUE] });
    await service.discoverForGap(gap, 'task-1');
    expect(service.trail).toHaveLength(1);

    service.resetTrail();
    expect(service.trail).toEqual([]);
  });

  it('returns empty evidence when optional provider is null', async () => {
    const serviceWithoutOptionals = new TargetedDiscoveryService(
      issueProvider, null, null, null, boundaries,
    );

    const gap = makeGap({ providerCapabilities: [ProviderCapability.KNOWLEDGE] });
    const result = await serviceWithoutOptionals.discoverForGap(gap, 'task-1');

    expect(result.evidence).toEqual([]);
    expect(result.queriesIssued).toBe(1);
  });

  it('queries multiple providers for a multi-capability gap', async () => {
    vi.mocked(repoProvider.listFiles).mockResolvedValue({
      items: [{ path: 'src/auth.ts', mimeType: 'text/typescript', size: 100, lastModified: createTimestamp() }],
      hasMore: false,
    });
    vi.mocked(knowledgeProvider.discover).mockResolvedValue({
      items: [{ identity: makeIdentity('doc://1'), title: 'Doc', mimeType: 'text/plain', content: 'c', metadata: {} }],
      hasMore: false,
    });

    const gap = makeGap({
      providerCapabilities: [ProviderCapability.REPOSITORY, ProviderCapability.KNOWLEDGE],
    });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence).toHaveLength(2);
    expect(result.queriesIssued).toBe(2);
  });

  it('uses repo file mimeType fallback', async () => {
    vi.mocked(repoProvider.listFiles).mockResolvedValue({
      items: [{ path: 'Makefile', size: 50, lastModified: createTimestamp() }],
      hasMore: false,
    });

    const gap = makeGap({ providerCapabilities: [ProviderCapability.REPOSITORY] });
    const result = await service.discoverForGap(gap, 'task-1');

    expect(result.evidence[0].mimeType).toBe('application/octet-stream');
  });
});
