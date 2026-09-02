import { Inject, Injectable } from "@nestjs/common";
import { IndexingPipelineService } from "./indexing-pipeline.service.js";
import {
  type ArtifactStore,
  ARTIFACT_STORE,
  type ContentIdentity,
  createTimestamp,
  type DiscoveryScope,
  type IndexedArtifact,
  type KnowledgeDocument,
  type PaginatedResult,
  ProviderCapability,
  type ProviderHealth,
  ProviderHealthStatus,
  type ProviderMetadata,
  ProviderStatus,
  type SemVer,
} from "./types.js";

@Injectable()
export class LocalKnowledgeProviderService {
  readonly metadata: ProviderMetadata = {
    id: "local-indexer",
    name: "Local Filesystem Indexer",
    version: "0.0.1" as SemVer,
    capabilities: [ProviderCapability.KNOWLEDGE],
  };

  status: ProviderStatus = ProviderStatus.REGISTERED;

  private lastIndexedAt?: number;
  private errorCount = 0;

  constructor(
    private readonly pipeline: IndexingPipelineService,
    @Inject(ARTIFACT_STORE)
    private readonly store: ArtifactStore,
  ) {}

  async initialize(): Promise<void> {
    this.status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.status;
  }

  async dispose(): Promise<void> {
    this.status = ProviderStatus.DISCONNECTED;
  }

  async discover(
    scope: DiscoveryScope,
  ): Promise<PaginatedResult<KnowledgeDocument>> {
    const allArtifacts = await this.store.findAll();
    let filtered = allArtifacts.filter((a) => !a.deletedAt);

    if (scope.since) {
      const since = scope.since;
      filtered = filtered.filter((a) => a.updatedAt > since);
    }

    if (scope.include?.length) {
      const patterns = scope.include;
      filtered = filtered.filter((a) =>
        patterns.some((p) => a.sourceUri.includes(p)),
      );
    }

    if (scope.exclude?.length) {
      const patterns = scope.exclude;
      filtered = filtered.filter(
        (a) => !patterns.some((p) => a.sourceUri.includes(p)),
      );
    }

    const maxItems = scope.maxItems ?? filtered.length;
    const items = filtered
      .slice(0, maxItems)
      .map((a) => this.toKnowledgeDocument(a));

    return {
      items,
      hasMore: filtered.length > maxItems,
      cursor: filtered.length > maxItems ? String(maxItems) : undefined,
    };
  }

  async fetch(identity: ContentIdentity): Promise<KnowledgeDocument> {
    const artifact = await this.store.findBySourceUri(identity.uri);
    if (!artifact) {
      throw new Error(`Artifact not found: ${identity.uri}`);
    }
    return this.toKnowledgeDocument(artifact);
  }

  async list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>> {
    const result = await this.store.list(cursor);
    return {
      items: result.items.map((a) => this.toKnowledgeDocument(a)),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  async health(): Promise<ProviderHealth> {
    const artifacts = await this.store.findAll();
    const activeCount = artifacts.filter((a) => !a.deletedAt).length;

    return {
      status: ProviderHealthStatus.HEALTHY,
      lastChecked: createTimestamp(),
      message: `${activeCount} artifacts indexed, ${this.errorCount} errors`,
    };
  }

  recordError(): void {
    this.errorCount++;
  }

  private toKnowledgeDocument(artifact: IndexedArtifact): KnowledgeDocument {
    return {
      identity: {
        uri: artifact.sourceUri,
        hash: artifact.contentHash,
        discoveredAt: artifact.createdAt,
      },
      title: artifact.title,
      mimeType: artifact.mimeType,
      content: artifact.content,
      metadata: {
        cloudSource: artifact.metadata.cloudSource,
        relativePath: artifact.metadata.relativePath,
        syncRoot: artifact.metadata.syncRoot,
        folderHierarchy: artifact.metadata.folderHierarchy,
        fileSizeBytes: artifact.metadata.fileSizeBytes,
        syncStatus: artifact.metadata.syncStatus,
        ...artifact.formatMetadata,
      },
    };
  }
}
