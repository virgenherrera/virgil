import { Injectable } from '@nestjs/common';
import { ProviderCapability } from '../shared/provider.types.js';
import type {
  DiscoveryIntent,
  Gap,
  GapAnalysisResult,
  KnowledgeCoverageResult,
} from './discovery.schemas.js';
import {
  CoverageLevel,
  GapCategory,
  GapPriority,
} from './discovery.schemas.js';

/**
 * Compares discovery intent against known-knowledge results to identify
 * specific, actionable gaps (D4).
 *
 * Gaps are deduplicated: if the same evidence would fill multiple intent
 * elements, one gap is produced with multiple intent-element references.
 */
@Injectable()
export class GapAnalysisService {
  /**
   * Analyses coverage against intent and produces a deduplicated gap list.
   * Returns an empty gap list when known knowledge fully covers the intent.
   */
  analyse(
    intent: DiscoveryIntent,
    coverage: KnowledgeCoverageResult,
  ): GapAnalysisResult {
    const coverageByKey = new Map(
      coverage.coverages.map((c) => [c.elementKey, c]),
    );
    const elementsByKey = new Map(intent.elements.map((e) => [e.key, e]));

    // Group insufficient elements by category for deduplication
    const gapBuckets = new Map<string, string[]>();

    for (const key of coverage.insufficientKeys) {
      const element = elementsByKey.get(key);
      if (!element) continue;

      const bucketKey = `${element.category}:${element.value}`;
      const existing = gapBuckets.get(bucketKey) ?? [];
      existing.push(key);
      gapBuckets.set(bucketKey, existing);
    }

    const gaps: Gap[] = [];
    let gapIndex = 0;

    for (const [_bucketKey, elementKeys] of gapBuckets) {
      const firstElement = elementsByKey.get(elementKeys[0])!;
      const firstCoverage = coverageByKey.get(elementKeys[0]);

      const category = this.mapCategory(firstElement.category);
      const capabilities = this.mapProviderCapabilities(category);
      const priority = this.assessPriority(firstCoverage?.level);

      gaps.push({
        id: `gap-${gapIndex++}`,
        intentElementKeys: elementKeys,
        category,
        description: `Missing ${category}: ${firstElement.description}`,
        providerCapabilities: capabilities,
        priority,
      });
    }

    // Sort by priority (high first)
    gaps.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    return {
      gaps,
      fullyCovered: gaps.length === 0,
    };
  }

  private mapCategory(intentCategory: string): GapCategory {
    switch (intentCategory) {
      case 'documentation':
        return GapCategory.DOCUMENTATION;
      case 'architectural-area':
        return GapCategory.CODE;
      case 'related-issue':
        return GapCategory.ISSUE_CONTEXT;
      case 'conversation':
        return GapCategory.CONVERSATION;
      case 'component':
      default:
        return GapCategory.ARCHITECTURAL_CONTEXT;
    }
  }

  private mapProviderCapabilities(category: GapCategory): string[] {
    switch (category) {
      case GapCategory.DOCUMENTATION:
        return [ProviderCapability.KNOWLEDGE];
      case GapCategory.CODE:
        return [ProviderCapability.REPOSITORY];
      case GapCategory.ISSUE_CONTEXT:
        return [ProviderCapability.ISSUE];
      case GapCategory.CONVERSATION:
        return [ProviderCapability.CHAT];
      case GapCategory.ARCHITECTURAL_CONTEXT:
        return [ProviderCapability.REPOSITORY, ProviderCapability.KNOWLEDGE];
    }
  }

  private assessPriority(level?: CoverageLevel): GapPriority {
    if (!level || level === CoverageLevel.NONE) {
      return GapPriority.HIGH;
    }
    return GapPriority.MEDIUM;
  }
}
