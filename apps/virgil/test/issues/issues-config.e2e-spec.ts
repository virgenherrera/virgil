import { GitHubIssuesConfigSchema } from '../../src/issues/issues-config.schema.js';

describe('GitHubIssuesConfigSchema', () => {
  it('validates with defaults applied', () => {
    const result = GitHubIssuesConfigSchema.parse({ owner: 'acme', repo: 'app' });
    expect(result.owner).toBe('acme');
    expect(result.repo).toBe('app');
    expect(result.baseUrl).toBe('https://api.github.com');
    expect(result.adapterPreference).toBe('api');
    expect(result.perPage).toBe(30);
  });

  it('validates a full config', () => {
    const result = GitHubIssuesConfigSchema.parse({
      owner: 'acme',
      repo: 'app',
      baseUrl: 'https://github.example.com/api/v3',
      adapterPreference: 'cdp',
      credentialRef: { source: 'env', variableName: 'GH_TOKEN' },
      perPage: 50,
    });
    expect(result.baseUrl).toBe('https://github.example.com/api/v3');
    expect(result.adapterPreference).toBe('cdp');
    expect(result.perPage).toBe(50);
    expect(result.credentialRef).toEqual({ source: 'env', variableName: 'GH_TOKEN' });
  });

  it('rejects invalid owner', () => {
    expect(() => GitHubIssuesConfigSchema.parse({ owner: '-invalid', repo: 'app' })).toThrow();
    expect(() => GitHubIssuesConfigSchema.parse({ owner: '', repo: 'app' })).toThrow();
  });

  it('rejects invalid repo', () => {
    expect(() => GitHubIssuesConfigSchema.parse({ owner: 'acme', repo: '' })).toThrow();
    expect(() => GitHubIssuesConfigSchema.parse({ owner: 'acme', repo: 'repo/bad' })).toThrow();
  });

  it('rejects perPage over 100', () => {
    expect(() => GitHubIssuesConfigSchema.parse({ owner: 'acme', repo: 'app', perPage: 101 })).toThrow();
  });

  it('accepts credentialRef variants', () => {
    const keychain = GitHubIssuesConfigSchema.parse({
      owner: 'acme',
      repo: 'app',
      credentialRef: { source: 'keychain', service: 'github', account: 'user' },
    });
    expect(keychain.credentialRef).toEqual({ source: 'keychain', service: 'github', account: 'user' });

    const file = GitHubIssuesConfigSchema.parse({
      owner: 'acme',
      repo: 'app',
      credentialRef: { source: 'file', path: '/tmp/token' },
    });
    expect(file.credentialRef).toEqual({ source: 'file', path: '/tmp/token' });
  });
});
