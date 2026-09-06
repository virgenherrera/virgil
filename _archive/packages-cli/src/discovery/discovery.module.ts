import { Module } from '@nestjs/common';
import { CrawlBoundaryService } from './crawl-boundary.service.js';
import { GapAnalysisService } from './gap-analysis.service.js';
import { IntentExtractionService } from './intent-extraction.service.js';
import { IssueResolutionService } from './issue-resolution.service.js';
import { KnownKnowledgeService } from './known-knowledge.service.js';
import { TargetedDiscoveryService } from './targeted-discovery.service.js';

/**
 * H08 Progressive Discovery Module.
 *
 * Provides the progressive-discovery pipeline: issue resolution (D1),
 * intent extraction (D2), known-knowledge assessment (D3), gap analysis
 * (D4), targeted discovery (D5), and crawl-boundary enforcement (D7).
 *
 * External DI tokens (`DISCOVERY_ISSUE_PROVIDER`,
 * `DISCOVERY_KNOWLEDGE_PROVIDER`, `DISCOVERY_REPO_PROVIDER`,
 * `DISCOVERY_CHAT_PROVIDER`) and `HybridRetrieverService` must be
 * provided by the consuming module (typically via a `@Global()` module
 * or the parent module's provider array).
 *
 * Origin: H08 handoff — Progressive Discovery.
 */
@Module({
  providers: [
    IssueResolutionService,
    IntentExtractionService,
    KnownKnowledgeService,
    GapAnalysisService,
    CrawlBoundaryService,
    TargetedDiscoveryService,
  ],
  exports: [
    IssueResolutionService,
    IntentExtractionService,
    KnownKnowledgeService,
    GapAnalysisService,
    CrawlBoundaryService,
    TargetedDiscoveryService,
  ],
})
export class DiscoveryModule {}
