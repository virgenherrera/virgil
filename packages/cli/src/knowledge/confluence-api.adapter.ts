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
import {
  createContentHash,
  createTimestamp,
} from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../shared/provider.types.js';
import { HTTP_CLIENT } from './knowledge.constants.js';
import { KnowledgeError, KnowledgeErrorCode } from './knowledge.errors.js';
import type { IHttpClient } from './knowledge-http-client.js';
import type { ConfluenceApiSourceConfig } from './knowledge-source.schema.js';

/**
 * Strips Confluence storage format HTML to plain Markdown-like text.
 * Handles common Confluence elements: paragraphs, headings, lists, code blocks.
 */
export function stripConfluenceStorageToMarkdown(html: string): string {
  let text = html;
  // Replace headings
  text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, level, content) => {
    return '#'.repeat(Number(level)) + ' ' + content.replace(/<[^>]+>/g, '').trim() + '\n\n';
  });
  // Replace paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, (_m, content) => {
    return content.replace(/<[^>]+>/g, '').trim() + '\n\n';
  });
  // Replace list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, (_m, content) => {
    return '- ' + content.replace(/<[^>]+>/g, '').trim() + '\n';
  });
  // Replace code blocks
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis,
    (_m, code) => '```\n' + code.trim() + '\n```\n\n',
  );
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Normalise whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

/**
 * Confluence REST API v2 adapter implementing the {@link KnowledgeProvider}
 * contract.
 *
 * - API token authentication (email + token).
 * - Bounded queries: page by ID, CQL search within space, child pages.
 * - Normalised artifacts with provenance.
 * - Rate limiting with exponential backoff.
 * - Structured errors.
 */
export class ConfluenceApiAdapter implements KnowledgeProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private _discoveredPages: KnowledgeDocument[] = [];

  constructor(
    private readonly config: ConfluenceApiSourceConfig,
    @Inject(HTTP_CLIENT) private readonly http: IHttpClient,
  ) {
    this.metadata = {
      id: `confluence-api:${config.spaceKey}`,
      name: `Confluence API (${config.spaceKey})`,
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
    try {
      const response = await this.request(
        `/wiki/api/v2/spaces?keys=${this.config.spaceKey}`,
      );
      if (response.status === 200) {
        this._status = ProviderStatus.CONNECTED;
      } else if (response.status === 401) {
        this._status = ProviderStatus.DEGRADED;
        throw new KnowledgeError(
          KnowledgeErrorCode.AUTH_FAILED,
          'Authentication failed (HTTP 401)',
        );
      } else if (response.status === 403) {
        this._status = ProviderStatus.DEGRADED;
        throw new KnowledgeError(
          KnowledgeErrorCode.PERMISSION_DENIED,
          'Permission denied (HTTP 403)',
        );
      } else {
        this._status = ProviderStatus.DISCONNECTED;
        throw new KnowledgeError(
          KnowledgeErrorCode.HTTP_ERROR,
          `Unexpected status ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof KnowledgeError) throw error;
      this._status = ProviderStatus.DISCONNECTED;
      throw new KnowledgeError(
        KnowledgeErrorCode.HTTP_ERROR,
        'Failed to connect to Confluence API',
        { cause: error },
      );
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }
    try {
      const response = await this.request(
        `/wiki/api/v2/spaces?keys=${this.config.spaceKey}`,
      );
      this._status =
        response.status === 200
          ? ProviderStatus.CONNECTED
          : ProviderStatus.DEGRADED;
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
    }
    return this._status;
  }

  async dispose(): Promise<void> {
    this._status = ProviderStatus.DISCONNECTED;
  }

  // ---------------------------------------------------------------------------
  // KnowledgeProvider contract
  // ---------------------------------------------------------------------------

  async discover(
    scope: DiscoveryScope,
  ): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    const maxItems = scope.maxItems ?? this.config.perPage;
    const cql = `space="${this.config.spaceKey}" AND type=page`;
    const params = new URLSearchParams({
      cql,
      limit: String(maxItems),
      expand: 'body.storage,version',
    });

    if (scope.include?.length) {
      // Use first include pattern as title filter
      params.set(
        'cql',
        `${cql} AND title~"${scope.include[0]}"`,
      );
    }

    const response = await this.requestWithRetry(
      `/wiki/rest/api/content/search?${params.toString()}`,
    );

    if (response.status === 429) {
      throw new KnowledgeError(
        KnowledgeErrorCode.RATE_LIMITED,
        'Confluence API rate limit exceeded',
        { recoverable: true },
      );
    }
    this.assertOk(response.status, 'discover');

    const data = (await response.json()) as {
      results: ConfluencePageResponse[];
      _links?: { next?: string };
    };

    const documents = data.results.map((page) =>
      this.normalisePageToDocument(page),
    );
    this._discoveredPages = [...this._discoveredPages, ...documents];

    return {
      items: documents,
      hasMore: !!data._links?.next,
      cursor: data._links?.next,
    };
  }

  async fetch(identity: ContentIdentity): Promise<KnowledgeDocument> {
    this.ensureInitialised();

    // Extract page ID from URI: confluence://{spaceKey}/{pageId}
    const pageId = this.extractPageIdFromUri(identity.uri);

    const response = await this.requestWithRetry(
      `/wiki/api/v2/pages/${pageId}?body-format=storage`,
    );

    if (response.status === 404) {
      throw new KnowledgeError(
        KnowledgeErrorCode.NOT_FOUND,
        `Page not found: ${pageId}`,
      );
    }
    if (response.status === 403) {
      throw new KnowledgeError(
        KnowledgeErrorCode.PERMISSION_DENIED,
        `Permission denied for page: ${pageId}`,
      );
    }
    if (response.status === 429) {
      throw new KnowledgeError(
        KnowledgeErrorCode.RATE_LIMITED,
        'Confluence API rate limit exceeded',
        { recoverable: true },
      );
    }
    this.assertOk(response.status, `fetch page ${pageId}`);

    const page = (await response.json()) as ConfluenceV2PageResponse;
    return this.normaliseV2PageToDocument(page);
  }

  async list(cursor?: string): Promise<PaginatedResult<KnowledgeDocument>> {
    this.ensureInitialised();

    if (!cursor) {
      return {
        items: this._discoveredPages,
        hasMore: false,
      };
    }

    // Cursor is the next URL from Confluence pagination
    const response = await this.requestWithRetry(cursor);
    this.assertOk(response.status, 'list');

    const data = (await response.json()) as {
      results: ConfluencePageResponse[];
      _links?: { next?: string };
    };

    const documents = data.results.map((page) =>
      this.normalisePageToDocument(page),
    );
    this._discoveredPages = [...this._discoveredPages, ...documents];

    return {
      items: documents,
      hasMore: !!data._links?.next,
      cursor: data._links?.next,
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    try {
      const response = await this.request(
        `/wiki/api/v2/spaces?keys=${this.config.spaceKey}`,
      );
      if (response.status === 200) {
        return {
          status: ProviderHealthStatus.HEALTHY,
          lastChecked,
          message: `Space ${this.config.spaceKey} is accessible`,
        };
      }
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message: `Confluence API returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message:
          error instanceof Error ? error.message : 'Confluence API unavailable',
      };
    }
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

  private extractPageIdFromUri(uri: string): string {
    // URI format: confluence://{spaceKey}/{pageId}
    const match = /confluence:\/\/[^/]+\/(\d+)/.exec(uri);
    if (match) return match[1];

    // Or it might just be a numeric string
    const numericMatch = /^(\d+)$/.exec(uri);
    if (numericMatch) return numericMatch[1];

    throw new KnowledgeError(
      KnowledgeErrorCode.PARSE_ERROR,
      `Cannot extract page ID from URI: ${uri}`,
    );
  }

  private normalisePageToDocument(page: ConfluencePageResponse): KnowledgeDocument {
    const content = page.body?.storage?.value ?? '';
    const markdownContent = stripConfluenceStorageToMarkdown(content);
    const hash = createContentHash(markdownContent);
    const discoveredAt = createTimestamp();

    return {
      identity: {
        uri: `confluence://${this.config.spaceKey}/${page.id}`,
        hash,
        version: page.version?.number?.toString(),
        discoveredAt,
      },
      title: page.title,
      mimeType: 'text/markdown',
      content: markdownContent,
      metadata: {
        spaceKey: this.config.spaceKey,
        pageId: page.id,
        sourceUrl: `${this.config.baseUrl}/wiki/spaces/${this.config.spaceKey}/pages/${page.id}`,
      },
    };
  }

  private normaliseV2PageToDocument(page: ConfluenceV2PageResponse): KnowledgeDocument {
    const content = page.body?.storage?.value ?? '';
    const markdownContent = stripConfluenceStorageToMarkdown(content);
    const hash = createContentHash(markdownContent);
    const discoveredAt = createTimestamp();

    return {
      identity: {
        uri: `confluence://${this.config.spaceKey}/${page.id}`,
        hash,
        version: page.version?.number?.toString(),
        discoveredAt,
      },
      title: page.title,
      mimeType: 'text/markdown',
      content: markdownContent,
      metadata: {
        spaceKey: this.config.spaceKey,
        pageId: page.id,
        sourceUrl: `${this.config.baseUrl}/wiki/spaces/${this.config.spaceKey}/pages/${page.id}`,
      },
    };
  }

  private async request(path: string) {
    const url = path.startsWith('http')
      ? path
      : `${this.config.baseUrl}${path}`;

    const credentials = Buffer.from(
      `${this.config.email}:${this.config.apiToken}`,
    ).toString('base64');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
      'User-Agent': 'virgil-cli/0.1.0',
    };

    return this.http.get(url, headers);
  }

  /**
   * Performs a request with exponential backoff on 429 responses.
   * Retries up to 3 times with increasing delay.
   */
  private async requestWithRetry(path: string, maxRetries = 3) {
    let lastResponse;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResponse = await this.request(path);
      if (lastResponse.status !== 429) return lastResponse;

      if (attempt < maxRetries) {
        const retryAfter = lastResponse.headers.get('retry-after');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000;
        await this.delay(delayMs);
      }
    }
    return lastResponse!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertOk(status: number, context: string): void {
    if (status === 401) {
      throw new KnowledgeError(
        KnowledgeErrorCode.AUTH_FAILED,
        `Authentication failed for ${context} (HTTP 401)`,
      );
    }
    if (status === 403) {
      throw new KnowledgeError(
        KnowledgeErrorCode.PERMISSION_DENIED,
        `Permission denied for ${context} (HTTP 403)`,
      );
    }
    if (status < 200 || status >= 300) {
      throw new KnowledgeError(
        KnowledgeErrorCode.HTTP_ERROR,
        `Confluence API returned HTTP ${status} for ${context}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Confluence response shapes (private to this module)
// ---------------------------------------------------------------------------

interface ConfluencePageResponse {
  id: string;
  title: string;
  body?: {
    storage?: {
      value: string;
    };
  };
  version?: {
    number: number;
  };
  _links?: {
    webui?: string;
  };
}

interface ConfluenceV2PageResponse {
  id: string;
  title: string;
  body?: {
    storage?: {
      value: string;
    };
  };
  version?: {
    number: number;
  };
}
