import { Injectable } from '@nestjs/common';
import type { CrawlConfig } from './discovery.schemas.js';

/**
 * Reason a crawl boundary was hit.
 */
export type BoundaryReason =
  | 'depth_limit_reached'
  | 'query_budget_exhausted'
  | 'artifact_limit_reached'
  | 'provider_budget_exhausted'
  | 'circular_reference';

/**
 * Tracks and enforces crawl boundaries during a discovery cycle (D7).
 *
 * Maintains counters for depth, total queries, artifacts collected, and
 * per-provider budgets. When any limit is reached, further expansion in
 * that dimension is blocked and the reason is recorded.
 */
@Injectable()
export class CrawlBoundaryService {
  private totalQueries = 0;
  private totalArtifacts = 0;
  private currentDepth = 0;
  private readonly providerQueryCounts = new Map<string, number>();
  private readonly visitedReferences = new Set<string>();
  private readonly detectedCircular: string[] = [];
  private config!: CrawlConfig;

  /** Initialises the service with the crawl configuration for this cycle. */
  configure(config: CrawlConfig): void {
    this.config = config;
    this.totalQueries = 0;
    this.totalArtifacts = 0;
    this.currentDepth = 0;
    this.providerQueryCounts.clear();
    this.visitedReferences.clear();
    this.detectedCircular.length = 0;
  }

  /** Whether a new provider query is allowed. */
  canQuery(providerId: string): boolean {
    if (this.totalQueries >= this.config.maxQueries) return false;
    const providerCount = this.providerQueryCounts.get(providerId) ?? 0;
    if (providerCount >= this.config.perProviderBudget) return false;
    return true;
  }

  /** Records a provider query. */
  recordQuery(providerId: string): void {
    this.totalQueries++;
    const current = this.providerQueryCounts.get(providerId) ?? 0;
    this.providerQueryCounts.set(providerId, current + 1);
  }

  /** Whether the boundary allows more artifacts to be collected. */
  canCollectArtifact(): boolean {
    return this.totalArtifacts < this.config.maxArtifacts;
  }

  /** Records an artifact collection. */
  recordArtifact(): void {
    this.totalArtifacts++;
  }

  /** Whether a deeper traversal level is allowed. */
  canDeepen(): boolean {
    return this.currentDepth < this.config.maxDepth;
  }

  /** Increments the current depth. */
  deepen(): void {
    this.currentDepth++;
  }

  /** Decrements the current depth. */
  ascend(): void {
    if (this.currentDepth > 0) {
      this.currentDepth--;
    }
  }

  /**
   * Checks whether a reference has already been visited.
   * Returns true if this is a new reference, false if circular.
   */
  visitReference(ref: string): boolean {
    if (this.visitedReferences.has(ref)) {
      this.detectedCircular.push(ref);
      return false;
    }
    this.visitedReferences.add(ref);
    return true;
  }

  /** Returns the reason the boundary is currently blocking, or undefined. */
  blockingReason(providerId?: string): BoundaryReason | undefined {
    if (this.totalQueries >= this.config.maxQueries) {
      return 'query_budget_exhausted';
    }
    if (this.totalArtifacts >= this.config.maxArtifacts) {
      return 'artifact_limit_reached';
    }
    if (!this.canDeepen()) {
      return 'depth_limit_reached';
    }
    if (providerId) {
      const count = this.providerQueryCounts.get(providerId) ?? 0;
      if (count >= this.config.perProviderBudget) {
        return 'provider_budget_exhausted';
      }
    }
    return undefined;
  }

  /** All detected circular references in this cycle. */
  get circularReferences(): readonly string[] {
    return [...this.detectedCircular];
  }

  /** Current depth level. */
  get depth(): number {
    return this.currentDepth;
  }

  /** Total queries issued so far. */
  get queriesUsed(): number {
    return this.totalQueries;
  }

  /** Total artifacts collected so far. */
  get artifactsCollected(): number {
    return this.totalArtifacts;
  }
}
