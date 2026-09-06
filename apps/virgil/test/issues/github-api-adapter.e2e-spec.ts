import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import { IssueStatus } from '../../src/contracts/issue-provider.types.js';
import { ProviderCapability, ProviderStatus } from '../../src/shared/provider.types.js';
import type { GitHubIssue } from '../../src/issues/github-api-response.schema.js';
import { GitHubApiAdapter } from '../../src/issues/github-api.adapter.js';
import type { GitHubIssuesConfig } from '../../src/issues/issues-config.schema.js';
import { IssuesError, IssuesErrorCode } from '../../src/issues/issues.errors.js';
import type { HttpResponse, IHttpClient } from '../../src/issues/issues-http-client.js';

function makeResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string | null> = {},
): HttpResponse {
  return {
    status,
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body),
  };
}

function createMockHttp(handler: (url: string) => HttpResponse): IHttpClient {
  return { get: vi.fn(async (url: string) => handler(url)) };
}

function makeGitHubIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Test issue',
    body: 'Test body',
    state: 'open',
    state_reason: null,
    html_url: 'https://github.com/owner/repo/issues/42',
    user: { login: 'testuser', id: 1, html_url: 'https://github.com/testuser' },
    assignee: null,
    labels: [],
    milestone: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

const defaultConfig: GitHubIssuesConfig = {
  owner: 'owner',
  repo: 'repo',
  baseUrl: 'https://api.github.com',
  adapterPreference: 'api' as const,
  perPage: 30,
};

describe('GitHubApiAdapter', () => {
  describe('metadata', () => {
    it('builds correct id and name', () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      expect(adapter.metadata.id).toBe('github-api:owner/repo');
      expect(adapter.metadata.name).toBe('GitHub API (owner/repo)');
      expect(adapter.metadata.capabilities).toContain(ProviderCapability.ISSUE);
    });

    it('starts as REGISTERED', () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize', () => {
    it('sets CONNECTED on 200', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws AUTH_FAILED on 401', async () => {
      const http = createMockHttp(() => makeResponse(401));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(IssuesError);
      await expect(adapter.initialize()).rejects.toMatchObject({ code: IssuesErrorCode.AUTH_FAILED });
      expect(adapter.status).toBe(ProviderStatus.DEGRADED);
    });

    it('throws AUTH_FAILED on 403', async () => {
      const http = createMockHttp(() => makeResponse(403));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.initialize()).rejects.toThrow(IssuesError);
      expect(adapter.status).toBe(ProviderStatus.DEGRADED);
    });

    it('throws NOT_FOUND on 404', async () => {
      const http = createMockHttp(() => makeResponse(404));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.initialize()).rejects.toMatchObject({ code: IssuesErrorCode.NOT_FOUND });
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('throws HTTP_ERROR on 500', async () => {
      const http = createMockHttp(() => makeResponse(500));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.initialize()).rejects.toMatchObject({ code: IssuesErrorCode.HTTP_ERROR });
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('wraps network errors', async () => {
      const http: IHttpClient = {
        get: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
      };
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.initialize()).rejects.toMatchObject({ code: IssuesErrorCode.HTTP_ERROR });
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck', () => {
    it('returns REGISTERED when not initialized', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.REGISTERED);
    });

    it('returns CONNECTED on 200 after init', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });

    it('returns DEGRADED on non-200', async () => {
      let callCount = 0;
      const http = createMockHttp(() => {
        callCount++;
        return callCount === 1 ? makeResponse(200) : makeResponse(503);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DEGRADED);
    });

    it('returns DISCONNECTED on error', async () => {
      let callCount = 0;
      const http: IHttpClient = {
        get: vi.fn(async () => {
          callCount++;
          if (callCount === 1) return makeResponse(200);
          throw new Error('network down');
        }),
      };
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('dispose', () => {
    it('sets DISCONNECTED', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('getIssue', () => {
    it('throws NOT_INITIALISED when not initialized', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await expect(adapter.getIssue('42')).rejects.toMatchObject({ code: IssuesErrorCode.NOT_INITIALISED });
    });

    it('returns normalised issue', async () => {
      const issue = makeGitHubIssue();
      const http = createMockHttp((url) => {
        if (url.includes('/issues/42')) return makeResponse(200, issue);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.getIssue('42');
      expect(result.id).toBe('github:owner/repo#42');
      expect(result.title).toBe('Test issue');
    });

    it('throws NOT_FOUND on 404', async () => {
      const http = createMockHttp((url) => {
        if (url.includes('/issues/')) return makeResponse(404);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await expect(adapter.getIssue('999')).rejects.toMatchObject({ code: IssuesErrorCode.NOT_FOUND });
    });

    it('parses #N format', async () => {
      const issue = makeGitHubIssue();
      const http = createMockHttp((url) => {
        if (url.includes('/issues/42')) return makeResponse(200, issue);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.getIssue('#42');
      expect(result.id).toBe('github:owner/repo#42');
    });

    it('parses owner/repo#N format', async () => {
      const issue = makeGitHubIssue();
      const http = createMockHttp((url) => {
        if (url.includes('/issues/42')) return makeResponse(200, issue);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.getIssue('owner/repo#42');
      expect(result.id).toBe('github:owner/repo#42');
    });

    it('parses full URL format', async () => {
      const issue = makeGitHubIssue();
      const http = createMockHttp((url) => {
        if (url.includes('/issues/42')) return makeResponse(200, issue);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.getIssue('https://github.com/owner/repo/issues/42');
      expect(result.id).toBe('github:owner/repo#42');
    });

    it('throws PARSE_ERROR for invalid ID', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await expect(adapter.getIssue('invalid-id')).rejects.toMatchObject({ code: IssuesErrorCode.PARSE_ERROR });
    });
  });

  describe('search', () => {
    it('searches without text query (repo issues endpoint)', async () => {
      const issues = [makeGitHubIssue()];
      const http = createMockHttp((url) => {
        if (url.includes('/repos/') && url.includes('/issues?')) return makeResponse(200, issues);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('searches with text query (search endpoint)', async () => {
      const searchResult = { items: [makeGitHubIssue()] };
      const http = createMockHttp((url) => {
        if (url.includes('/search/issues')) return makeResponse(200, searchResult);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({ text: 'bug fix' });
      expect(result.items).toHaveLength(1);
    });

    it('filters by status', async () => {
      const issues = [makeGitHubIssue()];
      const http = createMockHttp((url) => {
        if (url.includes('/issues?') && url.includes('state=open')) return makeResponse(200, issues);
        return makeResponse(200, []);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({ status: IssueStatus.OPEN });
      expect(result.items).toHaveLength(1);
    });

    it('filters by labels', async () => {
      const issues = [makeGitHubIssue({ labels: [{ id: 1, name: 'bug' }] })];
      const http = createMockHttp((url) => {
        if (url.includes('labels=bug')) return makeResponse(200, issues);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({ labels: ['bug'] });
      expect(result.items).toHaveLength(1);
    });

    it('handles pagination', async () => {
      const issues = [makeGitHubIssue()];
      const linkHeader = '<https://api.github.com/repos/owner/repo/issues?page=3>; rel="next"';
      const http = createMockHttp((url) => {
        if (url.includes('/issues?')) return makeResponse(200, issues, { link: linkHeader });
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({});
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('3');
    });
  });

  describe('listRelated', () => {
    it('follows references from the primary issue', async () => {
      const primary = makeGitHubIssue({
        body: 'Related to https://github.com/owner/repo/issues/10',
      });
      const related = makeGitHubIssue({ number: 10, html_url: 'https://github.com/owner/repo/issues/10' });
      const http = createMockHttp((url) => {
        if (url.includes('/issues/42')) return makeResponse(200, primary);
        if (url.includes('/issues/10')) return makeResponse(200, related);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.listRelated('42');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('github:owner/repo#10');
    });
  });

  describe('health', () => {
    it('returns HEALTHY on 200', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns DEGRADED on low rate limit', async () => {
      const http = createMockHttp(() =>
        makeResponse(200, {}, { 'x-ratelimit-remaining': '5' }),
      );
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.DEGRADED);
      expect(result.message).toContain('5');
    });

    it('returns UNAVAILABLE on error', async () => {
      const http: IHttpClient = {
        get: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
      };
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });

    it('returns UNAVAILABLE on non-200 status', async () => {
      const http = createMockHttp(() => makeResponse(503));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });
  });

  describe('rate limiting', () => {
    it('throws RATE_LIMITED on 429', async () => {
      let callCount = 0;
      const http = createMockHttp(() => {
        callCount++;
        return callCount === 1 ? makeResponse(200) : makeResponse(429);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await expect(adapter.getIssue('42')).rejects.toMatchObject({ code: IssuesErrorCode.RATE_LIMITED });
    });
  });

  describe('search edge cases', () => {
    it('maps DONE/CLOSED status to closed state', async () => {
      const issues = [makeGitHubIssue({ state: 'closed', state_reason: 'completed' })];
      const http = createMockHttp((url) => {
        if (url.includes('state=closed')) return makeResponse(200, issues);
        return makeResponse(200, []);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({ status: IssueStatus.DONE });
      expect(result.items).toHaveLength(1);
    });

    it('uses cursor for pagination', async () => {
      const http = createMockHttp((url) => {
        if (url.includes('page=2')) return makeResponse(200, [makeGitHubIssue()]);
        return makeResponse(200);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({ cursor: '2' });
      expect(result.items).toHaveLength(1);
    });

    it('throws AUTH_FAILED on 401 during search', async () => {
      let callCount = 0;
      const http = createMockHttp(() => {
        callCount++;
        return callCount === 1 ? makeResponse(200) : makeResponse(401);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await expect(adapter.search({})).rejects.toMatchObject({ code: IssuesErrorCode.AUTH_FAILED });
    });

    it('throws HTTP_ERROR on 500 during search', async () => {
      let callCount = 0;
      const http = createMockHttp(() => {
        callCount++;
        return callCount === 1 ? makeResponse(200) : makeResponse(500);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      await expect(adapter.search({})).rejects.toMatchObject({ code: IssuesErrorCode.HTTP_ERROR });
    });

    it('uses scope maxItems for perPage', async () => {
      const http = createMockHttp((url) => {
        if (url.includes('per_page=5')) return makeResponse(200, [makeGitHubIssue()]);
        return makeResponse(200, []);
      });
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const result = await adapter.search({}, { maxItems: 5 });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('authorization header', () => {
    it('includes Bearer token when provided', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http, 'my-token');
      await adapter.initialize();
      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ Authorization: 'Bearer my-token' }),
      );
    });

    it('omits Authorization when no token', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const adapter = new GitHubApiAdapter(defaultConfig, http);
      await adapter.initialize();
      const call = (http.get as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).not.toHaveProperty('Authorization');
    });
  });
});
