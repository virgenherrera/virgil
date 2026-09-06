import { ProviderHealthStatus } from '../../src/contracts/common.types.js';
import { ProviderCapability, ProviderStatus } from '../../src/shared/provider.types.js';
import type { GitHubIssue } from '../../src/issues/github-api-response.schema.js';
import type { ICdpBrowser } from '../../src/issues/github-cdp.adapter.js';
import { GitHubCdpAdapter } from '../../src/issues/github-cdp.adapter.js';
import type { GitHubIssuesConfig } from '../../src/issues/issues-config.schema.js';
import { IssuesError, IssuesErrorCode } from '../../src/issues/issues.errors.js';

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

function createMockBrowser(handler?: (pom: unknown, url: string) => { content: Record<string, unknown> }): ICdpBrowser {
  return {
    executePom: vi.fn(async (pom: unknown, url: string) =>
      handler ? handler(pom, url) : { content: makeGitHubIssue() as unknown as Record<string, unknown> },
    ),
    close: vi.fn(async () => {}),
  };
}

const defaultConfig: GitHubIssuesConfig = {
  owner: 'owner',
  repo: 'repo',
  baseUrl: 'https://api.github.com',
  adapterPreference: 'cdp' as const,
  perPage: 30,
};

describe('GitHubCdpAdapter', () => {
  describe('metadata', () => {
    it('builds correct id and name', () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      expect(adapter.metadata.id).toBe('github-cdp:owner/repo');
      expect(adapter.metadata.name).toBe('GitHub CDP (owner/repo)');
      expect(adapter.metadata.capabilities).toContain(ProviderCapability.ISSUE);
    });

    it('starts as REGISTERED', () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      expect(adapter.status).toBe(ProviderStatus.REGISTERED);
    });
  });

  describe('initialize', () => {
    it('sets CONNECTED with browser', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      expect(adapter.status).toBe(ProviderStatus.CONNECTED);
    });

    it('throws CDP_UNAVAILABLE without browser', async () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      await expect(adapter.initialize()).rejects.toMatchObject({ code: IssuesErrorCode.CDP_UNAVAILABLE });
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('healthCheck', () => {
    it('returns DISCONNECTED without browser', async () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('returns CONNECTED after init with browser', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const status = await adapter.healthCheck();
      expect(status).toBe(ProviderStatus.CONNECTED);
    });
  });

  describe('dispose', () => {
    it('closes browser and sets DISCONNECTED', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      await adapter.dispose();
      expect(browser.close).toHaveBeenCalled();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });

    it('handles null browser on dispose', async () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      await adapter.dispose();
      expect(adapter.status).toBe(ProviderStatus.DISCONNECTED);
    });
  });

  describe('getIssue', () => {
    it('executes POM and normalises result', async () => {
      const issue = makeGitHubIssue();
      const browser = createMockBrowser(() => ({ content: issue as unknown as Record<string, unknown> }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.getIssue('42');
      expect(result.id).toBe('github:owner/repo#42');
      expect(result.title).toBe('Test issue');
      expect(browser.executePom).toHaveBeenCalledWith(
        expect.objectContaining({ targetApp: 'github-issues' }),
        'https://github.com/owner/repo/issues/42',
      );
    });

    it('throws NOT_INITIALISED when not initialized', async () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, createMockBrowser());
      await expect(adapter.getIssue('42')).rejects.toMatchObject({ code: IssuesErrorCode.NOT_INITIALISED });
    });

    it('derives web URL from GitHub Enterprise baseUrl', async () => {
      const ghesConfig: GitHubIssuesConfig = {
        ...defaultConfig,
        baseUrl: 'https://github.example.com/api/v3',
      };
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(ghesConfig, browser);
      await adapter.initialize();
      await adapter.getIssue('42');
      expect(browser.executePom).toHaveBeenCalledWith(
        expect.any(Object),
        'https://github.example.com/owner/repo/issues/42',
      );
    });
  });

  describe('search', () => {
    it('builds query and executes POM', async () => {
      const issue = makeGitHubIssue();
      const browser = createMockBrowser(() => ({
        content: { issues: [issue] },
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.search({ text: 'bug' });
      expect(result.items).toHaveLength(1);
      expect(browser.executePom).toHaveBeenCalledWith(
        expect.objectContaining({ targetApp: 'github-issues-list' }),
        expect.stringContaining('github.com/owner/repo/issues'),
      );
    });

    it('returns empty items when no issues', async () => {
      const browser = createMockBrowser(() => ({
        content: { issues: [] },
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.search({});
      expect(result.items).toHaveLength(0);
    });

    it('builds query with status filter', async () => {
      const browser = createMockBrowser(() => ({
        content: { issues: [] },
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.search({ status: 'open' as never });
      expect(result.items).toHaveLength(0);
      expect(browser.executePom).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('is%3Aopen'),
      );
    });

    it('builds query with labels', async () => {
      const browser = createMockBrowser(() => ({
        content: { issues: [] },
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.search({ labels: ['bug', 'urgent'] });
      expect(result.items).toHaveLength(0);
    });

    it('builds query with status and text', async () => {
      const browser = createMockBrowser(() => ({
        content: { issues: [] },
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.search({ text: 'error', status: 'closed' as never });
      expect(result.items).toHaveLength(0);
    });

    it('respects scope maxItems', async () => {
      const browser = createMockBrowser((pom) => {
        expect((pom as { extractionSteps: Array<{ maxItems: number }> }).extractionSteps[0].maxItems).toBe(5);
        return { content: { issues: [] } };
      });
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      await adapter.search({}, { maxItems: 5 });
    });
  });

  describe('listRelated', () => {
    it('follows references from primary issue', async () => {
      const primary = makeGitHubIssue({
        body: 'Related to https://github.com/owner/repo/issues/10',
      });
      const related = makeGitHubIssue({
        number: 10,
        html_url: 'https://github.com/owner/repo/issues/10',
      });
      let callCount = 0;
      const browser = createMockBrowser(() => {
        callCount++;
        if (callCount === 1) return { content: primary as unknown as Record<string, unknown> };
        return { content: related as unknown as Record<string, unknown> };
      });
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.listRelated('42');
      expect(result.items).toHaveLength(1);
    });

    it('skips unresolvable related issues', async () => {
      const primary = makeGitHubIssue({
        body: 'Related to https://github.com/owner/repo/issues/10',
      });
      let callCount = 0;
      const browser = createMockBrowser(() => {
        callCount++;
        if (callCount === 1) return { content: primary as unknown as Record<string, unknown> };
        throw new Error('not found');
      });
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.listRelated('42');
      expect(result.items).toHaveLength(0);
    });

    it('respects scope maxItems for related', async () => {
      const primary = makeGitHubIssue({ body: null });
      const browser = createMockBrowser(() => ({
        content: primary as unknown as Record<string, unknown>,
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.listRelated('42', { maxItems: 1 });
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('parseIssueId', () => {
    it('parses owner/repo#N format', async () => {
      const issue = makeGitHubIssue();
      const browser = createMockBrowser(() => ({
        content: issue as unknown as Record<string, unknown>,
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.getIssue('owner/repo#42');
      expect(result.id).toBe('github:owner/repo#42');
    });

    it('parses URL format', async () => {
      const issue = makeGitHubIssue();
      const browser = createMockBrowser(() => ({
        content: issue as unknown as Record<string, unknown>,
      }));
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.getIssue('https://github.com/owner/repo/issues/42');
      expect(result.id).toBe('github:owner/repo#42');
    });

    it('throws PARSE_ERROR for invalid ID', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      await expect(adapter.getIssue('invalid-id')).rejects.toMatchObject({ code: IssuesErrorCode.PARSE_ERROR });
    });
  });

  describe('health', () => {
    it('returns UNAVAILABLE without browser', async () => {
      const adapter = new GitHubCdpAdapter(defaultConfig, null);
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.UNAVAILABLE);
      expect(result.message).toContain('not available');
    });

    it('returns HEALTHY when connected', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      await adapter.initialize();
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.HEALTHY);
    });

    it('returns UNAVAILABLE when not connected', async () => {
      const browser = createMockBrowser();
      const adapter = new GitHubCdpAdapter(defaultConfig, browser);
      // not initialized, so status is REGISTERED, health should be UNAVAILABLE
      const result = await adapter.health();
      expect(result.status).toBe(ProviderHealthStatus.UNAVAILABLE);
    });
  });
});
