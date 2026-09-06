import { Injectable } from '@nestjs/common';
import type { CrawlConfig } from './discovery.schemas.js';

export type BoundaryReason = 'depth_limit_reached' | 'query_budget_exhausted' | 'artifact_limit_reached' | 'provider_budget_exhausted' | 'circular_reference';

@Injectable()
export class CrawlBoundaryService {
  private totalQueries = 0;
  private totalArtifacts = 0;
  private currentDepth = 0;
  private readonly providerQueryCounts = new Map<string, number>();
  private readonly visitedReferences = new Set<string>();
  private readonly detectedCircular: string[] = [];
  private config!: CrawlConfig;

  configure(config: CrawlConfig): void {
    this.config = config;
    this.totalQueries = 0;
    this.totalArtifacts = 0;
    this.currentDepth = 0;
    this.providerQueryCounts.clear();
    this.visitedReferences.clear();
    this.detectedCircular.length = 0;
  }

  canQuery(providerId: string): boolean {
    if (this.totalQueries >= this.config.maxQueries) return false;
    const providerCount = this.providerQueryCounts.get(providerId) ?? 0;
    if (providerCount >= this.config.perProviderBudget) return false;
    return true;
  }

  recordQuery(providerId: string): void {
    this.totalQueries++;
    const current = this.providerQueryCounts.get(providerId) ?? 0;
    this.providerQueryCounts.set(providerId, current + 1);
  }

  canCollectArtifact(): boolean { return this.totalArtifacts < this.config.maxArtifacts; }
  recordArtifact(): void { this.totalArtifacts++; }
  canDeepen(): boolean { return this.currentDepth < this.config.maxDepth; }
  deepen(): void { this.currentDepth++; }
  ascend(): void { if (this.currentDepth > 0) this.currentDepth--; }

  visitReference(ref: string): boolean {
    if (this.visitedReferences.has(ref)) {
      this.detectedCircular.push(ref);
      return false;
    }
    this.visitedReferences.add(ref);
    return true;
  }

  blockingReason(providerId?: string): BoundaryReason | undefined {
    if (this.totalQueries >= this.config.maxQueries) return 'query_budget_exhausted';
    if (this.totalArtifacts >= this.config.maxArtifacts) return 'artifact_limit_reached';
    if (!this.canDeepen()) return 'depth_limit_reached';
    if (providerId) {
      const count = this.providerQueryCounts.get(providerId) ?? 0;
      if (count >= this.config.perProviderBudget) return 'provider_budget_exhausted';
    }
    return undefined;
  }

  get circularReferences(): readonly string[] { return [...this.detectedCircular]; }
  get depth(): number { return this.currentDepth; }
  get queriesUsed(): number { return this.totalQueries; }
  get artifactsCollected(): number { return this.totalArtifacts; }
}
