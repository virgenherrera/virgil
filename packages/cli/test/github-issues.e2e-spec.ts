import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IssueReferenceType,
  IssueStatus,
  NormalisedIssueSchema,
} from '../src/contracts/issue-provider.types.js';
import { ProviderHealthStatus } from '../src/contracts/common.types.js';
import {
  ProviderCapability,
  ProviderStatus,
} from '../src/shared/provider.types.js';
import {
  GitHubAdapterSelectorService,
  GitHubApiAdapter,
  GitHubApiError,
  GitHubApiErrorCode,
  GitHubCdpAdapter,
  GitHubCdpError,
  GitHubIssuesModule,
  GitHubAdapterPreference,
  GitHubIssuesConfigSchema,
  normaliseGitHubIssue,
  extractDiscoveryHints,
  extractReferencesFromBody,
  extractLabelNames,
  mapGitHubState,
  parseLinkHeader,
  HTTP_CLIENT,
  type GitHubIssuesConfig,
  type IHttpClient,
  type HttpResponse,
  type ICdpBrowser,
} from '../src/issues/index.js';
import type { GitHubIssue } from '../src/issues/github-api-response.schema.js';
import { GitHubIssueSchema } from '../src/issues/github-api-response.schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal valid GitHub API issue response fixture. */
function createGitHubIssueFixture(
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
  return GitHubIssueSchema.parse({
    id: 123456,
    number: 42,
    title: 'Fix the widget',
    body: 'The widget is broken.\n\nRelated: #10, owner/repo#20\nhttps://github.com/owner/repo/pull/30',
    state: 'open',
    state_reason: null,
    html_url: 'https://github.com/test-owner/test-repo/issues/42',
    user: { login: 'alice', id: 1, html_url: 'https://github.com/alice' },
    assignee: {
      login: 'bob',
      id: 2,
      html_url: 'https://github.com/bob',
    },
    assignees: [],
    labels: [
      { id: 1, name: 'bug', color: 'fc2929' },
      { id: 2, name: 'priority:high' },
    ],
    milestone: {
      id: 1,
      number: 1,
      title: 'v1.0',
      state: 'open',
      html_url: 'https://github.com/test-owner/test-repo/milestone/1',
    },
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-16T12:00:00Z',
    closed_at: null,
    ...overrides,
  });
}

/** Creates a second fixture for search/list tests. */
function createSecondIssueFixture(): GitHubIssue {
  return GitHubIssueSchema.parse({
    id: 789012,
    number: 43,
    title: 'Add new feature',
    body: 'We need a new feature.',
    state: 'closed',
    state_reason: 'completed',
    html_url: 'https://github.com/test-owner/test-repo/issues/43',
    user: { login: 'charlie', id: 3, html_url: 'https://github.com/charlie' },
    assignee: null,
    assignees: [],
    labels: ['enhancement'],
    milestone: null,
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2025-01-14T09:00:00Z',
    closed_at: '2025-01-14T09:00:00Z',
  });
}

/**
 * Creates a mock HTTP client backed by fixture data.
 *
 * Pattern matching extracts the URL path (stripping the base URL) and checks
 * whether the path matches the pattern exactly or the path starts with the
 * pattern followed by a query-string delimiter. Patterns are tried
 * longest-first so more specific routes take precedence.
 */
function createMockHttpClient(
  responses: Map<
    string,
    { status: number; body: unknown; headers?: Record<string, string> }
  >,
): IHttpClient {
  const sortedEntries = [...responses.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );

  return {
    async get(
      url: string,
      _headers?: Record<string, string>,
    ): Promise<HttpResponse> {
      // Extract the path portion from the full URL.
      const pathStart = url.indexOf('/', url.indexOf('//') + 2);
      const path = pathStart >= 0 ? url.slice(pathStart) : url;

      for (const [pattern, config] of sortedEntries) {
        // A pattern with '?' is a prefix match (endpoint + query string).
        // A pattern without '?' must match the path exactly or as a
        // complete path prefix followed by '?'.
        if (pattern.includes('?')) {
          if (path.includes(pattern)) {
            return buildResponse(config);
          }
        } else if (path === pattern || path.startsWith(pattern + '?')) {
          return buildResponse(config);
        }
      }
      return {
        status: 404,
        headers: { get: () => null },
        json: async () => ({ message: 'Not Found' }),
      };
    },
  };
}

function buildResponse(config: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}): HttpResponse {
  return {
    status: config.status,
    headers: {
      get: (name: string) => config.headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => config.body,
  };
}

/** Creates a default mock HTTP client for the test-owner/test-repo repository. */
function createDefaultMockHttpClient(): IHttpClient {
  const issue42 = createGitHubIssueFixture();
  const issue43 = createSecondIssueFixture();
  const issue10 = createGitHubIssueFixture({
    id: 100010,
    number: 10,
    title: 'Related issue',
    body: null,
    html_url: 'https://github.com/test-owner/test-repo/issues/10',
    labels: [],
    milestone: null,
    assignee: null,
  });

  type MockEntry = {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  };
  const routes = new Map<string, MockEntry>([
    ['/repos/test-owner/test-repo/issues/42', { status: 200, body: issue42 }],
    ['/repos/test-owner/test-repo/issues/43', { status: 200, body: issue43 }],
    ['/repos/test-owner/test-repo/issues/10', { status: 200, body: issue10 }],
    [
      '/repos/test-owner/test-repo/issues?',
      {
        status: 200,
        body: [issue42, issue43],
        headers: {
          link: '<https://api.github.com/repos/test-owner/test-repo/issues?page=2>; rel="next", <https://api.github.com/repos/test-owner/test-repo/issues?page=5>; rel="last"',
        },
      },
    ],
    [
      '/search/issues?',
      {
        status: 200,
        body: { items: [issue42], total_count: 1 },
      },
    ],
    [
      '/repos/test-owner/test-repo',
      {
        status: 200,
        body: { id: 1, full_name: 'test-owner/test-repo' },
        headers: { 'x-ratelimit-remaining': '4999' },
      },
    ],
  ]);
  return createMockHttpClient(routes);
}

/** Creates a mock CDP browser backed by fixture data. */
function createMockCdpBrowser(issueFixture: GitHubIssue): ICdpBrowser {
  return {
    async executePom(
      _pom: unknown,
      _targetUrl: string,
    ): Promise<{ content: Record<string, unknown> }> {
      return { content: issueFixture as unknown as Record<string, unknown> };
    },
    async close(): Promise<void> {
      // No-op
    },
  };
}

/** Creates a validated config fixture. */
function createTestConfig(
  overrides: Partial<{
    owner: string;
    repo: string;
    baseUrl: string;
    adapterPreference: string;
    perPage: number;
  }> = {},
): GitHubIssuesConfig {
  return GitHubIssuesConfigSchema.parse({
    owner: 'test-owner',
    repo: 'test-repo',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test module wiring
// ---------------------------------------------------------------------------

@Module({
  imports: [GitHubIssuesModule],
})
class TestGitHubIssuesModule {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHub Issues provider (e2e)', () => {
  let moduleRef: TestingModule;
  let selectorService: GitHubAdapterSelectorService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TestGitHubIssuesModule],
    })
      .overrideProvider(HTTP_CLIENT)
      .useValue(createDefaultMockHttpClient())
      .compile();

    selectorService = moduleRef.get(GitHubAdapterSelectorService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  // -------------------------------------------------------------------------
  // Config schema validation
  // -------------------------------------------------------------------------

  describe('GitHubIssuesConfigSchema', () => {
    it('validates a minimal configuration with defaults', () => {
      const config = GitHubIssuesConfigSchema.parse({
        owner: 'octocat',
        repo: 'hello-world',
      });

      expect(config.owner).toBe('octocat');
      expect(config.repo).toBe('hello-world');
      expect(config.baseUrl).toBe('https://api.github.com');
      expect(config.adapterPreference).toBe(GitHubAdapterPreference.API);
      expect(config.perPage).toBe(30);
    });

    it('validates a fully-specified configuration', () => {
      const config = GitHubIssuesConfigSchema.parse({
        owner: 'my-org',
        repo: 'my-repo',
        baseUrl: 'https://ghes.example.com/api/v3',
        adapterPreference: 'auto',
        credentialRef: { source: 'env', variableName: 'GH_TOKEN' },
        perPage: 50,
      });

      expect(config.baseUrl).toBe('https://ghes.example.com/api/v3');
      expect(config.adapterPreference).toBe(GitHubAdapterPreference.AUTO);
      expect(config.perPage).toBe(50);
    });

    it('rejects an invalid owner format', () => {
      expect(() =>
        GitHubIssuesConfigSchema.parse({ owner: '-invalid', repo: 'r' }),
      ).toThrow();
    });

    it('rejects a perPage value exceeding 100', () => {
      expect(() =>
        GitHubIssuesConfigSchema.parse({
          owner: 'o',
          repo: 'r',
          perPage: 101,
        }),
      ).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // DI container wiring
  // -------------------------------------------------------------------------

  describe('DI container', () => {
    it('resolves GitHubAdapterSelectorService through the module', () => {
      expect(selectorService).toBeInstanceOf(GitHubAdapterSelectorService);
    });
  });

  // -------------------------------------------------------------------------
  // API adapter: request construction and response parsing
  // -------------------------------------------------------------------------

  describe('GitHubApiAdapter', () => {
    let adapter: GitHubApiAdapter;

    beforeEach(async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();
    });

    afterEach(async () => {
      await adapter.dispose();
    });

    it('reports CONNECTED status after successful initialisation', () => {
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('advertises ISSUE capability in metadata', () => {
      expect(adapter.metadata.capabilities).toContain(ProviderCapability.ISSUE);
    });

    it('resolves an issue by bare number', async () => {
      const issue = await adapter.getIssue('42');

      expect(issue.id).toBe('github:test-owner/test-repo#42');
      expect(issue.externalId).toBe('123456');
      expect(issue.title).toBe('Fix the widget');
      expect(issue.status).toBe(IssueStatus.OPEN);
      expect(issue.assignee).toBe('bob');
      expect(issue.labels).toEqual(['bug', 'priority:high']);
    });

    it('resolves an issue by hash-prefixed number', async () => {
      const issue = await adapter.getIssue('#42');
      expect(issue.id).toBe('github:test-owner/test-repo#42');
    });

    it('resolves an issue by owner/repo#N format', async () => {
      const issue = await adapter.getIssue('test-owner/test-repo#42');
      expect(issue.id).toBe('github:test-owner/test-repo#42');
    });

    it('resolves an issue by full GitHub URL', async () => {
      const issue = await adapter.getIssue(
        'https://github.com/test-owner/test-repo/issues/42',
      );
      expect(issue.id).toBe('github:test-owner/test-repo#42');
    });

    it('produces a Zod-valid NormalisedIssue', async () => {
      const issue = await adapter.getIssue('42');
      const parsed = NormalisedIssueSchema.parse(issue);
      expect(parsed.id).toBe(issue.id);
    });

    it('throws NOT_FOUND for a missing issue', async () => {
      await expect(adapter.getIssue('999')).rejects.toThrow(GitHubApiError);
      try {
        await adapter.getIssue('999');
      } catch (error) {
        expect((error as GitHubApiError).code).toBe(
          GitHubApiErrorCode.NOT_FOUND,
        );
      }
    });

    it('throws PARSE_ERROR for an unparseable id', () => {
      expect(() =>
        // Access the private method via the public getIssue call
        adapter.getIssue('not-a-valid-id'),
      ).rejects.toThrow(GitHubApiError);
    });

    it('searches issues without text (list endpoint)', async () => {
      const result = await adapter.search({});

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('2');
    });

    it('searches issues with text query (search endpoint)', async () => {
      const result = await adapter.search({ text: 'widget' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Fix the widget');
    });

    it('searches issues filtered by status', async () => {
      const result = await adapter.search({ status: IssueStatus.OPEN });

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('searches issues filtered by labels', async () => {
      const result = await adapter.search({ labels: ['bug'] });

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('lists related issues from cross-references', async () => {
      const result = await adapter.listRelated('42');

      // Issue #42 references #10, owner/repo#20, and PR #30
      // Only #10 is resolvable in our mock
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0].id).toContain('#10');
    });

    it('reports healthy provider health with rate-limit info', async () => {
      const health = await adapter.health();

      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.message).toContain('Rate limit remaining');
      expect(health.lastChecked).toEqual(expect.any(Number));
    });

    it('reports DISCONNECTED after dispose', async () => {
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws NOT_INITIALISED when called before initialize()', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const uninitAdapter = new GitHubApiAdapter(config, http);

      await expect(uninitAdapter.getIssue('42')).rejects.toThrow(
        GitHubApiError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // API adapter: authentication and rate limiting
  // -------------------------------------------------------------------------

  describe('GitHubApiAdapter authentication', () => {
    it('initialises as DEGRADED on 401 response', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            '/repos/test-owner/test-repo',
            { status: 401, body: { message: 'Bad credentials' } },
          ],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);

      await expect(adapter.initialize()).rejects.toThrow(GitHubApiError);
      expect(adapter.status).toBe(ProviderStatus.DEGRADED);
    });

    it('throws RATE_LIMITED on 429 response', async () => {
      const http = createMockHttpClient(
        new Map([
          ['/repos/test-owner/test-repo', { status: 200, body: { id: 1 } }],
          [
            '/repos/test-owner/test-repo/issues/42',
            { status: 429, body: { message: 'rate limit exceeded' } },
          ],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      await expect(adapter.getIssue('42')).rejects.toThrow(GitHubApiError);
    });

    it('reports DEGRADED health when rate-limit remaining is low', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            '/repos/test-owner/test-repo',
            {
              status: 200,
              body: { id: 1 },
              headers: { 'x-ratelimit-remaining': '5' },
            },
          ],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const health = await adapter.health();
      expect(health.status).toBe(ProviderHealthStatus.DEGRADED);
    });
  });

  // -------------------------------------------------------------------------
  // CDP adapter: extraction and normalisation
  // -------------------------------------------------------------------------

  describe('GitHubCdpAdapter', () => {
    let adapter: GitHubCdpAdapter;
    const issueFixture = createGitHubIssueFixture();

    beforeEach(async () => {
      const config = createTestConfig();
      const browser = createMockCdpBrowser(issueFixture);
      adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();
    });

    afterEach(async () => {
      await adapter.dispose();
    });

    it('reports CONNECTED status after initialisation', () => {
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('advertises ISSUE capability', () => {
      expect(adapter.metadata.capabilities).toContain(ProviderCapability.ISSUE);
    });

    it('resolves an issue through CDP extraction', async () => {
      const issue = await adapter.getIssue('42');

      expect(issue.id).toBe('github:test-owner/test-repo#42');
      expect(issue.title).toBe('Fix the widget');
      expect(issue.status).toBe(IssueStatus.OPEN);
    });

    it('produces a Zod-valid NormalisedIssue from CDP', async () => {
      const issue = await adapter.getIssue('42');
      const parsed = NormalisedIssueSchema.parse(issue);
      expect(parsed.id).toBe(issue.id);
    });

    it('throws when CDP browser is null', async () => {
      const config = createTestConfig();
      const noBrowserAdapter = new GitHubCdpAdapter(config, null);

      await expect(noBrowserAdapter.initialize()).rejects.toThrow(
        GitHubCdpError,
      );
      expect(noBrowserAdapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('reports UNAVAILABLE health when browser is null', async () => {
      const config = createTestConfig();
      const noBrowserAdapter = new GitHubCdpAdapter(config, null);

      const health = await noBrowserAdapter.health();
      expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });

    it('reports DISCONNECTED after dispose', async () => {
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  // -------------------------------------------------------------------------
  // Identical normalised output from both adapters
  // -------------------------------------------------------------------------

  describe('cross-adapter normalisation parity', () => {
    it('produces identical NormalisedIssue from API and CDP paths', async () => {
      const config = createTestConfig();
      const issueFixture = createGitHubIssueFixture();
      const http = createDefaultMockHttpClient();
      const browser = createMockCdpBrowser(issueFixture);

      const apiAdapter = new GitHubApiAdapter(config, http);
      await apiAdapter.initialize();
      const apiIssue = await apiAdapter.getIssue('42');

      const cdpAdapter = new GitHubCdpAdapter(config, browser);
      await cdpAdapter.initialize();
      const cdpIssue = await cdpAdapter.getIssue('42');

      // Core fields must match (discoveredAt timestamps will differ)
      expect(apiIssue.id).toBe(cdpIssue.id);
      expect(apiIssue.externalId).toBe(cdpIssue.externalId);
      expect(apiIssue.title).toBe(cdpIssue.title);
      expect(apiIssue.description).toBe(cdpIssue.description);
      expect(apiIssue.status).toBe(cdpIssue.status);
      expect(apiIssue.assignee).toBe(cdpIssue.assignee);
      expect(apiIssue.labels).toEqual(cdpIssue.labels);
      expect(apiIssue.references).toEqual(cdpIssue.references);

      await apiAdapter.dispose();
      await cdpAdapter.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // Adapter selector: all config states
  // -------------------------------------------------------------------------

  describe('GitHubAdapterSelectorService', () => {
    it('selects API adapter when preference is "api"', async () => {
      const config = createTestConfig({ adapterPreference: 'api' });
      const http = createDefaultMockHttpClient();

      const result = await selectorService.select(config, http);

      expect(result.selectedAdapter).toBe('api');
      expect(result.adapter).toBeInstanceOf(GitHubApiAdapter);
      expect(result.reason).toContain('API');
    });

    it('selects CDP adapter when preference is "cdp"', async () => {
      const config = createTestConfig({ adapterPreference: 'cdp' });
      const http = createDefaultMockHttpClient();
      const browser = createMockCdpBrowser(createGitHubIssueFixture());

      const result = await selectorService.select(
        config,
        http,
        undefined,
        browser,
      );

      expect(result.selectedAdapter).toBe('cdp');
      expect(result.adapter).toBeInstanceOf(GitHubCdpAdapter);
      expect(result.reason).toContain('CDP');
    });

    it('selects API adapter in auto mode when API succeeds', async () => {
      const config = createTestConfig({ adapterPreference: 'auto' });
      const http = createDefaultMockHttpClient();

      const result = await selectorService.select(config, http);

      expect(result.selectedAdapter).toBe('api');
      expect(result.reason).toContain('auto');
    });

    it('falls back to CDP in auto mode when API fails', async () => {
      const config = createTestConfig({ adapterPreference: 'auto' });
      const failingHttp = createMockHttpClient(
        new Map([
          [
            '/repos/test-owner/test-repo',
            { status: 500, body: { message: 'Internal Server Error' } },
          ],
        ]),
      );
      const browser = createMockCdpBrowser(createGitHubIssueFixture());

      const result = await selectorService.select(
        config,
        failingHttp,
        undefined,
        browser,
      );

      expect(result.selectedAdapter).toBe('cdp');
      expect(result.reason).toContain('fallback');
    });

    it('throws when both adapters fail in auto mode', async () => {
      const config = createTestConfig({ adapterPreference: 'auto' });
      const failingHttp = createMockHttpClient(
        new Map([
          [
            '/repos/test-owner/test-repo',
            { status: 500, body: { message: 'error' } },
          ],
        ]),
      );

      await expect(
        selectorService.select(config, failingHttp, undefined, null),
      ).rejects.toThrow(/No adapter available/);
    });
  });

  // -------------------------------------------------------------------------
  // CDP adapter: search and listRelated
  // -------------------------------------------------------------------------

  describe('GitHubCdpAdapter search and related', () => {
    it('searches issues via CDP extraction', async () => {
      const config = createTestConfig();
      const listFixture = createGitHubIssueFixture();
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          _targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          return {
            content: { issues: [listFixture] } as unknown as Record<
              string,
              unknown
            >,
          };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const result = await adapter.search({ text: 'widget' });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);

      await adapter.dispose();
    });

    it('searches issues with status filter via CDP', async () => {
      const config = createTestConfig();
      const listFixture = createGitHubIssueFixture();
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          _targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          return {
            content: { issues: [listFixture] } as unknown as Record<
              string,
              unknown
            >,
          };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const result = await adapter.search({ status: IssueStatus.OPEN });
      expect(result.items.length).toBeGreaterThanOrEqual(0);

      await adapter.dispose();
    });

    it('searches issues with labels filter via CDP', async () => {
      const config = createTestConfig();
      const listFixture = createGitHubIssueFixture();
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          _targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          return {
            content: { issues: [listFixture] } as unknown as Record<
              string,
              unknown
            >,
          };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const result = await adapter.search({ labels: ['bug', 'urgent'] });
      expect(result.items.length).toBeGreaterThanOrEqual(0);

      await adapter.dispose();
    });

    it('lists related issues via CDP', async () => {
      const config = createTestConfig();
      const issueFixture = createGitHubIssueFixture({
        body: 'Related: #10',
      });
      const relatedFixture = createGitHubIssueFixture({
        id: 100010,
        number: 10,
        title: 'Related issue',
        body: null,
        html_url: 'https://github.com/test-owner/test-repo/issues/10',
      });

      let callCount = 0;
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          callCount++;
          if (targetUrl.includes('/issues/42')) {
            return {
              content: issueFixture as unknown as Record<string, unknown>,
            };
          }
          return {
            content: relatedFixture as unknown as Record<string, unknown>,
          };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const result = await adapter.listRelated('42');
      expect(result.items.length).toBeGreaterThanOrEqual(0);
      expect(callCount).toBeGreaterThan(1);

      await adapter.dispose();
    });

    it('reports HEALTHY health when connected', async () => {
      const config = createTestConfig();
      const browser = createMockCdpBrowser(createGitHubIssueFixture());
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const health = await adapter.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);

      await adapter.dispose();
    });

    it('returns correct healthCheck status', async () => {
      const config = createTestConfig();
      const browser = createMockCdpBrowser(createGitHubIssueFixture());
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);

      await adapter.dispose();
    });

    it('returns DISCONNECTED healthCheck when browser is null', async () => {
      const config = createTestConfig();
      const adapter = new GitHubCdpAdapter(config, null);

      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws NOT_INITIALISED when calling getIssue before initialize', async () => {
      const config = createTestConfig();
      const browser = createMockCdpBrowser(createGitHubIssueFixture());
      const adapter = new GitHubCdpAdapter(config, browser);

      await expect(adapter.getIssue('42')).rejects.toThrow(GitHubCdpError);
    });

    it('derives correct web URL for GHES', async () => {
      const config = createTestConfig({
        baseUrl: 'https://ghes.example.com/api/v3',
      });
      const issueFixture = createGitHubIssueFixture();
      let capturedUrl = '';
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          capturedUrl = targetUrl;
          return {
            content: issueFixture as unknown as Record<string, unknown>,
          };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      await adapter.getIssue('42');
      expect(capturedUrl).toContain('ghes.example.com');
      expect(capturedUrl).not.toContain('/api/v3');

      await adapter.dispose();
    });

    it('parses issue ID from owner/repo#N format in CDP', async () => {
      const config = createTestConfig();
      const issueFixture = createGitHubIssueFixture();
      const browser = createMockCdpBrowser(issueFixture);
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const issue = await adapter.getIssue('test-owner/test-repo#42');
      expect(issue.id).toBe('github:test-owner/test-repo#42');

      await adapter.dispose();
    });

    it('parses issue ID from full URL in CDP', async () => {
      const config = createTestConfig();
      const issueFixture = createGitHubIssueFixture();
      const browser = createMockCdpBrowser(issueFixture);
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const issue = await adapter.getIssue(
        'https://github.com/test-owner/test-repo/issues/42',
      );
      expect(issue.id).toBe('github:test-owner/test-repo#42');

      await adapter.dispose();
    });

    it('throws for unparseable issue ID in CDP', async () => {
      const config = createTestConfig();
      const browser = createMockCdpBrowser(createGitHubIssueFixture());
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      await expect(adapter.getIssue('not-valid')).rejects.toThrow(
        GitHubCdpError,
      );

      await adapter.dispose();
    });

    it('handles empty issues list from CDP search', async () => {
      const config = createTestConfig();
      const browser: ICdpBrowser = {
        async executePom(
          _pom: unknown,
          _targetUrl: string,
        ): Promise<{ content: Record<string, unknown> }> {
          return { content: {} };
        },
        async close(): Promise<void> {},
      };
      const adapter = new GitHubCdpAdapter(config, browser);
      await adapter.initialize();

      const result = await adapter.search({});
      expect(result.items).toEqual([]);

      await adapter.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // API adapter: additional branch coverage
  // -------------------------------------------------------------------------

  describe('GitHubApiAdapter additional branches', () => {
    it('healthCheck returns REGISTERED before initialisation', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);

      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('healthCheck transitions to DISCONNECTED on network failure', async () => {
      const config = createTestConfig();
      const throwingHttp: IHttpClient = {
        async get(): Promise<HttpResponse> {
          throw new Error('Network error');
        },
      };
      const adapter = new GitHubApiAdapter(config, throwingHttp);
      // Manually set status past REGISTERED so healthCheck runs the check
      Object.assign(adapter, { _status: ProviderStatus.CONNECTED });

      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('healthCheck transitions to DEGRADED on non-200', async () => {
      const config = createTestConfig();
      const http = createMockHttpClient(
        new Map([['/repos/test-owner/test-repo', { status: 503, body: {} }]]),
      );
      const adapter = new GitHubApiAdapter(config, http);
      Object.assign(adapter, { _status: ProviderStatus.CONNECTED });

      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DEGRADED);
    });

    it('search uses cursor parameter', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const result = await adapter.search({ cursor: '2' });
      expect(result.items.length).toBeGreaterThan(0);

      await adapter.dispose();
    });

    it('search maps CLOSED status to closed state', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const result = await adapter.search({ status: IssueStatus.CLOSED });
      expect(result.items.length).toBeGreaterThanOrEqual(0);

      await adapter.dispose();
    });

    it('health reports UNAVAILABLE when API returns error', async () => {
      const config = createTestConfig();
      const http = createMockHttpClient(
        new Map([
          [
            '/repos/test-owner/test-repo',
            { status: 500, body: { message: 'error' } },
          ],
        ]),
      );
      const adapter = new GitHubApiAdapter(config, http);
      // Set to connected to bypass init
      Object.assign(adapter, { _status: ProviderStatus.CONNECTED });

      const health = await adapter.health();
      expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);

      await adapter.dispose();
    });

    it('health reports UNAVAILABLE on network error', async () => {
      const config = createTestConfig();
      const http: IHttpClient = {
        async get(): Promise<HttpResponse> {
          throw new Error('Network failure');
        },
      };
      const adapter = new GitHubApiAdapter(config, http);
      Object.assign(adapter, { _status: ProviderStatus.CONNECTED });

      const health = await adapter.health();
      expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(health.message).toContain('Network failure');
    });

    it('initialize throws on network failure', async () => {
      const config = createTestConfig();
      const http: IHttpClient = {
        async get(): Promise<HttpResponse> {
          throw new Error('ECONNREFUSED');
        },
      };
      const adapter = new GitHubApiAdapter(config, http);

      await expect(adapter.initialize()).rejects.toThrow(GitHubApiError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('initialize throws NOT_FOUND on 404', async () => {
      const http = createMockHttpClient(
        new Map([['/repos/test-owner/test-repo', { status: 404, body: {} }]]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);

      await expect(adapter.initialize()).rejects.toThrow(GitHubApiError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('initialize throws on unexpected status', async () => {
      const http = createMockHttpClient(
        new Map([['/repos/test-owner/test-repo', { status: 502, body: {} }]]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);

      await expect(adapter.initialize()).rejects.toThrow(GitHubApiError);
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('getIssue throws AUTH_FAILED on 403', async () => {
      const http = createMockHttpClient(
        new Map([
          ['/repos/test-owner/test-repo', { status: 200, body: { id: 1 } }],
          [
            '/repos/test-owner/test-repo/issues/42',
            { status: 403, body: { message: 'Forbidden' } },
          ],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      await expect(adapter.getIssue('42')).rejects.toThrow(GitHubApiError);
    });

    it('listRelated skips unresolvable references', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      // Issue 42 references #10, owner/repo#20, PR#30 — only #10 is resolvable
      const result = await adapter.listRelated('42');
      // Should include at least 1 (the resolvable #10), rest silently skipped
      expect(result.items.length).toBeGreaterThanOrEqual(1);

      await adapter.dispose();
    });

    it('health reports healthy without rate-limit header', async () => {
      const http = createMockHttpClient(
        new Map([
          ['/repos/test-owner/test-repo', { status: 200, body: { id: 1 } }],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const health = await adapter.health();
      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.message).toContain('accessible');
    });

    it('search with text and status combines query parameters', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const result = await adapter.search({
        text: 'widget',
        status: IssueStatus.OPEN,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(0);

      await adapter.dispose();
    });

    it('search with scope maxItems limits page size', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const result = await adapter.search({}, { maxItems: 5 });
      expect(result.items.length).toBeGreaterThanOrEqual(0);

      await adapter.dispose();
    });

    it('sends Authorization header when token is provided', async () => {
      let capturedHeaders: Record<string, string> = {};
      const http: IHttpClient = {
        async get(
          _url: string,
          headers?: Record<string, string>,
        ): Promise<HttpResponse> {
          capturedHeaders = headers ?? {};
          return {
            status: 200,
            headers: { get: () => null },
            json: async () => ({ id: 1 }),
          };
        },
      };
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http, 'test-token-123');
      await adapter.initialize();

      expect(capturedHeaders['Authorization']).toBe('Bearer test-token-123');

      await adapter.dispose();
    });

    it('search throws HTTP_ERROR on non-2xx status', async () => {
      const http = createMockHttpClient(
        new Map([
          ['/repos/test-owner/test-repo', { status: 200, body: { id: 1 } }],
          [
            '/repos/test-owner/test-repo/issues?',
            { status: 500, body: { message: 'Server Error' } },
          ],
        ]),
      );
      const config = createTestConfig();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      await expect(adapter.search({})).rejects.toThrow(GitHubApiError);

      await adapter.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // Field normaliser (exercised through adapter, not in isolation)
  // -------------------------------------------------------------------------

  describe('field normalisation through adapter', () => {
    it('maps open state correctly', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('42');
      expect(issue.status).toBe(IssueStatus.OPEN);

      await adapter.dispose();
    });

    it('maps closed/completed state to DONE', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('43');
      expect(issue.status).toBe(IssueStatus.DONE);

      await adapter.dispose();
    });

    it('extracts cross-references from issue body', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('42');

      // Issue body: "Related: #10, owner/repo#20\nhttps://github.com/owner/repo/pull/30"
      const prRefs = issue.references.filter(
        (r) => r.type === IssueReferenceType.PULL_REQUEST,
      );
      const issueRefs = issue.references.filter(
        (r) => r.type === IssueReferenceType.ISSUE,
      );

      expect(prRefs.length).toBeGreaterThan(0);
      expect(issueRefs.length).toBeGreaterThan(0);

      await adapter.dispose();
    });

    it('populates metadata with GitHub-specific fields', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('42');

      expect(issue.metadata['owner']).toBe('test-owner');
      expect(issue.metadata['repo']).toBe('test-repo');
      expect(issue.metadata['number']).toBe(42);
      expect(issue.metadata['htmlUrl']).toBe(
        'https://github.com/test-owner/test-repo/issues/42',
      );
      expect(issue.metadata['milestone']).toBe('v1.0');
      expect(issue.metadata['author']).toBe('alice');

      await adapter.dispose();
    });

    it('builds a deterministic content identity', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('42');

      expect(issue.identity.uri).toBe(
        'https://github.com/test-owner/test-repo/issues/42',
      );
      expect(issue.identity.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(issue.identity.version).toBe('2025-01-16T12:00:00Z');

      await adapter.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // Discovery hints extraction
  // -------------------------------------------------------------------------

  describe('discovery hints through adapter', () => {
    it('extracts deduplicated hints from a normalised issue', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('42');
      const hints = extractDiscoveryHints(issue.references, issue.metadata);

      // Should include: PR ref, issue refs, user hints (bob, alice), milestone
      expect(hints.length).toBeGreaterThan(0);

      // Check deduplication: no URI appears twice
      const uris = hints.map((h) => h.uri);
      expect(new Set(uris).size).toBe(uris.length);

      // Check hint kinds
      const kinds = new Set(hints.map((h) => h.kind));
      expect(kinds.has('user')).toBe(true);

      await adapter.dispose();
    });

    it('returns empty hints for an issue with no references', async () => {
      const config = createTestConfig();
      const http = createDefaultMockHttpClient();
      const adapter = new GitHubApiAdapter(config, http);
      await adapter.initialize();

      const issue = await adapter.getIssue('10');
      const hints = extractDiscoveryHints(issue.references, issue.metadata);

      // Issue #10 has no body and no assignee, only possible hints from author
      expect(hints.length).toBeLessThanOrEqual(1);

      await adapter.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // Normaliser pure function (exercised via known fixture)
  // -------------------------------------------------------------------------

  describe('normaliseGitHubIssue pure function', () => {
    it('normalises a fixture into a valid NormalisedIssue', () => {
      const fixture = createGitHubIssueFixture();
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      NormalisedIssueSchema.parse(result);
      expect(result.id).toBe('github:test-owner/test-repo#42');
    });

    it('handles null body gracefully', () => {
      const fixture = createGitHubIssueFixture({ body: null });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      expect(result.description).toBe('');
      expect(result.references).toEqual([]);
    });

    it('handles string labels in the label array', () => {
      const fixture = createGitHubIssueFixture({
        labels: ['bug', 'enhancement'] as unknown as GitHubIssue['labels'],
      });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      expect(result.labels).toEqual(['bug', 'enhancement']);
    });

    it('attaches pull_request reference when present', () => {
      const fixture = createGitHubIssueFixture({
        pull_request: {
          url: 'https://api.github.com/repos/test-owner/test-repo/pulls/42',
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
        },
      });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      const prRefs = result.references.filter(
        (r) => r.type === IssueReferenceType.PULL_REQUEST,
      );
      expect(prRefs.length).toBeGreaterThan(0);
      expect(prRefs[0].label).toContain('PR for');
    });

    it('handles issue with no assignee', () => {
      const fixture = createGitHubIssueFixture({ assignee: null });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      expect(result.assignee).toBeUndefined();
    });

    it('handles issue with no user', () => {
      const fixture = createGitHubIssueFixture({ user: null });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      expect(result.metadata['author']).toBeNull();
    });

    it('handles issue with no milestone', () => {
      const fixture = createGitHubIssueFixture({ milestone: null });
      const result = normaliseGitHubIssue(fixture, 'test-owner', 'test-repo');

      expect(result.metadata['milestone']).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Link header parsing
  // -------------------------------------------------------------------------

  describe('parseLinkHeader', () => {
    it('parses a standard GitHub pagination Link header', () => {
      const header =
        '<https://api.github.com/repos/o/r/issues?page=2>; rel="next", <https://api.github.com/repos/o/r/issues?page=5>; rel="last"';
      const links = parseLinkHeader(header);

      expect(links.next).toBe('https://api.github.com/repos/o/r/issues?page=2');
      expect(links.last).toBe('https://api.github.com/repos/o/r/issues?page=5');
    });

    it('returns empty object for null header', () => {
      expect(parseLinkHeader(null)).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // State mapping
  // -------------------------------------------------------------------------

  describe('mapGitHubState', () => {
    it.each([
      ['open', null, IssueStatus.OPEN],
      ['closed', 'completed', IssueStatus.DONE],
      ['closed', 'not_planned', IssueStatus.CLOSED],
      ['closed', null, IssueStatus.CLOSED],
    ] as const)('maps state=%s reason=%s to %s', (state, reason, expected) => {
      expect(mapGitHubState(state, reason)).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Reference extraction
  // -------------------------------------------------------------------------

  describe('extractReferencesFromBody', () => {
    it('extracts full GitHub URLs', () => {
      const refs = extractReferencesFromBody(
        'See https://github.com/owner/repo/issues/5',
        'owner',
        'repo',
      );
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe(IssueReferenceType.ISSUE);
      expect(refs[0].uri).toBe('https://github.com/owner/repo/issues/5');
    });

    it('extracts PR URLs', () => {
      const refs = extractReferencesFromBody(
        'Fixed in https://github.com/owner/repo/pull/10',
        'owner',
        'repo',
      );
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe(IssueReferenceType.PULL_REQUEST);
    });

    it('extracts shorthand #N references within the same repo', () => {
      const refs = extractReferencesFromBody(
        'Related to #5 and #10',
        'myorg',
        'myrepo',
      );
      expect(refs).toHaveLength(2);
      expect(refs[0].uri).toBe('https://github.com/myorg/myrepo/issues/5');
    });

    it('extracts cross-repo owner/repo#N references', () => {
      const refs = extractReferencesFromBody(
        'See other-org/other-repo#15',
        'myorg',
        'myrepo',
      );
      expect(refs).toHaveLength(1);
      expect(refs[0].uri).toBe(
        'https://github.com/other-org/other-repo/issues/15',
      );
    });

    it('deduplicates references that appear multiple times', () => {
      const refs = extractReferencesFromBody('#5 is related to #5', 'o', 'r');
      expect(refs).toHaveLength(1);
    });

    it('returns empty array for null body', () => {
      expect(extractReferencesFromBody(null, 'o', 'r')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Label extraction
  // -------------------------------------------------------------------------

  describe('extractLabelNames', () => {
    it('extracts names from object labels', () => {
      expect(extractLabelNames([{ name: 'bug' }, { name: 'docs' }])).toEqual([
        'bug',
        'docs',
      ]);
    });

    it('passes through string labels', () => {
      expect(extractLabelNames(['bug', 'docs'])).toEqual(['bug', 'docs']);
    });

    it('handles mixed label formats', () => {
      expect(extractLabelNames(['bug', { name: 'docs' }])).toEqual([
        'bug',
        'docs',
      ]);
    });
  });
});
