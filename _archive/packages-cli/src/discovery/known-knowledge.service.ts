import { Injectable } from '@nestjs/common';
import { HybridRetrieverService } from '../rag/services/hybrid-retriever.service.js';
import type {
  CrawlConfig,
  DiscoveryIntent,
  IntentCoverage,
  KnowledgeCoverageResult,
} from './discovery.schemas.js';
import { CoverageLevel } from './discovery.schemas.js';

/** Threshold multipliers for coverage classification. */
const FULL_COVERAGE_MIN_MATCHES = 2;

/**
 * Queries the local knowledge store before any provider-directed discovery (D3).
 *
 * Translates discovery intent into retrieval queries against the H07 RAG layer,
 * assesses coverage per intent element, and identifies elements with
 * insufficient coverage.
 */
@Injectable()
export class KnownKnowledgeService {
  constructor(private readonly retriever: HybridRetrieverService) {}

  /**
   * Assesses how well existing knowledge covers the discovery intent.
   * Returns per-element coverage and identifies insufficiently covered elements.
   */
  async assess(
    intent: DiscoveryIntent,
    config: CrawlConfig,
  ): Promise<KnowledgeCoverageResult> {
    const coverages: IntentCoverage[] = [];
    const insufficientKeys: string[] = [];

    for (const element of intent.elements) {
      const results = await this.retriever.retrieveHybrid({
        text: `${element.description} ${element.value}`,
        limit: 10,
        includeCode: element.category === 'architectural-area',
      });

      const relevantResults = results.filter(
        (r) => r.score >= config.minRelevanceScore,
      );
      const bestScore =
        relevantResults.length > 0
          ? Math.max(...relevantResults.map((r) => r.score))
          : 0;

      let level: CoverageLevel;
      if (
        relevantResults.length >= FULL_COVERAGE_MIN_MATCHES &&
        bestScore >= config.minRelevanceScore * 2
      ) {
        level = CoverageLevel.FULL;
      } else if (relevantResults.length > 0) {
        level = CoverageLevel.PARTIAL;
      } else {
        level = CoverageLevel.NONE;
      }

      coverages.push({
        elementKey: element.key,
        level,
        bestScore,
        matchCount: relevantResults.length,
      });

      if (level !== CoverageLevel.FULL) {
        insufficientKeys.push(element.key);
      }
    }

    return { coverages, insufficientKeys };
  }
}
