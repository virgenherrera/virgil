import { Module } from '@nestjs/common';
import { CrawlBoundaryService } from './crawl-boundary.service.js';
import { GapAnalysisService } from './gap-analysis.service.js';
import { IntentExtractionService } from './intent-extraction.service.js';
import { IssueResolutionService } from './issue-resolution.service.js';
import { KnownKnowledgeService } from './known-knowledge.service.js';
import { TargetedDiscoveryService } from './targeted-discovery.service.js';

@Module({
  providers: [
    IssueResolutionService, IntentExtractionService, KnownKnowledgeService,
    GapAnalysisService, CrawlBoundaryService, TargetedDiscoveryService,
  ],
  exports: [
    IssueResolutionService, IntentExtractionService, KnownKnowledgeService,
    GapAnalysisService, CrawlBoundaryService, TargetedDiscoveryService,
  ],
})
export class DiscoveryModule {}
