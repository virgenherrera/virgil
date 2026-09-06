import { GitHubIssueSchema, parseLinkHeader } from '../../src/issues/github-api-response.schema.js';

describe('parseLinkHeader', () => {
  it('returns empty object for null', () => {
    expect(parseLinkHeader(null)).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseLinkHeader('')).toEqual({});
  });

  it('parses a single link', () => {
    const header = '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.github.com/repos/owner/repo/issues?page=2',
    });
  });

  it('parses multiple links (next + prev)', () => {
    const header = '<https://api.github.com/repos/owner/repo/issues?page=3>; rel="next", <https://api.github.com/repos/owner/repo/issues?page=1>; rel="prev"';
    const result = parseLinkHeader(header);
    expect(result.next).toBe('https://api.github.com/repos/owner/repo/issues?page=3');
    expect(result.prev).toBe('https://api.github.com/repos/owner/repo/issues?page=1');
  });

  it('handles malformed parts gracefully', () => {
    const header = 'garbage, <https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"';
    const result = parseLinkHeader(header);
    expect(result.next).toBe('https://api.github.com/repos/owner/repo/issues?page=2');
  });
});

describe('GitHubIssueSchema', () => {
  it('validates a minimal valid issue', () => {
    const minimal = {
      id: 1,
      number: 42,
      title: 'Test',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/42',
      labels: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };
    const result = GitHubIssueSchema.parse(minimal);
    expect(result.id).toBe(1);
    expect(result.number).toBe(42);
    expect(result.title).toBe('Test');
    expect(result.state).toBe('open');
  });

  it('validates a full issue', () => {
    const full = {
      id: 1,
      number: 42,
      title: 'Full test',
      body: 'Issue body',
      state: 'closed',
      state_reason: 'completed',
      html_url: 'https://github.com/owner/repo/issues/42',
      user: { login: 'testuser', id: 1, html_url: 'https://github.com/testuser' },
      assignee: { login: 'dev', id: 2, html_url: 'https://github.com/dev' },
      assignees: [{ login: 'dev', id: 2, html_url: 'https://github.com/dev' }],
      labels: [
        { id: 1, name: 'bug', color: 'ff0000' },
        'enhancement',
      ],
      milestone: {
        id: 1,
        number: 1,
        title: 'v1.0',
        state: 'open',
        html_url: 'https://github.com/owner/repo/milestone/1',
      },
      pull_request: {
        url: 'https://api.github.com/repos/owner/repo/pulls/42',
        html_url: 'https://github.com/owner/repo/pull/42',
      },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      closed_at: '2024-01-03T00:00:00Z',
    };
    const result = GitHubIssueSchema.parse(full);
    expect(result.state_reason).toBe('completed');
    expect(result.assignee?.login).toBe('dev');
    expect(result.milestone?.title).toBe('v1.0');
    expect(result.pull_request?.html_url).toBe('https://github.com/owner/repo/pull/42');
  });

  it('rejects missing required fields', () => {
    expect(() => GitHubIssueSchema.parse({})).toThrow();
    expect(() => GitHubIssueSchema.parse({ id: 1 })).toThrow();
  });
});
