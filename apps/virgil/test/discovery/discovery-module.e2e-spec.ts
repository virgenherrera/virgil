import { Test } from '@nestjs/testing';
import { CrawlBoundaryService } from '../../src/discovery/crawl-boundary.service.js';
import { GapAnalysisService } from '../../src/discovery/gap-analysis.service.js';
import { IntentExtractionService } from '../../src/discovery/intent-extraction.service.js';
import { IssueResolutionService } from '../../src/discovery/issue-resolution.service.js';
import { KnownKnowledgeService } from '../../src/discovery/known-knowledge.service.js';
import { TargetedDiscoveryService } from '../../src/discovery/targeted-discovery.service.js';
import {
  DISCOVERY_ISSUE_PROVIDER,
  DISCOVERY_KNOWLEDGE_PROVIDER,
  DISCOVERY_REPO_PROVIDER,
  DISCOVERY_CHAT_PROVIDER,
} from '../../src/discovery/discovery.constants.js';
import { ProviderStatus } from '../../src/shared/provider.types.js';
import type { SemVer } from '../../src/shared/primitives.js';
import { HybridRetrieverService } from '../../src/rag/services/hybrid-retriever.service.js';

const PROVIDER_BASE = {
  initialize: vi.fn(),
  healthCheck: vi.fn(),
  dispose: vi.fn(),
  metadata: { id: 'test', name: 'test', version: '0.1.0' as SemVer, capabilities: [] },
  status: ProviderStatus.CONNECTED,
};

describe('DiscoveryModule', () => {
  it('compiles and provides all services', async () => {
    const module = await Test.createTestingModule({
      providers: [
        IssueResolutionService,
        IntentExtractionService,
        KnownKnowledgeService,
        GapAnalysisService,
        CrawlBoundaryService,
        TargetedDiscoveryService,
        { provide: DISCOVERY_ISSUE_PROVIDER, useValue: { ...PROVIDER_BASE, getIssue: vi.fn(), search: vi.fn(), listRelated: vi.fn(), health: vi.fn() } },
        { provide: DISCOVERY_KNOWLEDGE_PROVIDER, useValue: null },
        { provide: DISCOVERY_REPO_PROVIDER, useValue: null },
        { provide: DISCOVERY_CHAT_PROVIDER, useValue: null },
        { provide: HybridRetrieverService, useValue: { retrieveHybrid: vi.fn() } },
      ],
    }).compile();

    expect(module.get(CrawlBoundaryService)).toBeDefined();
    expect(module.get(GapAnalysisService)).toBeDefined();
    expect(module.get(IntentExtractionService)).toBeDefined();
    expect(module.get(IssueResolutionService)).toBeDefined();
    expect(module.get(KnownKnowledgeService)).toBeDefined();
    expect(module.get(TargetedDiscoveryService)).toBeDefined();
  });
});
