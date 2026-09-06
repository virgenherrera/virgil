import type { DiscoveryScope, PaginatedResult, ProviderHealth } from '../contracts/common.types.js';
import { ProviderHealthStatus } from '../contracts/common.types.js';
import type { IssueProvider, IssueSearchQuery, NormalisedIssue } from '../contracts/issue-provider.types.js';
import type { SemVer } from '../shared/primitives.js';
import { createTimestamp } from '../shared/primitives.js';
import type { ProviderMetadata } from '../shared/provider.types.js';
import { ProviderCapability, ProviderStatus } from '../shared/provider.types.js';
import { GitHubIssueSchema } from './github-api-response.schema.js';
import { extractDiscoveryHints } from './github-discovery-hints.js';
import { normaliseGitHubIssue } from './github-field-normaliser.js';
import type { GitHubIssuesConfig } from './issues-config.schema.js';
import { IssuesError, IssuesErrorCode } from './issues.errors.js';

export interface ICdpBrowser {
  executePom(pom: unknown, targetUrl: string): Promise<{ content: Record<string, unknown> }>;
  close(): Promise<void>;
}

export const CDP_BROWSER = Symbol('CDP_BROWSER');

export class GitHubCdpAdapter implements IssueProvider {
  readonly metadata: ProviderMetadata;
  private _status: ProviderStatus = ProviderStatus.REGISTERED;

  constructor(
    private readonly config: GitHubIssuesConfig,
    private readonly browser: ICdpBrowser | null,
  ) {
    this.metadata = {
      id: `github-cdp:${config.owner}/${config.repo}`,
      name: `GitHub CDP (${config.owner}/${config.repo})`,
      version: '0.1.0' as SemVer,
      capabilities: [ProviderCapability.ISSUE],
    };
  }

  get status(): ProviderStatus { return this._status; }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this._status = ProviderStatus.DISCONNECTED;
      throw new IssuesError(IssuesErrorCode.CDP_UNAVAILABLE, 'CDP browser adapter is not available');
    }
    this._status = ProviderStatus.CONNECTED;
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (!this.browser) { this._status = ProviderStatus.DISCONNECTED; }
    return this._status;
  }

  async dispose(): Promise<void> {
    if (this.browser) { await this.browser.close(); }
    this._status = ProviderStatus.DISCONNECTED;
  }

  async getIssue(id: string): Promise<NormalisedIssue> {
    this.ensureInitialised();
    const issueNumber = this.parseIssueId(id);
    const webBaseUrl = this.deriveWebUrl();
    const targetUrl = `${webBaseUrl}/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;
    const pom = this.buildIssuePom();
    const result = await this.browser!.executePom(pom, targetUrl);
    const parsed = GitHubIssueSchema.parse(result.content);
    return normaliseGitHubIssue(parsed, this.config.owner, this.config.repo);
  }

  async search(query: IssueSearchQuery, scope?: DiscoveryScope): Promise<PaginatedResult<NormalisedIssue>> {
    this.ensureInitialised();
    const webBaseUrl = this.deriveWebUrl();
    const params = new URLSearchParams();
    if (query.text) params.set('q', query.text);
    if (query.status) {
      params.set('q', [params.get('q') ?? '', `is:${query.status === 'open' ? 'open' : 'closed'}`].filter(Boolean).join(' '));
    }
    if (query.labels?.length) {
      for (const label of query.labels) {
        params.set('q', [params.get('q') ?? '', `label:${label}`].filter(Boolean).join(' '));
      }
    }
    const targetUrl = `${webBaseUrl}/${this.config.owner}/${this.config.repo}/issues?${params.toString()}`;
    const pom = this.buildIssueListPom(scope?.maxItems ?? this.config.perPage);
    const result = await this.browser!.executePom(pom, targetUrl);
    const rawItems = (result.content['issues'] as unknown[]) ?? [];
    const issues = rawItems.map((item) => GitHubIssueSchema.parse(item));
    const normalised = issues.map((issue) => normaliseGitHubIssue(issue, this.config.owner, this.config.repo));
    return { items: normalised, hasMore: false };
  }

  async listRelated(id: string, scope?: DiscoveryScope): Promise<PaginatedResult<NormalisedIssue>> {
    this.ensureInitialised();
    const primary = await this.getIssue(id);
    const hints = extractDiscoveryHints(primary.references, primary.metadata);
    const maxItems = scope?.maxItems ?? this.config.perPage;
    const issueHints = hints.filter((h) => h.kind === 'issue' || h.kind === 'pull_request').slice(0, maxItems);
    const related: NormalisedIssue[] = [];
    for (const hint of issueHints) {
      try { related.push(await this.getIssue(hint.uri)); } catch { /* skip */ }
    }
    return { items: related, hasMore: false };
  }

  async health(): Promise<ProviderHealth> {
    const lastChecked = createTimestamp();
    if (!this.browser) {
      return { status: ProviderHealthStatus.UNAVAILABLE, lastChecked, message: 'CDP browser adapter is not available' };
    }
    return {
      status: this._status === ProviderStatus.CONNECTED ? ProviderHealthStatus.HEALTHY : ProviderHealthStatus.UNAVAILABLE,
      lastChecked,
      message: `CDP browser adapter status: ${this._status}`,
    };
  }

  private ensureInitialised(): void {
    if (this._status !== ProviderStatus.CONNECTED || !this.browser) {
      throw new IssuesError(IssuesErrorCode.NOT_INITIALISED, 'CDP adapter has not been initialised. Call initialize() first.');
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

  private deriveWebUrl(): string {
    if (this.config.baseUrl === 'https://api.github.com') return 'https://github.com';
    return this.config.baseUrl.replace(/\/api\/v3$/, '');
  }

  private buildIssuePom() {
    return {
      targetApp: 'github-issues', version: '1.0.0', description: 'Extract a single GitHub issue',
      navigationSteps: [],
      extractionSteps: [
        { field: 'id', selector: '[data-issue-id]', attribute: 'data-issue-id', type: 'number' as const },
        { field: 'number', selector: '.gh-header-number', type: 'number' as const },
        { field: 'title', selector: '.js-issue-title', type: 'text' as const },
        { field: 'body', selector: '.js-comment-body', type: 'text' as const },
        { field: 'state', selector: '.State', type: 'text' as const },
      ],
      outputShape: [
        { name: 'id', type: 'number' as const }, { name: 'number', type: 'number' as const },
        { name: 'title', type: 'string' as const }, { name: 'body', type: 'string' as const },
        { name: 'state', type: 'string' as const },
      ],
    };
  }

  private buildIssueListPom(maxItems: number) {
    return {
      targetApp: 'github-issues-list', version: '1.0.0',
      description: `Extract up to ${maxItems} GitHub issues from a list page`,
      navigationSteps: [],
      extractionSteps: [{ field: 'issues', selector: '.js-issue-row', type: 'list' as const, maxItems }],
      outputShape: [{ name: 'issues', type: 'array' as const }],
    };
  }
}
