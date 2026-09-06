import { ProviderStatus } from '../../src/shared/provider.types.js';
import { GitHubAdapterSelectorService } from '../../src/issues/github-adapter-selector.service.js';
import { GitHubApiAdapter } from '../../src/issues/github-api.adapter.js';
import { GitHubCdpAdapter } from '../../src/issues/github-cdp.adapter.js';
import type { GitHubIssuesConfig } from '../../src/issues/issues-config.schema.js';
import type { HttpResponse, IHttpClient } from '../../src/issues/issues-http-client.js';
import type { ICdpBrowser } from '../../src/issues/github-cdp.adapter.js';

function makeResponse(status: number, body: unknown = {}, headers: Record<string, string | null> = {}): HttpResponse {
  return {
    status,
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body),
  };
}

function createMockHttp(handler: (url: string) => HttpResponse): IHttpClient {
  return { get: vi.fn(async (url: string) => handler(url)) };
}

function createMockBrowser(): ICdpBrowser {
  return {
    executePom: vi.fn(async () => ({ content: {} })),
    close: vi.fn(async () => {}),
  };
}

const defaultConfig: GitHubIssuesConfig = {
  owner: 'owner',
  repo: 'repo',
  baseUrl: 'https://api.github.com',
  adapterPreference: 'api' as const,
  perPage: 30,
};

describe('GitHubAdapterSelectorService', () => {
  let service: GitHubAdapterSelectorService;

  beforeEach(() => {
    service = new GitHubAdapterSelectorService();
  });

  describe('API preference', () => {
    it('selects API adapter', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const config: GitHubIssuesConfig = { ...defaultConfig, adapterPreference: 'api' as const };
      const result = await service.select(config, http, 'token');
      expect(result.selectedAdapter).toBe('api');
      expect(result.adapter).toBeInstanceOf(GitHubApiAdapter);
      expect(result.reason).toContain('API');
    });
  });

  describe('CDP preference', () => {
    it('selects CDP adapter', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const browser = createMockBrowser();
      const config: GitHubIssuesConfig = { ...defaultConfig, adapterPreference: 'cdp' as const };
      const result = await service.select(config, http, 'token', browser);
      expect(result.selectedAdapter).toBe('cdp');
      expect(result.adapter).toBeInstanceOf(GitHubCdpAdapter);
      expect(result.reason).toContain('CDP');
    });
  });

  describe('AUTO preference', () => {
    it('selects API when it succeeds', async () => {
      const http = createMockHttp(() => makeResponse(200));
      const config: GitHubIssuesConfig = { ...defaultConfig, adapterPreference: 'auto' as const };
      const result = await service.select(config, http, 'token');
      expect(result.selectedAdapter).toBe('api');
      expect(result.reason).toContain('auto');
    });

    it('falls back to CDP when API fails', async () => {
      const http = createMockHttp(() => makeResponse(500));
      const browser = createMockBrowser();
      const config: GitHubIssuesConfig = { ...defaultConfig, adapterPreference: 'auto' as const };
      const result = await service.select(config, http, 'token', browser);
      expect(result.selectedAdapter).toBe('cdp');
      expect(result.reason).toContain('CDP');
    });

    it('throws when both API and CDP fail', async () => {
      const http = createMockHttp(() => makeResponse(500));
      const config: GitHubIssuesConfig = { ...defaultConfig, adapterPreference: 'auto' as const };
      await expect(service.select(config, http, 'token', null)).rejects.toThrow('No adapter available');
    });
  });
});
