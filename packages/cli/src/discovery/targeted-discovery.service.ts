import { Inject, Injectable, Optional } from '@nestjs/common';
import type { IssueProvider } from '../contracts/issue-provider.types.js';
import type { KnowledgeProvider } from '../contracts/knowledge-provider.types.js';
import type { RepoProvider } from '../contracts/repo-provider.types.js';
import type { ChatProvider } from '../contracts/chat-provider.types.js';
import { ProviderCapability } from '../shared/provider.types.js';
import {
  createContentHash,
  createTimestamp,
} from '../shared/primitives.js';
import type { Timestamp } from '../shared/primitives.js';
import {
  DISCOVERY_CHAT_PROVIDER,
  DISCOVERY_ISSUE_PROVIDER,
  DISCOVERY_KNOWLEDGE_PROVIDER,
  DISCOVERY_REPO_PROVIDER,
} from './discovery.constants.js';
import type { EvidenceRef, Gap } from './discovery.schemas.js';
import { CrawlBoundaryService } from './crawl-boundary.service.js';
import type { BoundaryReason } from './crawl-boundary.service.js';

/** Result of a single targeted discovery attempt for one gap. */
export interface GapDiscoveryResult {
  readonly gapId: string;
  readonly evidence: EvidenceRef[];
  readonly queriesIssued: number;
  readonly boundaryHit?: BoundaryReason;
}

/** Provenance record for a single provider query. */
export interface ProvenanceEntry {
  readonly provider: string;
  readonly query: string;
  readonly timestamp: Timestamp;
  readonly resultCount: number;
}

/**
 * For each identified gap, issues bounded, scoped queries to the minimum
 * necessary providers (D5).
 *
 * Every query carries an explicit scope boundary. Queries are issued
 * per-gap, not per-provider. Provider queries returning no useful results
 * are recorded as attempted-but-empty.
 */
@Injectable()
export class TargetedDiscoveryService {
  private readonly provenanceTrail: ProvenanceEntry[] = [];

  constructor(
    @Inject(DISCOVERY_ISSUE_PROVIDER)
    private readonly issueProvider: IssueProvider,
    @Optional()
    @Inject(DISCOVERY_KNOWLEDGE_PROVIDER)
    private readonly knowledgeProvider: KnowledgeProvider | null,
    @Optional()
    @Inject(DISCOVERY_REPO_PROVIDER)
    private readonly repoProvider: RepoProvider | null,
    @Optional()
    @Inject(DISCOVERY_CHAT_PROVIDER)
    private readonly chatProvider: ChatProvider | null,
    private readonly boundaries: CrawlBoundaryService,
  ) {}

  /** Resets the provenance trail for a new discovery cycle. */
  resetTrail(): void {
    this.provenanceTrail.length = 0;
  }

  /** Returns the provenance trail of all queries in this cycle. */
  get trail(): readonly ProvenanceEntry[] {
    return [...this.provenanceTrail];
  }

  /**
   * Discovers evidence for a single gap by querying the indicated providers.
   * Respects crawl boundaries and records provenance for every query.
   */
  async discoverForGap(
    gap: Gap,
    taskAssociation: string,
  ): Promise<GapDiscoveryResult> {
    const evidence: EvidenceRef[] = [];
    let queriesIssued = 0;
    let boundaryHit: BoundaryReason | undefined;

    for (const capability of gap.providerCapabilities) {
      const providerId = capability;

      if (!this.boundaries.canQuery(providerId)) {
        boundaryHit = this.boundaries.blockingReason(providerId);
        break;
      }

      if (!this.boundaries.canCollectArtifact()) {
        boundaryHit = 'artifact_limit_reached';
        break;
      }

      const searchText = gap.intentElementKeys.join(' ');
      const now = createTimestamp();

      try {
        const results = await this.queryProvider(
          capability,
          searchText,
          taskAssociation,
        );
        queriesIssued++;
        this.boundaries.recordQuery(providerId);

        this.provenanceTrail.push({
          provider: providerId,
          query: searchText,
          timestamp: now,
          resultCount: results.length,
        });

        for (const ref of results) {
          if (!this.boundaries.canCollectArtifact()) {
            boundaryHit = 'artifact_limit_reached';
            break;
          }

          // Check for circular references
          if (!this.boundaries.visitReference(ref.sourceUri)) {
            continue;
          }

          evidence.push(ref);
          this.boundaries.recordArtifact();
        }
      } catch {
        // Record failed query as zero-result provenance
        this.provenanceTrail.push({
          provider: providerId,
          query: searchText,
          timestamp: now,
          resultCount: 0,
        });
      }

      if (boundaryHit) break;
    }

    return { gapId: gap.id, evidence, queriesIssued, boundaryHit };
  }

  private async queryProvider(
    capability: string,
    searchText: string,
    taskAssociation: string,
  ): Promise<EvidenceRef[]> {
    const now = createTimestamp();

    switch (capability) {
      case ProviderCapability.ISSUE:
        return this.queryIssueProvider(searchText, taskAssociation, now);
      case ProviderCapability.KNOWLEDGE:
        return this.queryKnowledgeProvider(searchText, taskAssociation, now);
      case ProviderCapability.REPOSITORY:
        return this.queryRepoProvider(searchText, taskAssociation, now);
      case ProviderCapability.CHAT:
        return this.queryChatProvider(searchText, taskAssociation, now);
      default:
        return [];
    }
  }

  private async queryIssueProvider(
    text: string,
    taskAssociation: string,
    now: Timestamp,
  ): Promise<EvidenceRef[]> {
    const result = await this.issueProvider.search(
      { text },
      { maxItems: 5 },
    );
    return result.items.map((issue) => ({
      providerId: ProviderCapability.ISSUE,
      sourceUri: issue.identity.uri,
      contentHash: issue.identity.hash,
      discoveredAt: now,
      taskAssociation,
      title: issue.title,
      mimeType: 'application/json',
    }));
  }

  private async queryKnowledgeProvider(
    text: string,
    taskAssociation: string,
    now: Timestamp,
  ): Promise<EvidenceRef[]> {
    if (!this.knowledgeProvider) return [];
    const result = await this.knowledgeProvider.discover({
      include: [text],
      maxItems: 5,
    });
    return result.items.map((doc) => ({
      providerId: ProviderCapability.KNOWLEDGE,
      sourceUri: doc.identity.uri,
      contentHash: doc.identity.hash,
      discoveredAt: now,
      taskAssociation,
      title: doc.title,
      mimeType: doc.mimeType,
    }));
  }

  private async queryRepoProvider(
    text: string,
    taskAssociation: string,
    now: Timestamp,
  ): Promise<EvidenceRef[]> {
    if (!this.repoProvider) return [];
    const result = await this.repoProvider.listFiles({
      include: [text],
      maxItems: 5,
    });
    return result.items.map((file) => ({
      providerId: ProviderCapability.REPOSITORY,
      sourceUri: file.path,
      contentHash: createContentHash(file.path),
      discoveredAt: now,
      taskAssociation,
      title: file.path,
      mimeType: file.mimeType ?? 'application/octet-stream',
    }));
  }

  private async queryChatProvider(
    text: string,
    taskAssociation: string,
    now: Timestamp,
  ): Promise<EvidenceRef[]> {
    if (!this.chatProvider) return [];
    const result = await this.chatProvider.searchMessages(
      { text },
      { maxItems: 5 },
    );
    return result.items.map((msg) => ({
      providerId: ProviderCapability.CHAT,
      sourceUri: msg.identity.uri,
      contentHash: msg.identity.hash,
      discoveredAt: now,
      taskAssociation,
      title: `Message by ${msg.author} in ${msg.channel}`,
      mimeType: 'text/plain',
    }));
  }
}
