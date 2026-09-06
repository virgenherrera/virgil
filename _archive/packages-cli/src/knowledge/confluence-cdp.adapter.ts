import { Inject } from '@nestjs/common';
import type {
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from '../contracts/common.types.js';
import { ProviderHealthStatus } from '../contracts/common.types.js';
import type { KnowledgeDocument } from '../contracts/knowledge-provider.types.js';
import type { KnowledgeProvider } from '../contracts/knowledge-provider.types.js';
import type { ContentIdentity } from '../contracts/common.types.js';
import type { SemVer } from '../shared/primitives.js';
import { createContentHash, createTimestamp } from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../shared/provider.types.js';
import { CDP_SESSION } from './knowledge.constants.js';
import { KnowledgeError, KnowledgeErrorCode } from './knowledge.errors.js';
import type { CdpBrowserPort } from './confluence-page.pom.js';
import { confluencePagePom } from './confluence-page.pom.js';
import { stripConfluenceStorageToMarkdown } from './confluence-api.adapter.js';
import type { ConfluenceCdpSourceConfig } from './knowledge-source.schema.js';

/**
 * Confluence CDP adapter implementing the {@link KnowledgeProvider} contract
 * via Playwright CDP browser automation.
 *
 * Uses POM pattern for navigation and extraction.
 * Browser selection: Chrome, Firefox, Edge, Safari.
 * Bounded queries: navigate to URL, extract rendered content, follow one level of links.
 */
export class ConfluenceCdpAdapter implements KnowledgeProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private _discoveredPages: KnowledgeDocument[] = [];

  constructor(
    private readonly config: ConfluenceCdpSourceConfig,
    @Inject(CDP_SESSION) private readonly cdp: CdpBrowserPort | null,
  ) {
    this.metadata = {
      id: `confluence-cdp:${new URL(config.baseUrl).hostname}`,
      name: `Confluence CDP (${new URL(config.baseUrl).hostname})`,
      version: '0.1.0' as SemVer,
      capabilities: [ProviderCapability.KNOWLEDGE],
    };
  }

  get status(): ProviderStatus {
    return this._status;
  }

  // ---------------------------------------------------------------------------
  // Provider lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!this.cdp) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new KnowledgeError(
        KnowledgeErrorCode.CDP_ERROR,
        'CDP browser instance is not available',
      );
    }
    try {
      await this.cdp.launch({
        browser: this.config.browser,
        headless: this.config.headless,
        profilePath: this.config.profilePath,
      });
      this._status = ProviderStatus.CONNECTED;
    } catch (error) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new KnowledgeError(
        KnowledgeErrorCode.CDP_ERROR,
        'Failed to launch CDP browser',
        { cause: error },
      );
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (!this.cdp) return ProviderStatus.DISCONNECTED;
    return this._status;
  }

  async dispose(): Promise<void> {
    if (this.cdp) {
      try {
        await this.cdp.close();
      } catch {
        // Best-effort cleanup
      }
    }
    this._status = ProviderStatus.DISCONNECTED;
  }

  // ---------------------------------------------------------------------------
  // KnowledgeProvider contract
  // ---------------------------------------------------------------------------

  async discover(
    scope: DiscoveryScope,
  ): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    const targetUrl = this.config.baseUrl;
    const result = await this.cdp!.executePom(confluencePagePom, targetUrl);

    const content = result.content;
    const title = (content['title'] as string) ?? 'Untitled';
    const htmlContent = (content['content'] as string) ?? '';
    const childLinks = (content['childLinks'] as string[] | undefined) ?? [];

    const markdownContent = stripConfluenceStorageToMarkdown(htmlContent);
    const hash = createContentHash(markdownContent);
    const discoveredAt = createTimestamp();

    const mainDoc: KnowledgeDocument = {
      identity: {
        uri: targetUrl,
        hash,
        discoveredAt,
      },
      title,
      mimeType: 'text/markdown',
      content: markdownContent,
      metadata: {
        sourceUrl: targetUrl,
        browser: this.config.browser,
        extractedVia: 'cdp',
      },
    };

    const documents: KnowledgeDocument[] = [mainDoc];

    // Follow one level of child links (bounded by maxDepth and maxItems)
    const maxItems = scope.maxItems ?? 10;
    const maxDepth = scope.maxDepth ?? 1;
    if (maxDepth >= 1 && childLinks.length > 0) {
      const linksToFollow = childLinks.slice(0, maxItems - 1);
      for (const link of linksToFollow) {
        try {
          const childResult = await this.cdp!.executePom(
            confluencePagePom,
            link,
          );
          const childContent = childResult.content;
          const childTitle = (childContent['title'] as string) ?? 'Untitled';
          const childHtml = (childContent['content'] as string) ?? '';
          const childMd = stripConfluenceStorageToMarkdown(childHtml);
          const childHash = createContentHash(childMd);

          documents.push({
            identity: {
              uri: link,
              hash: childHash,
              discoveredAt: createTimestamp(),
            },
            title: childTitle,
            mimeType: 'text/markdown',
            content: childMd,
            metadata: {
              sourceUrl: link,
              browser: this.config.browser,
              extractedVia: 'cdp',
              parentUrl: targetUrl,
            },
          });
        } catch {
          // Skip pages that fail extraction
        }
      }
    }

    this._discoveredPages = [...this._discoveredPages, ...documents];

    return {
      items: documents,
      hasMore: false,
    };
  }

  async fetch(identity: ContentIdentity): Promise<KnowledgeDocument> {
    this.ensureInitialised();

    const targetUrl = identity.uri;
    try {
      const result = await this.cdp!.executePom(confluencePagePom, targetUrl);

      const content = result.content;
      const title = (content['title'] as string) ?? 'Untitled';
      const htmlContent = (content['content'] as string) ?? '';
      const markdownContent = stripConfluenceStorageToMarkdown(htmlContent);
      const hash = createContentHash(markdownContent);

      return {
        identity: {
          uri: targetUrl,
          hash,
          discoveredAt: createTimestamp(),
        },
        title,
        mimeType: 'text/markdown',
        content: markdownContent,
        metadata: {
          sourceUrl: targetUrl,
          browser: this.config.browser,
          extractedVia: 'cdp',
        },
      };
    } catch (error) {
      throw new KnowledgeError(
        KnowledgeErrorCode.CDP_ERROR,
        `Failed to fetch page: ${targetUrl}`,
        { cause: error },
      );
    }
  }

  async list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    // CDP adapter uses in-memory list; cursor is unused
    void cursor;
    return {
      items: this._discoveredPages,
      hasMore: false,
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    if (!this.cdp) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message: 'CDP browser instance is not available',
      };
    }
    if (this._status === ProviderStatus.CONNECTED) {
      return {
        status: ProviderHealthStatus.HEALTHY,
        lastChecked,
        message: `Connected via ${this.config.browser}`,
      };
    }
    return {
      status: ProviderHealthStatus.UNAVAILABLE,
      lastChecked,
      message: 'CDP browser is not connected',
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED) {
      throw new KnowledgeError(
        KnowledgeErrorCode.NOT_INITIALISED,
        'Provider has not been initialised. Call initialize() first.',
      );
    }
  }
}
