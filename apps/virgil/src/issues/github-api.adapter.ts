import { Inject } from '@nestjs/common';
import type { DiscoveryScope, PaginatedResult, ProviderHealth } from '../contracts/common.types.js';
import { ProviderHealthStatus } from '../contracts/common.types.js';
import type { IssueProvider, IssueSearchQuery, NormalisedIssue } from '../contracts/issue-provider.types.js';
import { IssueStatus } from '../contracts/issue-provider.types.js';
import type { SemVer } from '../shared/primitives.js';
import { createTimestamp } from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import { ProviderCapability, ProviderStatus } from '../shared/provider.types.js';
import { GitHubIssueSchema, parseLinkHeader } from './github-api-response.schema.js';
import { extractDiscoveryHints } from './github-discovery-hints.js';
import { normaliseGitHubIssue } from './github-field-normaliser.js';
import type { GitHubIssuesConfig } from './issues-config.schema.js';
import { IssuesError, IssuesErrorCode } from './issues.errors.js';
import type { IHttpClient } from './issues-http-client.js';
import { HTTP_CLIENT } from './issues-http-client.js';

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

  get status(): ProviderStatus { return this._status; }

  async initialize(): Promise<void> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}`);
      if (response.status === 200) {
        this._status = ProviderStatus.CONNECTED;
      } else if (response.status === 401 || response.status === 403) {
        this._status = ProviderStatus.DEGRADED;
        throw new IssuesError(IssuesErrorCode.AUTH_FAILED, `Authentication failed (HTTP ${response.status})`);
      } else if (response.status === 404) {
        this._status = ProviderStatus.DISCONNECTED;
        throw new IssuesError(IssuesErrorCode.NOT_FOUND, `Repository not found: ${this.config.owner}/${this.config.repo}`);
      } else {
        this._status = ProviderStatus.DISCONNECTED;
        throw new IssuesError(IssuesErrorCode.HTTP_ERROR, `Unexpected status ${response.status}`);
      }
    } catch (error) {
      if (error instanceof IssuesError) throw error;
      this._status = ProviderStatus.DISCONNECTED;
      throw new IssuesError(IssuesErrorCode.HTTP_ERROR, 'Failed to connect to GitHub API', { cause: error });
    }
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (this._status === ProviderStatus.REGISTERED) return ProviderStatus.REGISTERED;
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}`);
      this._status = response.status === 200 ? ProviderStatus.CONNECTED : ProviderStatus.DEGRADED;
    } catch {
      this._status = ProviderStatus.DISCONNECTED;
    }
    return this._status;
  }

  async dispose(): Promise<void> { this._status = ProviderStatus.DISCONNECTED; }

  async getIssue(id: string): Promise<NormalisedIssue> {
    this.ensureInitialised();
    const issueNumber = this.parseIssueId(id);
    const path = `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;
    const response = await this.request(path);
    if (response.status === 404) {
      throw new IssuesError(IssuesErrorCode.NOT_FOUND, `Issue not found: ${id}`);
    }
    this.assertOk(response.status, path);
    const raw = await response.json();
    const parsed = GitHubIssueSchema.parse(raw);
    return normaliseGitHubIssue(parsed, this.config.owner, this.config.repo);
  }

  async search(query: IssueSearchQuery, scope?: DiscoveryScope): Promise<PaginatedResult<NormalisedIssue>> {
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

    let path: string;
    if (query.text) {
      const q = [query.text, `repo:${this.config.owner}/${this.config.repo}`, query.status ? `state:${this.mapStatusToGitHubState(query.status)}` : ''].filter(Boolean).join(' ');
      params.set('q', q);
      path = `/search/issues?${params.toString()}`;
    } else {
      path = `/repos/${this.config.owner}/${this.config.repo}/issues?${params.toString()}`;
    }

    const response = await this.request(path);
    this.assertOk(response.status, path);
    const raw = await response.json();
    const issueArray = query.text ? (raw as { items: unknown[] }).items : (raw as unknown[]);
    const issues = (issueArray as unknown[]).map((item) => GitHubIssueSchema.parse(item));
    const normalised = issues.map((issue) => normaliseGitHubIssue(issue, this.config.owner, this.config.repo));
    const links = parseLinkHeader(response.headers.get('link'));
    const nextPage = links.next ? (new URL(links.next).searchParams.get('page') ?? undefined) : undefined;

    return { items: normalised, hasMore: !!links.next, cursor: nextPage };
  }

  async listRelated(id: string, scope?: DiscoveryScope): Promise<PaginatedResult<NormalisedIssue>> {
    this.ensureInitialised();
    const primary = await this.getIssue(id);
    const hints = extractDiscoveryHints(primary.references, primary.metadata);
    const maxItems = scope?.maxItems ?? this.config.perPage;
    const issueHints = hints.filter((h) => h.kind === 'issue' || h.kind === 'pull_request').slice(0, maxItems);
    const related: NormalisedIssue[] = [];
    for (const hint of issueHints) {
      try {
        const relatedIssue = await this.getIssue(hint.uri);
        related.push(relatedIssue);
      } catch { /* skip unresolvable */ }
    }
    return { items: related, hasMore: false };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}`);
      if (response.status === 200) {
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        const remaining = rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null;
        const degraded = remaining !== null && remaining < 10;
        return {
          status: degraded ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.HEALTHY,
          lastChecked,
          message: remaining !== null ? `Rate limit remaining: ${remaining}` : `Repository ${this.config.owner}/${this.config.repo} is accessible`,
        };
      }
      return { status: ProviderHealthStatus.UNAVAILABLE, lastChecked, message: `GitHub API returned HTTP ${response.status}` };
    } catch (error) {
      return { status: ProviderHealthStatus.UNAVAILABLE, lastChecked, message: error instanceof Error ? error.message : 'GitHub API unavailable' };
    }
  }

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED) {
      throw new IssuesError(IssuesErrorCode.NOT_INITIALISED, 'Provider has not been initialised. Call initialize() first.');
    }
  }

  private parseIssueId(id: string): number {
    const urlMatch = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/.exec(id);
    if (urlMatch) return parseInt(urlMatch[4], 10);
    const qualifiedMatch = /^[^/]+\/[^#]+#(\d+)$/.exec(id);
    if (qualifiedMatch) return parseInt(qualifiedMatch[1], 10);
    const hashMatch = /^#?(\d+)$/.exec(id);
    if (hashMatch) return parseInt(hashMatch[1], 10);
    throw new IssuesError(IssuesErrorCode.PARSE_ERROR, `Cannot parse issue identifier: ${id}`);
  }

  private mapStatusToGitHubState(status: IssueStatus): 'open' | 'closed' | 'all' {
    switch (status) {
      case IssueStatus.OPEN: case IssueStatus.IN_PROGRESS: case IssueStatus.BLOCKED: case IssueStatus.IN_REVIEW: return 'open';
      case IssueStatus.DONE: case IssueStatus.CLOSED: return 'closed';
      default: return 'all';
    }
  }

  private async request(path: string) {
    const url = path.startsWith('http') ? path : `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'virgil-cli/0.1.0' };
    if (this._token) { headers['Authorization'] = `Bearer ${this._token}`; }
    const response = await this.http.get(url, headers);
    if (response.status === 429) {
      throw new IssuesError(IssuesErrorCode.RATE_LIMITED, 'GitHub API rate limit exceeded');
    }
    return response;
  }

  private assertOk(status: number, path: string): void {
    if (status === 401 || status === 403) {
      throw new IssuesError(IssuesErrorCode.AUTH_FAILED, `Authentication failed for ${path} (HTTP ${status})`);
    }
    if (status < 200 || status >= 300) {
      throw new IssuesError(IssuesErrorCode.HTTP_ERROR, `GitHub API returned HTTP ${status} for ${path}`);
    }
  }
}
