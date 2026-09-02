import { Inject } from '@nestjs/common';
import type {
  DiscoveryScope,
  PaginatedResult,
  ProviderHealth,
} from '../contracts/common.types.js';
import { ProviderHealthStatus } from '../contracts/common.types.js';
import type {
  IssueProvider,
  IssueSearchQuery,
  NormalisedIssue,
} from '../contracts/issue-provider.types.js';
import { IssueStatus } from '../contracts/issue-provider.types.js';
import type { SemVer } from '../shared/primitives.js';
import { createTimestamp } from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../shared/provider.types.js';
import {
  GitHubIssueSchema,
  parseLinkHeader,
} from './github-api-response.schema.js';
import { extractDiscoveryHints } from './github-discovery-hints.js';
import { normaliseGitHubIssue } from './github-field-normaliser.js';
import type { GitHubIssuesConfig } from './github-issues-config.schema.js';
import type { IHttpClient } from './http-client.js';
import { HTTP_CLIENT } from './http-client.js';

/** Error codes surfaced by the GitHub API adapter. */
export enum GitHubApiErrorCode {
  NOT_INITIALISED = 'NOT_INITIALISED',
  HTTP_ERROR = 'HTTP_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTH_FAILED = 'AUTH_FAILED',
}

/**
 * Structured error surfaced by the GitHub API adapter.
 */
export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubApiErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/**
 * GitHub Issues adapter that retrieves issue data through the GitHub REST
 * API v3. Implements the {@link IssueProvider} contract from H04.
 *
 * - HTTP client is injected (testability).
 * - Base URL is configurable (GHES support).
 * - Credentials are resolved from an opaque reference.
 * - All responses are Zod-validated before normalisation.
 */
export class GitHubApiAdapter implements IssueProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;
  private _token: string | undefined;

  constructor(
    private readonly config: GitHubIssuesConfig,
    @Inject(HTTP_CLIENT) private readonly http: IHttpClient,
    token?: string,
  ) {
    this.metadata = {
      id: `github-api:${config.owner}/${config.repo}`,
      name: `GitHub API (${config.owner}/${config.repo})`,
      version: '0.1.0' as SemVer,
      capabilities: [ProviderCapability.ISSUE],
    };
    this._token = token;
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
        `/repos/${this.config.owner}/${this.config.repo}`,
      );
      if (response.status === 200) {
        this._status = ProviderStatus.CONNECTED;
      } else if (response.status === 401 || response.status === 403) {
        this._status = ProviderStatus.DEGRADED;
        throw new GitHubApiError(
          GitHubApiErrorCode.AUTH_FAILED,
          `Authentication failed (HTTP ${response.status})`,
        );
      } else if (response.status === 404) {
        this._status = ProviderStatus.DISCONNECTED;
        throw new GitHubApiError(
          GitHubApiErrorCode.NOT_FOUND,
          `Repository not found: ${this.config.owner}/${this.config.repo}`,
        );
      } else {
        this._status = ProviderStatus.DISCONNECTED;
        throw new GitHubApiError(
          GitHubApiErrorCode.HTTP_ERROR,
          `Unexpected status ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      this._status = ProviderStatus.DISCONNECTED;
      throw new GitHubApiError(
        GitHubApiErrorCode.HTTP_ERROR,
        'Failed to connect to GitHub API',
        error,
      );
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) {
      return ProviderStatus.REGISTERED;
    }

    try {
      const response = await this.request(
        `/repos/${this.config.owner}/${this.config.repo}`,
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
  // IssueProvider contract
  // ---------------------------------------------------------------------------

  async getIssue(id: string): Promise<NormalisedIssue> {
    this.ensureInitialised();

    const issueNumber = this.parseIssueId(id);
    const path = `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;
    const response = await this.request(path);

    if (response.status === 404) {
      throw new GitHubApiError(
        GitHubApiErrorCode.NOT_FOUND,
        `Issue not found: ${id}`,
      );
    }

    this.assertOk(response.status, path);
    const raw = await response.json();
    const parsed = GitHubIssueSchema.parse(raw);
    return normaliseGitHubIssue(parsed, this.config.owner, this.config.repo);
  }

  async search(
    query: IssueSearchQuery,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>> {
    this.ensureInitialised();

    const params = new URLSearchParams();
    if (query.status) {
      params.set('state', this.mapStatusToGitHubState(query.status));
    } else {
      params.set('state', 'all');
    }
    if (query.labels?.length) {
      params.set('labels', query.labels.join(','));
    }
    params.set('per_page', String(scope?.maxItems ?? this.config.perPage));
    if (query.cursor) {
      params.set('page', query.cursor);
    }

    // Use the issues/search endpoint for text searches, or the list endpoint otherwise
    let path: string;
    if (query.text) {
      const q = [
        query.text,
        `repo:${this.config.owner}/${this.config.repo}`,
        query.status
          ? `state:${this.mapStatusToGitHubState(query.status)}`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      params.set('q', q);
      path = `/search/issues?${params.toString()}`;
    } else {
      path = `/repos/${this.config.owner}/${this.config.repo}/issues?${params.toString()}`;
    }

    const response = await this.request(path);
    this.assertOk(response.status, path);
    const raw = await response.json();

    // The search endpoint wraps items in { items: [...] }
    const issueArray = query.text
      ? (raw as { items: unknown[] }).items
      : (raw as unknown[]);

    const issues = (issueArray as unknown[]).map((item) =>
      GitHubIssueSchema.parse(item),
    );
    const normalised = issues.map((issue) =>
      normaliseGitHubIssue(issue, this.config.owner, this.config.repo),
    );

    const links = parseLinkHeader(response.headers.get('link'));
    const nextPage = links.next
      ? (new URL(links.next).searchParams.get('page') ?? undefined)
      : undefined;

    return {
      items: normalised,
      hasMore: !!links.next,
      cursor: nextPage,
    };
  }

  async listRelated(
    id: string,
    scope?: DiscoveryScope,
  ): Promise<PaginatedResult<NormalisedIssue>> {
    this.ensureInitialised();

    // Fetch the primary issue to extract its references
    const primary = await this.getIssue(id);
    const hints = extractDiscoveryHints(primary.references, primary.metadata);

    // Follow issue references up to the scope limit
    const maxItems = scope?.maxItems ?? this.config.perPage;
    const issueHints = hints
      .filter((h) => h.kind === 'issue' || h.kind === 'pull_request')
      .slice(0, maxItems);

    const related: NormalisedIssue[] = [];
    for (const hint of issueHints) {
      try {
        const relatedIssue = await this.getIssue(hint.uri);
        related.push(relatedIssue);
      } catch {
        // Skip issues that cannot be resolved (deleted, private, cross-repo)
      }
    }

    return {
      items: related,
      hasMore: false,
    };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    try {
      const response = await this.request(
        `/repos/${this.config.owner}/${this.config.repo}`,
      );
      if (response.status === 200) {
        const rateLimitRemaining = response.headers.get(
          'x-ratelimit-remaining',
        );
        const remaining = rateLimitRemaining
          ? parseInt(rateLimitRemaining, 10)
          : null;
        const degraded = remaining !== null && remaining < 10;

        return {
          status: degraded
            ? ProviderHealthStatus.DEGRADED
            : ProviderHealthStatus.HEALTHY,
          lastChecked,
          message:
            remaining !== null
              ? `Rate limit remaining: ${remaining}`
              : `Repository ${this.config.owner}/${this.config.repo} is accessible`,
        };
      }

      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message: `GitHub API returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: ProviderHealthStatus.UNAVAILABLE,
        lastChecked,
        message:
          error instanceof Error ? error.message : 'GitHub API unavailable',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED) {
      throw new GitHubApiError(
        GitHubApiErrorCode.NOT_INITIALISED,
        'Provider has not been initialised. Call initialize() first.',
      );
    }
  }

  /**
   * Parses various issue ID formats into a numeric issue number.
   * Supports: `42`, `owner/repo#42`, `#42`, full GitHub URLs.
   */
  private parseIssueId(id: string): number {
    // Full GitHub URL
    const urlMatch =
      /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/.exec(id);
    if (urlMatch) return parseInt(urlMatch[4], 10);

    // owner/repo#N
    const qualifiedMatch = /^[^/]+\/[^#]+#(\d+)$/.exec(id);
    if (qualifiedMatch) return parseInt(qualifiedMatch[1], 10);

    // #N
    const hashMatch = /^#?(\d+)$/.exec(id);
    if (hashMatch) return parseInt(hashMatch[1], 10);

    throw new GitHubApiError(
      GitHubApiErrorCode.PARSE_ERROR,
      `Cannot parse issue identifier: ${id}`,
    );
  }

  /** Maps the normalised IssueStatus back to GitHub's `state` query param. */
  private mapStatusToGitHubState(
    status: IssueStatus,
  ): 'open' | 'closed' | 'all' {
    switch (status) {
      case IssueStatus.OPEN:
      case IssueStatus.IN_PROGRESS:
      case IssueStatus.BLOCKED:
      case IssueStatus.IN_REVIEW:
        return 'open';
      case IssueStatus.DONE:
      case IssueStatus.CLOSED:
        return 'closed';
      default:
        return 'all';
    }
  }

  /** Builds the full URL and authorization headers, then delegates to the HTTP client. */
  private async request(path: string) {
    const url = path.startsWith('http')
      ? path
      : `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'virgil-cli/0.1.0',
    };

    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    const response = await this.http.get(url, headers);

    // Rate-limit awareness
    if (response.status === 429) {
      throw new GitHubApiError(
        GitHubApiErrorCode.RATE_LIMITED,
        'GitHub API rate limit exceeded',
      );
    }

    return response;
  }

  private assertOk(status: number, path: string): void {
    if (status === 401 || status === 403) {
      throw new GitHubApiError(
        GitHubApiErrorCode.AUTH_FAILED,
        `Authentication failed for ${path} (HTTP ${status})`,
      );
    }
    if (status < 200 || status >= 300) {
      throw new GitHubApiError(
        GitHubApiErrorCode.HTTP_ERROR,
        `GitHub API returned HTTP ${status} for ${path}`,
      );
    }
  }
}
